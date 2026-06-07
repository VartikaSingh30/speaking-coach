// apps/api/src/ws/coaching.ts
import { WebSocketServer, WebSocket } from "ws";

/**
 * Rolling WPM over a sliding window of recent text events.
 * Each event is { t: msSinceStart, text: string }. We only count words added in that event.
 */
function rollingWpm(tokens: { t: number; text: string }[], windowMs = 10_000): number {
  if (!tokens.length) return 0;
  const now = tokens[tokens.length - 1].t;
  const recent = tokens.filter((x) => x.t >= now - windowMs);
  const words = recent
    .map((x) => x.text.trim().split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => a + b, 0);
  return Math.round(words / (windowMs / 60000));
}

// A broader filler list (still lightweight)
const FILLERS = [
  "um","uh","uhh","uhhh","erm","er","like","you know","sort of","kind of",
  "actually","basically","literally","i mean","you see","you see,","ok","okay","so,","well,"
];

function detectFillers(text: string): string[] {
  const lower = text.toLowerCase();
  return FILLERS.filter((f) => {
    const esc = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // word boundary where it makes sense; some fillers include punctuation
    return new RegExp(`(^|\\b)${esc}(\\b|$)`).test(lower);
  });
}

type ClientMsg = { t: number; kind: "partial" | "final"; text?: string };

// Stable, non-spammy nudge builder
function buildNudges(wpm: number, fillerPerMin: number): string[] {
  const tips: string[] = [];
  if (wpm > 185) tips.push("Slow down slightly");
  else if (wpm < 120 && wpm > 0) tips.push("Increase pace a bit");

  if (fillerPerMin > 10) tips.push("Pause briefly instead of ‘um’/‘uh’");
  else if (fillerPerMin > 6) tips.push("Fewer fillers: add small pauses");

  return tips.slice(0, 2);
}

export function attachCoachingHandlers(wss: WebSocketServer) {
  console.log("[ws] /ws/coaching ready");

  wss.on("connection", (ws: WebSocket) => {
    let startedAt = Date.now();
    const events: { t: number; text: string }[] = [];
    let fillerCount = 0;

    // Memory cap to avoid unbounded growth (keep ~2 minutes of events at 250ms cadence)
    const MAX_EVENTS = 1200;

    // Heartbeat to close dead connections
    let alive = true;
    ws.on("pong", () => { alive = true; });
    const hb = setInterval(() => {
      if (!alive) {
        try { ws.terminate(); } catch {}
        return;
      }
      alive = false;
      try { ws.ping(); } catch {}
    }, 15_000);

    ws.on("message", (raw) => {
      try {
        const data: ClientMsg = JSON.parse(raw.toString());
        if (!data || (data.kind !== "partial" && data.kind !== "final")) return;

        const t = typeof data.t === "number" ? data.t : Date.now() - startedAt;
        const text = (data.text || "").trim();
        if (!text) return;

        // Track event
        events.push({ t, text });
        if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);

        // Count fillers from the snippet only (not full transcript)
        fillerCount += detectFillers(text).length;

        // Rolling metrics
        const wpm = rollingWpm(events, 10_000);
        const elapsed = Math.max(t, 1);
        const fillerPerMin = Math.round((fillerCount / elapsed) * 60000);

        // Simple tone heuristics from pace and fillers
        const energy = Math.min(1, Math.max(0, (wpm - 100) / 120));           // ~100–220 WPM → 0..1
        const confidence = Math.min(1, Math.max(0, 1 - fillerPerMin / 12));   // ≥12 fillers/min → 0

        const nudges = buildNudges(wpm, fillerPerMin);

        // Send one compact frame
        const out = {
          t,
          transcript_partial: text, // maintained for backward compatibility (UI ignores for transcript)
          wpm,
          filler: { total: fillerCount, ratePerMin: fillerPerMin },
          tone: { energy, confidence },
          nudges,
        };

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(out));
        }
      } catch {
        // ignore malformed payloads
      }
    });

    ws.on("close", () => { clearInterval(hb); });
    ws.on("error", () => { clearInterval(hb); });
  });
}
