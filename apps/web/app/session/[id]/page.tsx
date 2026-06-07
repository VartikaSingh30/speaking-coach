"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/* ----------------------------- Types ----------------------------- */
type CoachFrame = {
  t: number;
  transcript_partial?: string; // not used to build transcript
  wpm: number;
  filler: { total: number; ratePerMin: number };
  tone: { energy: number; confidence: number };
  nudges: string[];
};

type LiveTranscriptMsg = {
  type?: "transcript";
  kind: "partial" | "final";
  text?: string;
  transcript?: string;
};

type LiveStateMsg = {
  type?: "state";
  ready?: boolean;
  note?: string;
};

type LiveMsg = LiveTranscriptMsg | LiveStateMsg | Record<string, unknown>;

/* --------------------------- Utilities --------------------------- */
function isLiveStateMsg(m: any): m is LiveStateMsg {
  return !!m && typeof m === "object" && (m.type === "state" || "ready" in m || "note" in m);
}
function isLiveTranscriptMsg(m: any): m is LiveTranscriptMsg {
  if (!m || typeof m !== "object") return false;
  const kind = (m as any).kind;
  const hasKind = kind === "partial" || kind === "final";
  const hasText = typeof (m as any).text === "string" || typeof (m as any).transcript === "string";
  return hasKind && hasText;
}
function joinWithSpace(a: string, b: string) {
  if (!a) return b;
  if (!b) return a;
  return a.endsWith(" ") ? a + b : a + " " + b;
}
function countWords(s: string) {
  return (s.trim().match(/\S+/g) || [])?.length ?? 0;
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/* --------------------- MediaPipe FaceLandmarker -------------------- */
// CDN loader — no npm install required
async function loadFaceLandmarker() {
  // Use a variable so TS doesn't try to resolve the URL at compile-time
  const VISION_URL =
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.6/vision_bundle.mjs";
  const WASM_BASE =
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.6/wasm";

  // Dynamic import from a variable -> type is 'any'
  const vision: any = await import(VISION_URL as any);

  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
  const landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath:
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.6/face_landmarker.task",
    },
    outputFaceBlendshapes: true,
    runningMode: "VIDEO",
    numFaces: 1,
  });
  return landmarker;
}

