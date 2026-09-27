# QikHUB

AI-powered maker inventory, inspiration engine, and project workspace.
Catalog what you own. Discover what you can build. Turn ideas into creations.

## What's in v0.2

- **Inventory**: add, search, adjust quantities, see which projects use each part.
- **Identify**: snap a photo of a mystery component and the AI identifies it, fills in
  the category, specs and notes, and adds it to your inventory (or bumps the count if
  you already have it).
- **Inspire Me**: three build suggestions based on what you own, showing what you
  already have, what you'd need, and a first step. Uses AI when the server is
  running with an API key; otherwise falls back to the offline build library in
  `public/recipes.js`.
- **Projects**: start a project from a suggestion, from an idea ("Build it"), or from
  scratch. Each project has a status (Planning / Building / Done), linked inventory
  parts, a "need to get" list (tick ✓ when you buy something and it goes straight into
  your inventory), and a task checklist with progress.

Everything is saved in your browser's localStorage, so each device keeps its own data.

## Project layout

```
qikhub/
├── server.js        ← tiny Node server: serves the app + talks to the AI
├── package.json
├── .env.example     ← copy to .env and add your API key
└── public/
    ├── index.html
    ├── style.css
    ├── app.js
    └── recipes.js   ← offline project library (add your own!)
```

## Running it

You need [Node.js](https://nodejs.org) 18 or newer. There are no packages to install.

1. Get an OpenAI API key at https://platform.openai.com/api-keys (make sure your
   account has billing set up).
2. In the `qikhub` folder, copy `.env.example` to `.env` and paste your key:
   ```
   OPENAI_API_KEY=sk-...
   ```
3. Start it:
   ```
   npm start
   ```
4. Open the address it prints. `http://localhost:3000` works on the computer; the
   "On your phone" address works from a phone on the same Wi-Fi, so you can use the
   camera to identify parts.

The badge in the top-right says **AI ON** when everything is connected.

### Without the server

You can still open `public/index.html` directly. Inventory, ideas, projects and the
offline Inspire Me all work; Identify is disabled until the server is running.

## Why a server?

The API key has to stay secret. If it were in `app.js`, anyone who opened the page
could copy it and spend your credits. The server keeps the key and only exposes two
endpoints to the app:

| Endpoint | Sends | Gets back |
|---|---|---|
| `POST /api/identify` | `{ image: "data:image/jpeg;base64,..." }` | name, category, description, specs, tips, count, confidence |
| `POST /api/inspire` | `{ inventory: [...], ideas: [...], avoid: [...] }` | `{ ideas: [ { title, summary, difficulty, uses, missing, firstStep } ] }` |
| `GET /api/health` | | `{ ai: true/false }` |

Photos are shrunk to 1280px in the browser before upload, so each identification is
quick and cheap.

## Settings (`.env`)

| Variable | Default | |
|---|---|---|
| `OPENAI_API_KEY` | none | Turns on AI features |
| `OPENAI_MODEL` | `gpt-6-luna` | Any OpenAI model with image input and function calling |
| `ANTHROPIC_API_KEY` | none | Use Claude instead (only if no OpenAI key is set) |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | |
| `APP_PASSWORD` | none | **Required.** The password to get into QikHUB. The app stays locked until it's set. |
| `AI_CALLS_PER_HOUR` | `60` | Cap on AI requests per device, to protect your credit |
| `SESSION_DAYS` | `30` | How long you stay signed in |
| `PORT` | `3000` | |

**Never commit `.env`.** It's already listed in `.gitignore`.

## Security

- Every page and API route needs a sign-in with `APP_PASSWORD`. Sessions use a signed,
  HttpOnly cookie; changing the password signs everyone out.
- 5 wrong passwords from one device locks it out for 15 minutes.
- AI requests are capped per hour (`AI_CALLS_PER_HOUR`).
- Requests from other websites are blocked, and `server.js`, `package.json` and
  dot-files like `.env` are never served.
- Still set a monthly spending limit in your OpenAI billing settings as a backstop.

## Putting it online

It runs as-is on
hosts that run Node apps (Render, Railway, Fly.io, a Raspberry Pi); set
`OPENAI_API_KEY` and `APP_PASSWORD` in the host's environment settings instead of a
`.env` file.
