// ================================
// QikHUB server
// Serves the app from /public and proxies AI requests to OpenAI
// or Claude so your API key never reaches the browser.
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      // Extra room because some OpenAI models spend tokens thinking first
      max_completion_tokens: maxTokens * 3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent }
      ],
      tools: [{
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.input_schema }
      }],
      tool_choice: { type: "function", function: { name: tool.name } }
    })
  });

  const data = await response.json().catch(() => ({}));

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


// ---------- router ----------

const routes = {
  "POST /api/identify": handleIdentify,
  "POST /api/inspire": handleInspire
};

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");

  try {
    if (req.method === "GET" && pathname === "/api/health") {
      sendJSON(res, 200, { ok: true, ai: Boolean(API_KEY), model: API_KEY ? MODEL : null });
      return;
    }

    const handler = routes[`${req.method} ${pathname}`];

    if (handler) {
      if (!API_KEY) throw httpError(503, "AI is off: add OPENAI_API_KEY to the .env file and restart the server.");
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
    ? `   AI: on (${PROVIDER}, ${MODEL})\n`
    : "   AI: OFF. Add OPENAI_API_KEY to .env to turn on Identify + Inspire.\n");
});
