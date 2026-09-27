// ================================
// QikHUB server
// Serves the app from /public and proxies AI requests to OpenAI
// or Claude so your API key never reaches the browser.
// Everything is behind a password (APP_PASSWORD).
//
//   npm start          → http://localhost:3000
//
// No dependencies: needs Node 18 or newer.
// ================================

import http from "node:http";
import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
// Use whichever key is in .env. OpenAI wins if both are set.
const PROVIDER = process.env.OPENAI_API_KEY ? "openai"
  : process.env.ANTHROPIC_API_KEY ? "anthropic"
  : null;

const PROVIDERS = {
  openai: {
    key: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-6-luna",
    url: (process.env.OPENAI_BASE_URL || "https://api.openai.com") + "/v1/chat/completions"
  },
  anthropic: {
    key: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    url: (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com") + "/v1/messages"
  }
};

const API_KEY = PROVIDER ? PROVIDERS[PROVIDER].key : "";
const MODEL = PROVIDER ? PROVIDERS[PROVIDER].model : null;
// Works whether the web files are in a "public" folder or next to server.js
const PUBLIC_DIR = existsSync(path.join(__dirname, "public", "index.html"))
  ? path.join(__dirname, "public")
  : __dirname;

// Never hand these out, even if they sit next to the web files
const PRIVATE_FILES = new Set(["server.js", "package.json", "package-lock.json"]);
const MAX_BODY_BYTES = 12 * 1024 * 1024;

const CATEGORIES = [
  "Microcontroller", "Motor", "Sensor", "LED / Lighting", "Power",
  "Switch / Button", "Module", "Connector", "Salvaged", "Other"
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json"
};


// ---------- .env loader (tiny, so we don't need the dotenv package) ----------

function loadEnvFile(file) {
  if (!existsSync(file)) return;

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);

    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}


// ---------- AI providers ----------
// Both handlers describe the request the same way:
//   content = [{ type: "image", mediaType, data }, { type: "text", text }]
//   tool    = { name, description, input_schema }
// askAI forces the model to "call" the tool, which makes it answer with
// JSON matching the schema, then returns that JSON.

async function askAI(request) {
  return PROVIDER === "openai" ? askOpenAI(request) : askClaude(request);
}

async function askOpenAI({ system, content, tool, maxTokens = 1500 }) {
  const { key, model, url } = PROVIDERS.openai;

  const userContent = content.map(part => part.type === "image"
    ? { type: "image_url", image_url: { url: `data:${part.mediaType};base64,${part.data}` } }
    : { type: "text", text: part.text });

  const body = {
    model,
    max_completion_tokens: maxTokens * 2,
    // Newer GPT models only allow function tools on this endpoint with
    // reasoning switched off. Older models don't know this setting, so
    // it's removed and the request retried if OpenAI rejects it.
    reasoning_effort: "none",
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent }
    ],
    tools: [{
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.input_schema }
    }],
    tool_choice: { type: "function", function: { name: tool.name } }
  };

  const send = () => fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  let response = await send();
  let data = await response.json().catch(() => ({}));

  if (response.status === 400 && /reasoning_effort|reasoning effort/i.test(data?.error?.message || "")
      && !/set reasoning_effort to "none"/i.test(data?.error?.message || "")) {
    delete body.reasoning_effort;
    response = await send();
    data = await response.json().catch(() => ({}));
  }

  if (!response.ok) {
    const message = data?.error?.message || `OpenAI API returned ${response.status}`;
    console.error("OpenAI API error:", response.status, message);
    throw httpError(502, response.status === 401
      ? "The server's OpenAI API key was rejected. Check OPENAI_API_KEY in .env."
      : response.status === 429
        ? "OpenAI says you're out of credit or sending too fast. Check your billing at platform.openai.com."
        : `AI request failed: ${message}`);
  }

  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw httpError(502, "AI returned no result. Try again.");

  try {
    return JSON.parse(call.function.arguments);
  } catch {
    throw httpError(502, "AI returned an unreadable answer. Try again.");
  }
}