/* ============================== Page ============================== */
export default function SessionPage({ params }: { params: { id: string } }) {
  const [running, setRunning] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // metrics from coach
  const [wpm, setWpm] = useState(0);
  const [fpm, setFpm] = useState(0);
  const [coachNudges, setCoachNudges] = useState<string[]>([]);

  // UI state
  const [liveNotes, setLiveNotes] = useState<string[]>([]);
  const [liveStatus, setLiveStatus] = useState<"idle" | "connecting" | "open" | "closed" | "error">("idle");
  const [coachStatus, setCoachStatus] = useState<"idle" | "connecting" | "open" | "closed" | "error">("idle");

  // transcript buffers
  const [finalText, setFinalText] = useState("");     // committed text
  const [partialText, setPartialText] = useState(""); // interim hypothesis
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  // plumbing
  const startTs = useRef<number>(0);
  const mediaStream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const wsCoach = useRef<WebSocket | null>(null);
  const wsLive = useRef<WebSocket | null>(null);
  const liveReconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveReconnectAttempts = useRef(0);
  const runningRef = useRef(false);

  // audio analysis
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const meterRAF = useRef<number>(0);
  const [rmsDb, setRmsDb] = useState(-48); // live dBFS estimate
  const [speakingPct, setSpeakingPct] = useState(0); // rough speaking ratio since start
  const voicedMsRef = useRef(0);
  const lastVoiceTickRef = useRef<number | null>(null);

  // ---- Vision (Face/Gaze) state ----
  const faceReadyRef = useRef(false);
  const visionLoopRef = useRef<number>(0);
  const landmarkerRef = useRef<any>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const [eyeContactPct, setEyeContactPct] = useState(0);
  const [smileScore, setSmileScore] = useState(0);
  const gazeAwayMsRef = useRef(0);
  const lastGazeTickRef = useRef<number | null>(null);
  const eyeContactSamplesRef = useRef<number[]>([]);
  function pushEyeContactSample(v: number) {
    const arr = eyeContactSamplesRef.current;
    arr.push(v);
    if (arr.length > 60) arr.shift(); // ~2s at ~30fps
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    setEyeContactPct(Math.round(avg));
  }

  // dedupe helpers
  const lastPartialRef = useRef<string>("");
  const lastFinalRef = useRef<string>("");

  // env
  const wsCoachUrl = (process.env.NEXT_PUBLIC_WS_URL as string) || "";
  const wsLiveUrl = (process.env.NEXT_PUBLIC_WS_LIVE_URL as string) || "";
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL as string) || "";

  // derived displays
  const transcriptDisplay = useMemo(
    () => (finalText + (partialText ? (finalText ? " " : "") + partialText : "")).trim(),
    [finalText, partialText]
  );
  const wordCount = useMemo(() => countWords(transcriptDisplay), [transcriptDisplay]);

  const displayedNudges = useMemo(
    () => [...coachNudges, ...liveNotes].slice(-4),
    [coachNudges, liveNotes]
  );

  // ⏱ session timer (RAF)
  const [nowMs, setNowMs] = useState<number>(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (runningRef.current) setNowMs(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const elapsedMs = running ? Math.max(0, (nowMs || 0) - (startTs.current || 0)) : 0;
  const elapsedStr = useMemo(() => {
    const s = Math.floor(elapsedMs / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }, [elapsedMs]);

  // unmount cleanup
  useEffect(() => () => stopAll(), []);

  // clear reconnect timer on re-render/unmount
  useEffect(() => {
    return () => {
      if (liveReconnectTimer.current) {
        clearTimeout(liveReconnectTimer.current);
        liveReconnectTimer.current = null;
      }
    };
  }, []);

  // env warning
  const envWarning =
    !wsCoachUrl || !wsLiveUrl || !apiUrl
      ? "Missing NEXT_PUBLIC_WS_URL / NEXT_PUBLIC_WS_LIVE_URL / NEXT_PUBLIC_API_URL"
      : null;

  /* ------------------------- Audio metering ------------------------- */
  function startAudioMeters(stream: MediaStream) {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;

      audioCtxRef.current = new Ctx();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 1024;

      sourceRef.current = audioCtxRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);

      const data = new Float32Array(analyserRef.current.fftSize);

      const update = () => {
        const analyser = analyserRef.current;
        if (!analyser) return;

        analyser.getFloatTimeDomainData(data);
        // RMS
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const s = data[i];
          sum += s * s;
        }
        const rms = Math.sqrt(sum / data.length) || 1e-8;
        const db = 20 * Math.log10(rms); // dBFS approx, ~[-90..0]
        const clippedDb = clamp(db, -80, -5);
        setRmsDb(Math.round(clippedDb));

        // crude VAD: if above threshold, consider "voiced"
        const voiced = clippedDb > -45;
        const now = performance.now();
        if (voiced) {
          if (lastVoiceTickRef.current != null) {
            voicedMsRef.current += now - lastVoiceTickRef.current;
          }
          lastVoiceTickRef.current = now;
        } else {
          lastVoiceTickRef.current = now; // keep tick moving to avoid long gaps
        }

        // update speaking % relative to elapsed
        const dur = Math.max(1, now - startTs.current);
        const pct = clamp(Math.round((voicedMsRef.current / dur) * 100), 0, 100);
        setSpeakingPct(pct);

        meterRAF.current = requestAnimationFrame(update);
      };

      cancelAnimationFrame(meterRAF.current);
      meterRAF.current = requestAnimationFrame(update);
    } catch {
      // fail silently; meters are optional
    }
  }

  function stopAudioMeters() {
    cancelAnimationFrame(meterRAF.current);
    meterRAF.current = 0;
    try { sourceRef.current?.disconnect(); } catch {}
    try { analyserRef.current?.disconnect(); } catch {}
    try { audioCtxRef.current?.close(); } catch {}
    sourceRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current = null;
    setRmsDb(-48);
    setSpeakingPct(0);
  }

  /* ----------------------------- Vision ----------------------------- */
  async function startVision(videoEl: HTMLVideoElement) {
    try {
      if (landmarkerRef.current) return;
      const landmarker = await loadFaceLandmarker();
      landmarkerRef.current = landmarker;
      faceReadyRef.current = true;
      lastVideoTimeRef.current = -1;

      const tick = () => {
        const vlm = landmarkerRef.current;
        if (!vlm || videoEl.readyState < 2) {
          visionLoopRef.current = requestAnimationFrame(tick);
          return;
        }

        // Only when video produces a new frame
        // @ts-ignore
        const vt = (videoEl as any).currentTime ?? 0;
        if (vt === lastVideoTimeRef.current) {
          visionLoopRef.current = requestAnimationFrame(tick);
          return;
        }
        lastVideoTimeRef.current = vt;

        const result = vlm.detectForVideo(videoEl, performance.now());
        const blend = result?.faceBlendshapes?.[0]?.categories || [];

        const get = (name: string) => blend.find((c: any) => c.categoryName === name)?.score ?? 0;

        // Eye orientation: smaller values ≈ more centered gaze
        const eyeIn = (get("eyeLookInLeft") + get("eyeLookInRight")) / 2;
        const eyeOut = (get("eyeLookOutLeft") + get("eyeLookOutRight")) / 2;
        const eyeUp = (get("eyeLookUpLeft") + get("eyeLookUpRight")) / 2;
        const eyeDown = (get("eyeLookDownLeft") + get("eyeLookDownRight")) / 2;
        const offAxis = Math.max(eyeIn, eyeOut, eyeUp, eyeDown); // 0..1
        const lookingAtCam = offAxis < 0.25 ? 1 : offAxis < 0.4 ? 0.6 : 0.15;

        pushEyeContactSample(lookingAtCam * 100);

        const smile =
          (get("mouthSmileLeft") + get("mouthSmileRight")) / 2 -
          get("mouthFrownLeft") * 0.25 -
          get("mouthFrownRight") * 0.25;
        setSmileScore(Math.max(0, Math.min(1, smile)) * 100);

        // If speaking & gaze away for >1.5s → nudge
        const isSpeaking =
          toDbPct(rmsDb) > 35 || (partialText && partialText.length > 0);

        const now = performance.now();
        if (isSpeaking && lookingAtCam < 0.4) {
          if (lastGazeTickRef.current != null) {
            gazeAwayMsRef.current += now - lastGazeTickRef.current;
          }
          lastGazeTickRef.current = now;
        } else {
          lastGazeTickRef.current = now;
          gazeAwayMsRef.current = 0;
        }

        if (gazeAwayMsRef.current > 1500) {
          setCoachNudges((prev) => {
            const last = prev[prev.length - 1] ?? "";
            return last?.includes("eyes")
              ? prev
              : [...prev, "Bring your eyes back to the camera 👀"];
          });
          gazeAwayMsRef.current = 0; // rate-limit
        }

        // Confidence heuristic to push energy nudge
        const loudPct = toDbPct(rmsDb); // 0..100
        const conf = Math.round(0.5 * eyeContactPct + 0.2 * smileScore + 0.3 * loudPct);
        if (isSpeaking && conf < 45) {
          setCoachNudges((prev) => {
            const last = prev[prev.length - 1] ?? "";
            return last?.includes("energy")
              ? prev
              : [...prev, "More energy: project your voice and sit tall ⚡️"];
          });
        }

        visionLoopRef.current = requestAnimationFrame(tick);
      };

      visionLoopRef.current = requestAnimationFrame(tick);
    } catch {
      faceReadyRef.current = false; // graceful fallback
    }
  }

  function stopVision() {
    cancelAnimationFrame(visionLoopRef.current);
    visionLoopRef.current = 0;
    landmarkerRef.current = null;
    faceReadyRef.current = false;
    lastVideoTimeRef.current = -1;
    eyeContactSamplesRef.current = [];
    setEyeContactPct(0);
    setSmileScore(0);
    gazeAwayMsRef.current = 0;
    lastGazeTickRef.current = null;
  }

  /* ------------------------ Global teardown ------------------------ */
  const stopAll = useCallback(() => {
    try { recorder.current?.stop(); } catch {}
    try { wsCoach.current?.close(); } catch {}
    try { wsLive.current?.close(); } catch {}
    try { mediaStream.current?.getTracks().forEach((t) => t.stop()); } catch {}

    stopAudioMeters();
    stopVision();

    if (liveReconnectTimer.current) {
      clearTimeout(liveReconnectTimer.current);
      liveReconnectTimer.current = null;
    }
    liveReconnectAttempts.current = 0;
    runningRef.current = false;

    recorder.current = null;
    wsCoach.current = null;
    wsLive.current = null;
    mediaStream.current = null;

    setCoachNudges([]);
    setLiveNotes([]);

    setFinalText("");
    setPartialText("");
    lastPartialRef.current = "";
    lastFinalRef.current = "";

    voicedMsRef.current = 0;
    lastVoiceTickRef.current = null;
  }, []);

  // auto-scroll transcript
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [transcriptDisplay]);

  /* -------------------------- Live connect ------------------------- */
  const connectLive = useCallback(() => {
    if (!runningRef.current) return;

    setLiveStatus("connecting");
    const socket = new WebSocket(wsLiveUrl);
    socket.binaryType = "arraybuffer";
    wsLive.current = socket;

    socket.onopen = () => {
      setLiveStatus("open");
      liveReconnectAttempts.current = 0;

      if (!mediaStream.current) return;

      const audioOnly = new MediaStream(mediaStream.current.getAudioTracks());
      const mime =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

      if (!mime) {
        setLiveNotes((prev) => [...prev.slice(-3), "Browser missing audio/webm support"]);
        return;
      }

      try { recorder.current?.stop(); } catch {}
      recorder.current = new MediaRecorder(
        audioOnly,
        mime ? { mimeType: mime, audioBitsPerSecond: 48_000 } : {}
      );

      const CHUNK_MS = 250;
      recorder.current.ondataavailable = async (e) => {
        if (
          e.data &&
          e.data.size > 0 &&
          wsLive.current &&
          wsLive.current.readyState === WebSocket.OPEN
        ) {
          try {
            const buf = await e.data.arrayBuffer();
            wsLive.current.send(buf);
          } catch { /* ignore */ }
        }
      };

      recorder.current.start(CHUNK_MS);
    };

    socket.onmessage = (ev) => {
      try {
        if (typeof ev.data !== "string") return;
        const msg: LiveMsg = JSON.parse(ev.data);

        if (isLiveStateMsg(msg) && msg.note) {
          if (msg.note !== "connected" && msg.note !== "speech stream ended") {
            setLiveNotes((prev) => [...prev.slice(-3), msg.note!]);
          }
          return;
        }

        if (isLiveTranscriptMsg(msg)) {
          const text = (typeof msg.text === "string" ? msg.text : msg.transcript!)?.trim() ?? "";
          const kind = msg.kind;
          if (!text) return;

          // voiced time tick (also handled by analyser, but keep this as a backup)
          const now = performance.now();
          if (lastVoiceTickRef.current != null) {
            voicedMsRef.current += now - lastVoiceTickRef.current;
          }
          lastVoiceTickRef.current = now;

          if (kind === "partial") {
            if (text !== lastPartialRef.current) {
              setPartialText(text);
              lastPartialRef.current = text;
            }
          } else {
            if (text !== lastFinalRef.current) {
              setFinalText((prev) => joinWithSpace(prev, text));
              lastFinalRef.current = text;
            }
            setPartialText("");
            lastPartialRef.current = "";
          }

          // forward to coach for metrics (pace/fillers)
          const t = performance.now() - startTs.current;
          try {
            wsCoach.current?.send(JSON.stringify({ t, kind, text }));
          } catch { /* ignore */ }
        }
      } catch {
        // ignore malformed frames
      }
    };

    socket.onerror = () => setLiveStatus("error");

    socket.onclose = () => {
      try { recorder.current?.stop(); } catch {}
      recorder.current = null;

      setLiveStatus("closed");
      if (!runningRef.current) return;

      const attempt = (liveReconnectAttempts.current += 1);
      const delay = Math.min(500 * 2 ** (attempt - 1), 5000);
      if (liveReconnectTimer.current) clearTimeout(liveReconnectTimer.current);
      liveReconnectTimer.current = setTimeout(connectLive, delay);
    };
  }, [wsLiveUrl]);

  const connectLiveMemo = useCallback(connectLive, [connectLive]);

  /* ----------------------------- Start ----------------------------- */
  async function start() {
    if (runningRef.current) return;
    setError(null);
    if (envWarning) {
      alert(envWarning);
      return;
    }

    setRunning(true);
    runningRef.current = true;
    liveReconnectAttempts.current = 0;
    if (liveReconnectTimer.current) {
      clearTimeout(liveReconnectTimer.current);
      liveReconnectTimer.current = null;
    }

    setCoachNudges([]);
    setLiveNotes([]);
    setFinalText("");
    setPartialText("");
    lastPartialRef.current = "";
    lastFinalRef.current = "";

    voicedMsRef.current = 0;
    lastVoiceTickRef.current = null;

    startTs.current = performance.now();

    try {
      mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      startAudioMeters(mediaStream.current);
    } catch {
      setRunning(false);
      runningRef.current = false;
      setError("Microphone/Camera permission denied");
      return;
    }

    const video = document.getElementById("preview") as HTMLVideoElement | null;
    if (video) {
      video.srcObject = mediaStream.current;
      await video.play().catch(() => undefined);
      // 👇 Start gaze/smile tracking (graceful fallback if it fails)
      startVision(video);
    }

    // Coach WS (metrics only)
    setCoachStatus("connecting");
    wsCoach.current = new WebSocket(wsCoachUrl);
    wsCoach.current.onopen = () => setCoachStatus("open");
    wsCoach.current.onclose = () => setCoachStatus("closed");
    wsCoach.current.onerror = () => setCoachStatus("error");
    wsCoach.current.onmessage = (ev) => {
      try {
        const frame: CoachFrame = JSON.parse(ev.data);
        setWpm(frame.wpm);
        setFpm(frame.filler?.ratePerMin ?? 0);
        setCoachNudges(frame.nudges ?? []);
      } catch { /* ignore malformed */ }
    };

    connectLiveMemo();
    setLiveStatus("connecting");
  }

  /* ------------------------------ End ------------------------------ */
  async function end() {
    if (!runningRef.current) return;
    setEnding(true);
    setRunning(false);
    runningRef.current = false;

    const now = performance.now();
    if (lastVoiceTickRef.current != null) {
      voicedMsRef.current += now - lastVoiceTickRef.current;
      lastVoiceTickRef.current = null;
    }

    const durationMs = Math.max(1, now - startTs.current);
    const transcript = (finalText + (partialText ? " " + partialText : "")).trim();
    const words = countWords(transcript);
    const estSpeakingMsFromWpm =
      wpm > 0 ? Math.min(durationMs, (words / Math.max(1, wpm)) * 60_000) : voicedMsRef.current;
    const speakingRatioPct = clamp(Math.round((estSpeakingMsFromWpm / durationMs) * 100), 0, 100);

    stopAll(); // close sockets/streams before POST

    try {
      const res = await fetch(`${apiUrl}/session/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: params.id,
          transcript,
          durationMs,
          speakingRatioPct,
          avgLoudnessDb: rmsDb || -30, // send our live estimate
          avgWpm: wpm,
          fillerPerMin: fpm,
          eyeContactPct: eyeContactPct, // 👈 send our new signal
          smilePct: Math.round(smileScore), // 👈 send our new signal
          pauseMedianMs: 350,
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        setEnding(false);
        setError(payload?.error || "Failed to save session");
        return;
      }

      window.location.href = `/session/${params.id}/report?rid=${payload.reportId}&total=${payload.scores.total}`;
    } catch (e: any) {
      setEnding(false);
      setError(e?.message || "Network error while ending session");
    }
  }

  /* ------------------------------ UI ------------------------------ */
  return (
    <main
      className="
        relative p-6 max-w-7xl mx-auto
        bg-[radial-gradient(1200px_400px_at_20%_-10%,#22c55e15,transparent)]
        bg-[radial-gradient(900px_300px_at_110%_-10%,#38bdf81a,transparent)]
      "
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Live Session</h1>
          <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300">
            #{params.id}
          </span>
        </div>
        <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← Home
        </Link>
      </div>

      {/* Env warning / error toast */}
      {envWarning && (
        <div className="mt-4 p-3 rounded-xl border border-amber-700 bg-amber-950 text-amber-100 text-sm">
          {envWarning}
        </div>
      )}
      {error && (
        <div className="mt-4 p-3 rounded-xl border border-red-700 bg-red-950 text-red-100 text-sm">
          {error}
        </div>
      )}

      {/* Privacy + readiness strip */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-xs text-neutral-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Audio &amp; video are used only for live analysis during this session.
        </span>
        <span className="text-neutral-600">•</span>
        <span>Face tracking runs locally in your browser.</span>
        {!running && !ending && (
          <span className="ml-auto text-neutral-500">Press <kbd className="rounded border border-neutral-700 bg-neutral-900 px-1">Start Session</kbd> to begin.</span>
        )}
      </div>

      {/* Grid */}
      <div className="mt-5 grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Preview + Controls */}
        <div className="xl:col-span-2 bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 backdrop-blur">
          <div className="relative">
            <div className="relative rounded-xl overflow-hidden">
              <video id="preview" className="w-full rounded-xl bg-black aspect-video" playsInline muted />
              {/* Mic pulse ring */}
              <MicPulseRing db={rmsDb} />
              {/* Idle empty-state */}
              {!running && !ending && (
                <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-[1px]">
                  <div className="text-center px-6">
                    <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-neutral-700 bg-neutral-900 text-emerald-400">
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
                      </svg>
                    </div>
                    <p className="mt-3 text-sm font-medium text-neutral-200">Camera &amp; mic are off</p>
                    <p className="mt-1 text-xs text-neutral-400">Start the session to enable live transcription and coaching.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Top-left status bar */}
            <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
              <Chip tone={liveStatus === "open" ? "good" : liveStatus === "error" ? "bad" : "warn"}>
                Live WS: {liveStatus}
              </Chip>
              <Chip tone={coachStatus === "open" ? "good" : coachStatus === "error" ? "bad" : "warn"}>
                Coach WS: {coachStatus}
              </Chip>
              {faceReadyRef.current ? (
                <Chip tone="good">Vision: on</Chip>
              ) : (
                <Chip tone="warn">Vision: off</Chip>
              )}
            </div>

            {/* Top-right session timer */}
            <div className="absolute top-3 right-3">
              <div className="px-3 py-1 rounded-full bg-black/55 backdrop-blur border border-white/10 text-sm font-medium">
                ⏱ {elapsedStr}
              </div>
            </div>

            {/* Bottom overlay meters */}
            <div className="absolute bottom-3 left-3 right-3 grid gap-3 md:grid-cols-5">
              <Meter label="Loudness" value={`${rmsDb} dB`} pct={toDbPct(rmsDb)} />
              <Meter label="Speaking" value={`${speakingPct}%`} pct={speakingPct} />
              <Meter label="Words" value={wordCount} pct={toWordsPct(wordCount)} />
              <Meter label="Eye Contact" value={`${eyeContactPct}%`} pct={eyeContactPct} />
              <Meter label="Smile" value={`${Math.round(smileScore)}%`} pct={smileScore} />
            </div>
          </div>

          {/* Controls */}
          <div className="mt-4 flex items-center gap-3">
            {!running ? (
              <button
                onClick={start}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 text-black font-semibold hover:brightness-95 transition disabled:opacity-50"
                disabled={!!envWarning || ending}
              >
                Start Session
              </button>
            ) : (
              <button
                onClick={end}
                className="px-5 py-2.5 rounded-xl bg-emerald-400 text-black font-semibold hover:brightness-95 transition"
              >
                End & Generate Report
              </button>
            )}

            <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-neutral-400">
              <BadgePair k="Words" v={wordCount} />
              <BadgePair k="Pace" v={`${wpm} WPM`} />
              <BadgePair k="Fillers" v={`${fpm}/min`} />
              <BadgePair k="Loudness" v={`${rmsDb} dB`} />
              <BadgePair k="Eye contact" v={`${eyeContactPct}%`} />
              <BadgePair k="Smile" v={`${Math.round(smileScore)}%`} />
            </div>
          </div>
        </div>

        {/* Right: Metrics + Nudges */}
        <div className="xl:col-span-1 space-y-4">
          <Card title="Live Coaching">
            <div className="grid grid-cols-2 gap-3">
              <Metric
                label="Pace"
                value={`${wpm}`}
                helper="Target 140–170"
                barValue={clamp((wpm / 180) * 100, 0, 100)}
              />
              <Metric
                label="Fillers / min"
                value={`${fpm}`}
                helper="Aim < 6"
                barValue={clamp(((6 - fpm) / 6) * 100, 0, 100)}
                invert
              />
            </div>

            <div className="mt-4">
              <div className="text-xs text-neutral-400 mb-1">Nudges</div>
              <div className="flex flex-wrap gap-2">
                {displayedNudges.length ? (
                  displayedNudges.map((n, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 text-sm rounded-md bg-neutral-800 border border-neutral-700 text-neutral-200 animate-[fadeIn_300ms_ease]"
                    >
                      {n}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-neutral-500">You’re doing great — keep going!</span>
                )}
              </div>
            </div>
          </Card>

          <Card title="Live Transcript">
            <div
              ref={transcriptRef}
              className="p-3 bg-neutral-950 rounded-lg border border-neutral-800 h-64 overflow-auto leading-7 whitespace-pre-wrap text-sm"
            >
              {transcriptDisplay || <span className="text-neutral-500">Waiting for speech…</span>}
            </div>
            <div className="mt-2 flex justify-between items-center text-xs">
              <span className="text-neutral-500">
                Auto-scroll enabled
              </span>
              <button
                className="text-neutral-400 hover:text-neutral-200"
                onClick={() => {
                  if (!transcriptDisplay) return;
                  navigator.clipboard.writeText(transcriptDisplay).catch(() => {});
                }}
              >
                Copy transcript
              </button>
            </div>
          </Card>
        </div>
      </div>

      {/* Fullscreen overlay when ending */}
      {ending && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md p-5 rounded-2xl border border-neutral-800 bg-neutral-950 text-center">
            <Spinner />
            <h3 className="mt-3 text-lg font-semibold">Generating your AI review…</h3>
            <p className="mt-1 text-sm text-neutral-400">
              Packaging your transcript and metrics to craft a coaching report.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

/* ---------------------------- Sub-components ---------------------------- */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 backdrop-blur">
      <h2 className="text-base font-medium">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
  helper,
  barValue,
  invert = false,
}: {
  label: string;
  value: string | number;
  helper?: string;
  barValue?: number; // 0-100
  invert?: boolean;  // flip color logic (e.g., fewer fillers = better)
}) {
  const pct = clamp(Math.round(barValue ?? 0), 0, 100);
  const good = invert ? pct >= 60 : pct >= 60;
  const barClass = good ? "bg-emerald-500" : "bg-amber-500";
  return (
    <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="mt-0.5 text-3xl font-bold tracking-tight">{value}</div>
      {helper ? (
        <div className="text-[11px] text-neutral-500 mt-1">{helper}</div>
      ) : null}
      {barValue != null ? (
        <div className="mt-2 h-2 rounded-full bg-neutral-800 overflow-hidden">
          <div
            className={`h-full ${barClass} transition-[width] duration-500 ease-out`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone: "good" | "bad" | "warn" }) {
  const base = "px-2 py-1 rounded-full border text-xs backdrop-blur";
  const toneCls =
    tone === "good"
      ? "bg-emerald-600/20 border-emerald-700 text-emerald-200"
      : tone === "bad"
      ? "bg-red-600/20 border-red-700 text-red-200"
      : "bg-amber-600/20 border-amber-700 text-amber-200";
  return <span className={`${base} ${toneCls}`}>{children}</span>;
}

function Spinner() {
  return (
    <div role="status" aria-label="loading" className="mx-auto h-8 w-8">
      <div className="animate-spin rounded-full h-8 w-8 border-[3px] border-neutral-600 border-t-neutral-200" />
    </div>
  );
}

function BadgePair({ k, v }: { k: string; v: string | number }) {
  return (
    <span className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-neutral-800/70 border border-neutral-700">
      <span className="text-neutral-500">{k}</span>
      <span className="text-neutral-200 font-medium">{v}</span>
    </span>
  );
}

/* Loudness/Speaking/Words/EyeContact/Smile meters under the video */
function Meter({ label, value, pct }: { label: string; value: string | number; pct: number }) {
  const w = clamp(Math.round(pct), 0, 100);
  return (
    <div className="rounded-lg bg-black/45 border border-white/10 backdrop-blur p-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-neutral-300">{label}</span>
        <span className="text-sm font-semibold">{String(value)}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-[width] duration-300"
          style={{ width: `${w}%` }}
        />
      </div>
    </div>
  );
}

/* Animated pulse ring that scales with dB */
function MicPulseRing({ db }: { db: number }) {
  const pct = toDbPct(db) / 100; // 0..1
  const scale = 1 + pct * 0.25;  // subtle
  const glow = Math.round(30 * pct); // 0..30
  return (
    <div
      className="pointer-events-none absolute inset-0 grid place-items-center"
      style={{ transform: `scale(${scale})`, transition: "transform 120ms ease" }}
    >
      <div
        className="h-28 w-28 rounded-full"
        style={{
          boxShadow: `0 0 ${glow}px ${Math.max(8, glow / 2)}px rgba(34,197,94,0.2)`,
          border: "2px solid rgba(34,197,94,0.35)",
        }}
      />
    </div>
  );
}

/* ----------------------------- Helpers ---------------------------- */
function toDbPct(db: number) {
  // Map [-80..-5] to [0..100]
  const clamped = clamp(db, -80, -5);
  return ((clamped + 80) / 75) * 100;
}
function toWordsPct(words: number) {
  // Arbitrary progress to 300 words
  const target = 300;
  return clamp((words / target) * 100, 0, 100);
}
