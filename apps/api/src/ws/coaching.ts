
import { WebSocketServer, WebSocket } from "ws";

/**
 * Calculate WPM using finalized speech only.
 * Temporary partial results are ignored to prevent duplicate counting.
 */
function rollingWpm(
  tokens: { t: number; text: string }[],
  windowMs = 10_000
): number {
  if (!tokens.length) return 0;

  const now = tokens[tokens.length - 1].t;
  const recent = tokens.filter((x) => x.t >= now - windowMs);

  const words = recent
    .map((x) => x.text.trim().split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => a + b, 0);

  return Math.round(words / (windowMs / 60_000));
}

const FILLERS = [
  "um", "uh", "uhh", "uhhh", "erm", "er", "like",
  "you know", "sort of", "kind of", "actually",
  "basically", "literally", "i mean", "you see",
  "okay", "well"
];

function detectFillers(text: string): string[] {
  const lower = text.toLowerCase();

  return FILLERS.filter((f) => {
    const esc = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\b)${esc}(\\b|$)`).test(lower);
  });
}

type ClientMsg = {
  t: number;
  kind: "partial" | "final";
  text?: string;
};

function buildNudges(wpm: number, fillerPerMin: number): string[] {
  const tips: string[] = [];

  if (wpm > 185) tips.push("Slow down slightly");
  else if (wpm < 120 && wpm > 0) tips.push("Increase pace a bit");

  if (fillerPerMin > 10) {
    tips.push("Pause briefly instead of using fillers");
  } else if (fillerPerMin > 6) {
    tips.push("Fewer fillers: add small pauses");
  }

  return tips.slice(0, 2);
}

export function attachCoachingHandlers(wss: WebSocketServer) {
  console.log("[ws] /ws/coaching ready");

  wss.on("connection", (ws: WebSocket) => {
    let startedAt = Date.now();

    const events: { t: number; text: string }[] = [];
    let fillerCount = 0;

    const MAX_EVENTS = 1200;

    let alive = true;

    ws.on("pong", () => {
      alive = true;
    });

    const hb = setInterval(() => {
      if (!alive) {
        try {
          ws.terminate();
        } catch {}
        return;
      }

      alive = false;

      try {
        ws.ping();
      } catch {}
    }, 15_000);

    ws.on("message", (raw) => {
      try {
        const data: ClientMsg = JSON.parse(raw.toString());

        if (!data || (data.kind !== "partial" && data.kind !== "final")) {
          return;
        }

        // Ignore temporary speech results.
        // Only count finalized speech to prevent duplicate words.
        if (data.kind !== "final") return;

        const t =
          typeof data.t === "number"
            ? data.t
            : Date.now() - startedAt;

        const text = (data.text || "").trim();

        if (!text) return;

        // Store finalized speech only.
        events.push({ t, text });

        if (events.length > MAX_EVENTS) {
          events.splice(0, events.length - MAX_EVENTS);
        }

        // Count fillers from finalized speech only.
        fillerCount += detectFillers(text).length;

        const wpm = rollingWpm(events, 10_000);

        const elapsed = Math.max(t, 1);

        const fillerPerMin = Math.round(
          (fillerCount / elapsed) * 60_000
        );

        const energy = Math.min(
          1,
          Math.max(0, (wpm - 100) / 120)
        );

        const confidence = Math.min(
          1,
          Math.max(0, 1 - fillerPerMin / 12)
        );

        const nudges = buildNudges(wpm, fillerPerMin);

        const out = {
          t,
          transcript_partial: text,
          wpm,
          filler: {
            total: fillerCount,
            ratePerMin: fillerPerMin
          },
          tone: {
            energy,
            confidence
          },
          nudges
        };

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(out));
        }
      } catch (error) {
        console.error("[coaching] Message error:", error);
      }
    });

    ws.on("close", () => {
      clearInterval(hb);
    });

    ws.on("error", () => {
      clearInterval(hb);
    });
  });
}