async function askClaude({ system, content, tool, maxTokens = 1500 }) {
  const { key, model, url } = PROVIDERS.anthropic;

  const userContent = content.map(part => part.type === "image"
    ? { type: "image", source: { type: "base64", media_type: part.mediaType, data: part.data } }
    : { type: "text", text: part.text });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: userContent }]
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || `Claude API returned ${response.status}`;
    console.error("Claude API error:", response.status, message);
    throw httpError(502, response.status === 401
      ? "The server's Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env."
      : `AI request failed: ${message}`);
  }

  const block = (data.content || []).find(b => b.type === "tool_use");
  if (!block) throw httpError(502, "AI returned no result. Try again.");

  return block.input;
}


// ---------- /api/identify ----------

const identifyTool = {
  name: "record_component",
  description: "Record the identified electronic component for the user's inventory.",
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Specific, searchable name, e.g. 'HC-SR04 Ultrasonic Sensor' or 'Arduino Nano (clone, CH340)'. Include part numbers you can read."
      },
      category: { type: "string", enum: CATEGORIES },
      description: { type: "string", description: "One or two plain sentences: what it is and what it does." },
      specs: { type: "string", description: "Key specs a maker needs: operating voltage, interface, pin count, ratings. Empty string if unknown." },
      tips: { type: "string", description: "One practical tip or gotcha for using it. Empty string if none." },
      projectIdeas: {
        type: "array",
        items: { type: "string" },
        description: "Up to 3 short project ideas this part is good for."
      },
      count: { type: "integer", description: "How many of this part are visible in the photo (at least 1)." },
      confidence: { type: "string", enum: ["high", "medium", "low"] }
    },
    required: ["name", "category", "description", "specs", "tips", "projectIdeas", "count", "confidence"]
  }
};

async function handleIdentify(body) {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(body.image || "");
  if (!match) throw httpError(400, "Send the photo as a base64 image data URL.");

  const result = await askAI({
    system:
      "You identify electronic components, modules, dev boards and salvaged parts from photos " +
      "for a hobby maker's inventory app. Read any visible markings, part numbers and silkscreen. " +
      "If the photo is blurry or ambiguous, give your best guess and set confidence to low. " +
      "If it is not an electronic part at all, say what it is, use category 'Other' and confidence 'low'.",
    content: [
      { type: "image", mediaType: match[1], data: match[2] },
      { type: "text", text: "What component is this? Record it with the record_component tool." }
    ],
    tool: identifyTool,
    maxTokens: 800
  });

  return {
    name: clean(result.name, 120) || "Unknown component",
    category: CATEGORIES.includes(result.category) ? result.category : "Other",
    description: clean(result.description, 500),
    specs: clean(result.specs, 400),
    tips: clean(result.tips, 300),
    projectIdeas: cleanList(result.projectIdeas, 3, 80),
    count: Math.min(Math.max(parseInt(result.count, 10) || 1, 1), 999),
    confidence: ["high", "medium", "low"].includes(result.confidence) ? result.confidence : "low"
  };
}


// ---------- /api/inspire ----------

const inspireTool = {
  name: "suggest_projects",
  description: "Suggest projects the user could build from their inventory.",
  input_schema: {
    type: "object",
    properties: {
      ideas: {
        type: "array",
        description: "Exactly 3 project suggestions.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short, fun project name." },
            summary: { type: "string", description: "One or two sentences on what it does." },
            difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
            uses: {
              type: "array",
              items: { type: "string" },
              description: "Items from the user's inventory this uses. Copy the names EXACTLY as written in the inventory."
            },
            missing: {
              type: "array",
              items: { type: "string" },
              description: "Parts they'd still need to get, if any. Keep this short."
            },
            firstStep: { type: "string", description: "A concrete first thing to do in the next 15 minutes." }
          },
          required: ["title", "summary", "difficulty", "uses", "missing", "firstStep"]
        }
      }
    },
    required: ["ideas"]
  }
};

