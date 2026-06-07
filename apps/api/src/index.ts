import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";

import { attachCoachingHandlers } from "./ws/coaching.js";
import { attachLiveHandlers } from "./ws/live.js";
import { router as sessionRouter } from "./routes/session.js";
import { mockRouter } from "./routes/mock.js";

import { listModels } from "./services/gemini-models.js";
import { geminiSmoke } from "./services/gemini-smoke.js";

// --------- tiny logger ----------
const levels = ["silent", "error", "warn", "info", "debug"] as const;
type LogLevel = (typeof levels)[number];

const rawLevel = (process.env.LOG_LEVEL || "info").toLowerCase();
const LOG_LEVEL: LogLevel = (levels.includes(rawLevel as LogLevel) ? (rawLevel as LogLevel) : "info");
const enabled = new Set<LogLevel>(levels.slice(0, levels.indexOf(LOG_LEVEL) + 1));

function log(level: LogLevel, msg: string, meta?: Record<string, any>) {
  if (!enabled.has(level)) return;
  const ts = new Date().toISOString();
  const line = meta ? `${msg} ${JSON.stringify(meta)}` : msg;
  // eslint-disable-next-line no-console
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    `[${ts}] [${level}] ${line}`
  );
}
// --------------------------------

const app = express();
app.use(cors());

// ⬇️ allow larger transcripts in POST bodies
app.use(express.json({ limit: "2mb" }));

// request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durMs = Number(process.hrtime.bigint() - start) / 1e6;
    log("info", `${req.method} ${req.originalUrl}`, {
      status: res.statusCode,
      ms: Math.round(durMs),
      ip: req.ip,
    });
  });
  next();
});

// Health
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// Helper to unwrap Promise.allSettled cleanly
function toJson<T>(s: PromiseSettledResult<T>) {
  if (s.status === "fulfilled") return s.value;
  const r = s as PromiseRejectedResult;
  return { error: String(r.reason) };
}

// List models (tries v1 and v1beta)
app.get("/smoke/models", async (_req, res) => {
  try {
    const [v1, v1b] = await Promise.allSettled([listModels("v1"), listModels("v1beta")]);
    res.json({ ok: true, v1: toJson(v1), v1beta: toJson(v1b) });
  } catch (e: any) {
    log("error", "smoke/models failed", { err: e?.message || String(e) });
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Demo text call (optional ?model=models/your-model)
app.get("/smoke/gemini", async (req, res) => {
  try {
    const model = typeof req.query.model === "string" ? req.query.model : undefined;
    const text = await geminiSmoke(model);
    res.json({ ok: true, text });
  } catch (e: any) {
    log("error", "smoke/gemini failed", { err: e?.message || String(e) });
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// REST routes
app.use("/session", sessionRouter);
app.use("/mock", mockRouter);


// ---------- HTTP + WebSocket ----------
const server = http.createServer(app);

// Create WS servers (noServer) and attach handlers
const wssCoach = new WebSocketServer({ noServer: true, perMessageDeflate: true });
const wssLive = new WebSocketServer({ noServer: true, perMessageDeflate: true });

attachCoachingHandlers(wssCoach);
attachLiveHandlers(wssLive);

log("info", "[ws] /ws/coaching ready (noServer)");
log("info", "[ws] /ws/live ready (noServer)");

// Route upgrades to the right WS server + log
server.on("upgrade", (req, socket, head) => {
  const url = req.url || "";
  log("debug", "upgrade", { url, headers: req.headers["sec-websocket-protocol"] || "" });

  const accept = (wss: WebSocketServer, name: string) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      log("info", `WS connected: ${name}`, { ip: (req.socket as any).remoteAddress });
      wss.emit("connection", ws, req);
      ws.on("close", (code, reason) =>
        log("info", `WS closed: ${name}`, { code, reason: reason.toString() })
      );
      ws.on("error", (err) => log("warn", `WS error: ${name}`, { err: err?.message || String(err) }));
    });
  };

  if (url.startsWith("/ws/coaching")) accept(wssCoach, "coaching");
  else if (url.startsWith("/ws/live")) accept(wssLive, "live");
  else socket.destroy();
});

// global error listeners (helps catch unhandled stuff)
process.on("uncaughtException", (e) => log("error", "uncaughtException", { err: String(e) }));
process.on("unhandledRejection", (e) => log("error", "unhandledRejection", { err: String(e) }));

const PORT = process.env.PORT || 8787;
server.listen(PORT, () => {
  log("info", `[api] listening on http://localhost:${PORT}`, {
    LOG_LEVEL,
    lang: process.env.SPEECH_LANGUAGE,
    creds: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });
  // quick boot echo to confirm env wiring
  console.log("[boot] GOOGLE_APPLICATION_CREDENTIALS =", process.env.GOOGLE_APPLICATION_CREDENTIALS);
});
