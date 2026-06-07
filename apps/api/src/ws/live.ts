// apps/api/src/ws/live.ts
import type { IncomingMessage } from "http";
import { WebSocketServer, WebSocket as NodeWebSocket } from "ws";
import fs from "node:fs";
import path from "node:path";
import { v1 as SpeechV1, protos as SpeechProtos } from "@google-cloud/speech";

type OutMsg =
  | { type: "state"; ready: boolean; note?: string }
  | { type: "transcript"; kind: "partial" | "final"; text: string };

const LANG = process.env.SPEECH_LANGUAGE || "en-US";

// --- tiny safe send ---
function safeSend(ws: NodeWebSocket, msg: OutMsg) {
  try {
    if (ws.readyState === NodeWebSocket.OPEN) ws.send(JSON.stringify(msg));
  } catch {}
}

export function attachLiveHandlers(wss: WebSocketServer) {
  console.log("[ws] /ws/live ready (noServer)");

  wss.on("connection", (ws: NodeWebSocket, req: IncomingMessage) => {
    const remote = (req.socket as any)?.remoteAddress || "unknown";
    console.log("WS connected: live", { ip: remote });

    // ---- heartbeat (keep idle connections healthy & detect dead peers) ----
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

    // --- Validate Google creds up front (fail fast with a clear note) ---
    const keyFile = (process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
    const absKeyFile = path.isAbsolute(keyFile) ? keyFile : path.resolve(process.cwd(), keyFile);
    if (!absKeyFile || !fs.existsSync(absKeyFile)) {
      const note = !keyFile ? "Missing GOOGLE_APPLICATION_CREDENTIALS" : `Creds file not found: ${absKeyFile}`;
      console.error("[live]", note);
      safeSend(ws, { type: "state", ready: false, note });
      try { ws.close(); } catch {}
      clearInterval(hb);
      return;
    }

    const speech = new SpeechV1.SpeechClient({ keyFilename: absKeyFile });

    // --- Build StreamingRecognitionConfig (NOT a request wrapper) ---
    // IMPORTANT: Use the v1 enum; do NOT send strings for encoding.
    const Encoding = SpeechProtos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;
    const streamingConfig: SpeechProtos.google.cloud.speech.v1.IStreamingRecognitionConfig = {
      config: {
        languageCode: LANG,
        encoding: Encoding.WEBM_OPUS, // ✅ enum
        sampleRateHertz: 48_000,      // ✅ explicit for Opus to avoid "0" sample rate complaints
        audioChannelCount: 1,         // ✅ mono mic
        enableAutomaticPunctuation: true,
      },
      interimResults: true,
      singleUtterance: false,
    };

    // --- Open bidi stream; passing the config here makes the library send
    //     the FIRST frame as config automatically (required by GCS). ---
    let gStream: (NodeJS.WritableStream & NodeJS.ReadableStream & { write: (chunk: any) => boolean; end: () => void; destroyed?: boolean }) | null = null;
    let streamReady = false;
    let closed = false;

    // Buffer a small amount of early audio in case of rare race
    const earlyQueue: Buffer[] = [];
    let earlyBytes = 0;
    const EARLY_MAX_BYTES = 2 * 1024 * 1024; // 2MB safety cap

    // Simple backpressure guard (drop if write returns false repeatedly)
    let consecutiveWriteErrors = 0;
    const MAX_WRITE_ERRORS = 5;

    try {
      gStream = speech
        .streamingRecognize(streamingConfig)
        .on("data", (data: SpeechProtos.google.cloud.speech.v1.StreamingRecognizeResponse) => {
          const res = data?.results?.[0];
          const text = res?.alternatives?.[0]?.transcript || "";
          if (!text) return;
          safeSend(ws, {
            type: "transcript",
            kind: res?.isFinal ? "final" : "partial",
            text,
          });
        })
        .on("error", (err: unknown) => {
          if (closed) return;
          console.warn("[live] Google Speech error:", String(err));
          safeSend(ws, { type: "state", ready: true, note: "speech error" });
          try { gStream?.end?.(); } catch {}
          gStream = null;
        })
        .on("end", () => {
          if (closed) return;
          safeSend(ws, { type: "state", ready: true, note: "speech stream ended" });
          try { gStream?.end?.(); } catch {}
          gStream = null;
        });

      // Stream object exists; we can flush any early audio as raw bytes
      streamReady = true;
      if (earlyQueue.length && gStream) {
        for (const buf of earlyQueue) {
          try {
            const ok = gStream.write(buf); // ✅ raw opus/webm bytes
            if (!ok) {
              // gRPC stream usually buffers internally; if it signals backpressure,
              // we just continue (no 'drain' on this object).
            }
          } catch (e) {
            console.warn("[live] write(early) failed:", String(e));
            try { gStream.end?.(); } catch {}
            gStream = null;
            break;
          }
        }
        earlyQueue.length = 0;
        earlyBytes = 0;
      }
    } catch (e) {
      console.error("[live] failed to start streamingRecognize:", String(e));
      safeSend(ws, { type: "state", ready: false, note: "failed to init speech" });
      try { ws.close(); } catch {}
      clearInterval(hb);
      return;
    }

    // Tell browser it can start sending audio
    safeSend(ws, { type: "state", ready: true, note: "connected" });

    // After the config (sent by the library), write ONLY raw audio bytes
    ws.on("message", (data, isBinary) => {
      if (!isBinary || closed) return;
      const buf = Buffer.isBuffer(data) ? (data as Buffer) : Buffer.from(data as ArrayBuffer);

      if (!streamReady || !gStream) {
        if (earlyBytes + buf.length <= EARLY_MAX_BYTES) {
          earlyQueue.push(buf);
          earlyBytes += buf.length;
        }
        return;
      }

      try {
        const ok = gStream.write(buf);
        if (!ok) {
          // Backpressure signal; nothing much to do with gRPC stream,
          // but we can track if consecutive write failures occur.
        }
        consecutiveWriteErrors = 0;
      } catch (e) {
        consecutiveWriteErrors++;
        console.warn("[live] write failed:", String(e));
        if (consecutiveWriteErrors >= MAX_WRITE_ERRORS) {
          try { gStream.end?.(); } catch {}
          gStream = null;
        }
      }
    });

    const cleanup = () => {
      if (closed) return;
      closed = true;
      streamReady = false;

      clearInterval(hb);
      earlyQueue.length = 0;
      earlyBytes = 0;

      try { gStream?.end?.(); } catch {}
      gStream = null;

      console.log("WS closed: live", { ip: remote });
      try { ws.close(); } catch {}
    };

    ws.on("close", cleanup);
    ws.on("error", (_err) => cleanup());
  });
}