async function handleInspire(body) {
  const inventory = Array.isArray(body.inventory) ? body.inventory.slice(0, 200) : [];
  if (!inventory.length) throw httpError(400, "Inventory is empty.");

  const inventoryText = inventory.map(item =>
    `- ${clean(item.name, 120)} [${clean(item.category, 40)}] ×${Number(item.quantity) || 1}` +
    (item.notes ? ` — ${clean(item.notes, 160)}` : "")
  ).join("\n");

  const ideas = cleanList(body.ideas, 10, 200);
  const avoid = cleanList(body.avoid, 12, 120);

  const prompt = [
    "Here is everything in my parts bin:",
    inventoryText,
    ideas.length ? `\nThings I've said I want to make someday:\n${ideas.map(i => `- ${i}`).join("\n")}` : "",
    avoid.length ? `\nDon't repeat these suggestions I've already seen:\n${avoid.map(i => `- ${i}`).join("\n")}` : "",
    "\nSuggest 3 projects I could build. Favour projects I can finish mostly with what I already own.",
    "Mix difficulty levels, and if one of my someday ideas is doable with these parts, include it."
  ].join("\n");

  const result = await askAI({
    system:
      "You are QikHUB, an upbeat, practical assistant for hobby electronics makers. " +
      "You suggest specific, achievable builds based on the parts someone already owns. " +
      "Be concrete (name the sensors, pins or techniques involved), never suggest anything dangerous " +
      "such as mains-voltage wiring without a clear safety warning, and keep the 'missing' list to cheap, common parts.",
    content: [{ type: "text", text: prompt }],
    tool: inspireTool,
    maxTokens: 1500
  });

  const suggestions = (Array.isArray(result.ideas) ? result.ideas : []).slice(0, 3).map(s => ({
    title: clean(s.title, 100) || "Untitled build",
    summary: clean(s.summary, 400),
    difficulty: ["Easy", "Medium", "Hard"].includes(s.difficulty) ? s.difficulty : "Medium",
    uses: cleanList(s.uses, 10, 120),
    missing: cleanList(s.missing, 8, 120),
    firstStep: clean(s.firstStep, 300)
  }));

  if (!suggestions.length) throw httpError(502, "AI didn't return any ideas. Try again.");

  return { ideas: suggestions };
}


// ---------- helpers ----------

function clean(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanList(value, maxItems, maxLength) {
  return (Array.isArray(value) ? value : [])
    .map(v => clean(v, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function sendJSON(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readJSONBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(httpError(413, "That photo is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(httpError(400, "Invalid JSON."));
      }
    });

    req.on("error", reject);
  });
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));

  const name = path.basename(filePath);

  // Block ../ tricks, hidden files like .env, and the server's own files
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) || name.startsWith(".") || PRIVATE_FILES.has(name)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}


// ---------- login + security ----------
//
// APP_PASSWORD   the password you type to get in (required)
// SESSION_SECRET optional; changing it (or the password) logs everyone out

const APP_PASSWORD = process.env.APP_PASSWORD || "";
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 30;
const AI_CALLS_PER_HOUR = Number(process.env.AI_CALLS_PER_HOUR) || 60;
const LOGIN_ATTEMPTS = 5;               // wrong passwords allowed...
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // ...per 15 minutes, per device

const SESSION_KEY = crypto.createHash("sha256")
  .update(`${process.env.SESSION_SECRET || ""}|${APP_PASSWORD}|qikhub-session`)
  .digest();

const COOKIE = "qik_session";

function sign(value) {
  return crypto.createHmac("sha256", SESSION_KEY).update(value).digest("base64url");
}

function makeSessionCookie(req) {
  const expires = Date.now() + SESSION_DAYS * 86400000;
  const nonce = crypto.randomBytes(9).toString("base64url");
  const value = `${expires}.${nonce}`;
  return cookieHeader(req, `${value}.${sign(value)}`, SESSION_DAYS * 86400);
}

function cookieHeader(req, value, maxAge) {
  const secure = isHttps(req) ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function isHttps(req) {
  return (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

function isLoggedIn(req) {
  const [expires, nonce, signature] = readCookie(req, COOKIE).split(".");
  if (!expires || !nonce || !signature) return false;
  if (Number(expires) < Date.now()) return false;
  return safeEqual(signature, sign(`${expires}.${nonce}`));
}

// Compares without leaking how many characters matched
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function clientIP(req) {
  // Render and most hosts put the real visitor address first in this header
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || req.socket.remoteAddress || "unknown";
}

// Simple in-memory counters: { key → [timestamps] }
function makeLimiter(max, windowMs) {
  const hits = new Map();

  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, times] of hits) {
      const recent = times.filter(t => t > cutoff);
      if (recent.length) hits.set(key, recent); else hits.delete(key);
    }
  }, 60000).unref();

  return {
    blocked(key) {
      const cutoff = Date.now() - windowMs;
      return (hits.get(key) || []).filter(t => t > cutoff).length >= max;
    },
    hit(key) {
      hits.set(key, [...(hits.get(key) || []), Date.now()]);
    },
    reset(key) {
      hits.delete(key);
    }
  };
}

const loginLimiter = makeLimiter(LOGIN_ATTEMPTS, LOGIN_WINDOW_MS);
const aiLimiter = makeLimiter(AI_CALLS_PER_HOUR, 60 * 60 * 1000);

// Blocks other websites from making your browser send requests here
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function readFormBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 10000) { req.destroy(); reject(httpError(413, "Too large.")); }
    });
    req.on("end", () => resolve(new URLSearchParams(data)));
    req.on("error", reject);
  });
}

function redirect(res, location, headers = {}) {
  res.writeHead(303, { Location: location, "Cache-Control": "no-store", ...headers });
  res.end();
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  // "same-origin" (not "no-referrer") so browsers still tell us a form came from this site
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "geolocation=(), microphone=()",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'"
};

function loginPage({ error = "", notice = "" } = {}) {
  const message = error || notice;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#111318">
<meta name="robots" content="noindex">
<title>QikHUB · Sign in</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 20px;
    background: radial-gradient(circle at top right, #172217 0, transparent 35%), #0c0e12;
    color: #f5f7fa; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  form {
    width: min(380px, 100%); padding: 30px;
    background: #15181f; border: 1px solid #292e39; border-radius: 20px;
  }
  .logo { font-size: 30px; font-weight: 900; letter-spacing: -1px; }
  .logo span { color: #a7ff3f; }
  .tagline { font-size: 9px; letter-spacing: 2px; color: #8d95a5; margin-bottom: 26px; }
  label { display: block; color: #8d95a5; font-size: 13px; }
  input {
    width: 100%; margin-top: 6px; padding: 14px; font: inherit;
    background: #1b1f28; color: #f5f7fa; border: 1px solid #292e39; border-radius: 12px; outline: none;
  }
  input:focus { border-color: #a7ff3f; }
  button {
    width: 100%; margin-top: 16px; padding: 14px; font: inherit; font-weight: 900; cursor: pointer;
    border: none; border-radius: 12px; background: #a7ff3f; color: #10140b;
  }
  .message {
    margin: 0 0 16px; padding: 12px; border-radius: 10px; font-size: 14px;
    background: ${error ? "rgba(255,107,107,0.12)" : "rgba(167,255,63,0.1)"};
    color: ${error ? "#ff6b6b" : "#a7ff3f"};
  }
</style>
</head>
<body>
  <form method="post" action="/login">
    <div class="logo">Qik<span>HUB</span></div>
    <div class="tagline">INVENTORY • INSPIRE • CREATE</div>
    ${message ? `<p class="message">${message}</p>` : ""}
    <label>Password
      <input type="password" name="password" autocomplete="current-password" required autofocus>
    </label>
    <button type="submit">Unlock</button>
  </form>
</body>
</html>`;
}

function sendHTML(res, status, html, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(html);
}

async function handleLogin(req, res) {
  const ip = clientIP(req);

  if (loginLimiter.blocked(ip)) {
    sendHTML(res, 429, loginPage({ error: "Too many wrong tries. Wait 15 minutes and try again." }));
    return;
  }

  const form = await readFormBody(req);
  const password = form.get("password") || "";

  if (APP_PASSWORD && safeEqual(password, APP_PASSWORD)) {
    loginLimiter.reset(ip);
    redirect(res, "/", { "Set-Cookie": makeSessionCookie(req) });
    return;
  }

  loginLimiter.hit(ip);
  console.warn(`Failed login from ${ip}`);

  // A small pause makes guessing even slower
  await new Promise(r => setTimeout(r, 800));
  redirect(res, "/login?error=1");
}


// ---------- router ----------

const routes = {
  "POST /api/identify": handleIdentify,
  "POST /api/inspire": handleInspire
};

const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, "http://localhost");

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);

  try {
    // Some privacy settings make browsers send "Origin: null" on form posts;
    // that's harmless for the login form itself, so only it is allowed through.
    const loginPost = pathname === "/login" && req.method === "POST" && req.headers.origin === "null";

    if (req.method !== "GET" && req.method !== "HEAD" && !sameOrigin(req) && !loginPost) {
      throw httpError(403, "Request blocked.");
    }

    // ----- public: login / logout -----

    if (!APP_PASSWORD) {
      sendHTML(res, 503, loginPage({
        error: "QikHUB is locked because no password is set. Add APP_PASSWORD to the server's environment settings, then restart it."
      }));
      return;
    }

    if (pathname === "/login" && req.method === "GET") {
      if (isLoggedIn(req)) return redirect(res, "/");
      sendHTML(res, 200, loginPage({
        error: searchParams.has("error") ? "Wrong password." : "",
        notice: searchParams.has("out") ? "You're signed out." : ""
      }));
      return;
    }

    if (pathname === "/login" && req.method === "POST") {
      await handleLogin(req, res);
      return;
    }

    if (pathname === "/logout") {
      redirect(res, "/login?out=1", { "Set-Cookie": cookieHeader(req, "", 0) });
      return;
    }

    // ----- everything below needs a login -----

    if (!isLoggedIn(req)) {
      if (pathname.startsWith("/api/")) throw httpError(401, "Please sign in again.");
      redirect(res, "/login");
      return;
    }

    if (req.method === "GET" && pathname === "/api/health") {
      sendJSON(res, 200, { ok: true, ai: Boolean(API_KEY), model: API_KEY ? MODEL : null });
      return;
    }

    const handler = routes[`${req.method} ${pathname}`];

    if (handler) {
      if (!API_KEY) throw httpError(503, "AI is off: add OPENAI_API_KEY to the server's settings and restart it.");

      const ip = clientIP(req);
      if (aiLimiter.blocked(ip)) {
        throw httpError(429, `That's ${AI_CALLS_PER_HOUR} AI requests this hour. Take a breather and try again soon.`);
      }
      aiLimiter.hit(ip);

      const body = await readJSONBody(req);
      sendJSON(res, 200, await handler(body));
      return;
    }

    if (pathname.startsWith("/api/")) throw httpError(404, "Unknown API route.");

    if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(req, res, pathname);
      return;
    }

    throw httpError(405, "Method not allowed.");
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500 && !err.status) console.error(err);
    if (res.headersSent) return res.end();
    sendJSON(res, status, { error: err.status ? err.message : "Something went wrong on the server." });
  }
});

server.listen(PORT, HOST, () => {
  console.log("\n⚡ QikHUB is running");
  console.log(`   On this computer:  http://localhost:${PORT}`);

  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const a of addresses || []) {
      if (a.family === "IPv4" && !a.internal) {
        console.log(`   On your phone:     http://${a.address}:${PORT}  (same Wi-Fi)`);
      }
    }
  }

  console.log(API_KEY
    ? `   AI: on (${PROVIDER}, ${MODEL})`
    : "   AI: OFF. Add OPENAI_API_KEY to turn on Identify + Inspire.");

  console.log(APP_PASSWORD
    ? "   Login: password required ✓\n"
    : "   Login: NO PASSWORD SET. The app stays locked until you add APP_PASSWORD.\n");

  if (APP_PASSWORD && APP_PASSWORD.length < 10) {
    console.warn("   ⚠ APP_PASSWORD is short. Use at least 10 characters.\n");
  }
});
