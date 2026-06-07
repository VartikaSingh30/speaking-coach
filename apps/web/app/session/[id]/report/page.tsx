"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

/* ------------------------------- Types ------------------------------- */
type Review = {
  summary: string;
  strengths: string[];
  issues: string[];
  toneCoaching: string[];
  englishCoaching: {
    patterns: string[];
    examples: Array<{ bad: string; better: string; why: string }>;
    newVocabulary: Array<{ word: string; usage: string }>;
  };
  sevenDayPlan: string[];
  quickTips?: string[];
};

type Scores = {
  delivery: number; clarity: number; presence: number; structure: number; total: number;
};

type ReportResp = {
  reportId: string;
  sessionId: string;
  scores: Scores;
  createdAt: string;
  review?: Review;
};

/* --------------------------- Small utilities --------------------------- */
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");
const safeStr = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

// Defensive uniq that never throws
function uniq(maybeArr: unknown): string[] {
  const arr = Array.isArray(maybeArr) ? maybeArr : [];
  const onlyStrings = arr.filter((x): x is string => typeof x === "string");
  return Array.from(new Set(onlyStrings.map((s) => s.trim()).filter(Boolean)));
}

/* ------------------------------ TTS helpers ------------------------------ */
// Split into ear-friendly chunks; respect sentence boundaries; cap length
function splitIntoChunks(text: string, max = 160): string[] {
  const parts: string[] = [];
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter(Boolean);
  let current = "";
  for (const s of sentences) {
    if ((current + " " + s).trim().length > max) {
      if (current) parts.push(current.trim());
      if (s.length > max) {
        for (let i = 0; i < s.length; i += max) parts.push(s.slice(i, i + max));
        current = "";
      } else {
        current = s;
      }
    } else {
      current = (current ? current + " " : "") + s;
    }
  }
  if (current) parts.push(current.trim());
  return parts;
}

function buildNarration(review?: Review): string {
  if (!review) {
    return [
      "Your report is on the way.",
      "Quick tip: pause for a beat between ideas to reduce fillers."
    ].join(" ");
  }
  const s = safeStr(review.summary);
  const strengths = uniq(review.strengths).slice(0, 3);
  const issues = uniq(review.issues).slice(0, 3);
  const tips = uniq(review.quickTips || []).slice(0, 4);
  const plan = uniq(review.sevenDayPlan).slice(0, 3);

  const parts: string[] = [];
  if (s) parts.push(s);
  if (strengths.length) parts.push(`Strengths: ${strengths.join("; ")}.`);
  if (issues.length) parts.push(`Focus areas: ${issues.join("; ")}.`);
  if (tips.length) parts.push(`Quick tips: ${tips.join("; ")}.`);
  if (plan.length) parts.push(`Next steps: ${plan.join("; ")}.`);
  return parts.join(" ");
}

/* ------------------------------ Component ------------------------------ */
export default function ReportPage({ params }: { params: { id: string } }) {
  const q = useSearchParams();
  const totalFromQuery = q.get("total") || "—";
  const rid = q.get("rid") || "";
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL as string) || "";

  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [report, setReport] = useState<ReportResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  // TTS state
  const [voiceReady, setVoiceReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState(1.02);
  const [volume, setVolume] = useState(1.0);
  const [voiceName, setVoiceName] = useState<string>("");

  const queued = useRef<SpeechSynthesisUtterance[]>([]);
  const onendHandles = useRef<((i: number) => void) | null>(null);

  /* ------------------------------ TTS Init ------------------------------ */
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const handle = () => setVoiceReady(true);
    // Ensure voices list is populated
    window.speechSynthesis.onvoiceschanged = handle;
    window.speechSynthesis.getVoices();
    return () => {
      if (window.speechSynthesis.onvoiceschanged === handle) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      try { window.speechSynthesis.cancel(); } catch {}
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "s") {
        e.preventDefault(); stopSpeak();
      } else if (e.key === " " && !(e.target as HTMLElement)?.closest("input,select,textarea")) {
        e.preventDefault(); toggleSpeak();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [speaking, paused, voiceReady, rate, volume, voiceName, report]);

  /* ------------------------------ Data Fetch + Poll ------------------------------ */
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let tries = 0;

    async function fetchReport() {
      try {
        setLoading(true);
        setError(null);

        if (!rid || !apiUrl) {
          setLoading(false);
          return;
        }

        const r = await fetch(`${apiUrl}/session/${params.id}/report/${rid}`, { cache: "no-store" });
        if (cancelled) return;

        if (!r.ok) {
          setError(`Failed to load report (${r.status})`);
          setLoading(false);
          return;
        }

        const data: ReportResp = await r.json();
        setReport(data);

        if (data?.review) {
          setLoading(false);
          return;
        }

        // No review yet → begin polling
        setPolling(true);
        tries = 0;
        const poll = async () => {
          if (cancelled) return;
          tries += 1;
          try {
            const pr = await fetch(`${apiUrl}/session/${params.id}/review`, { cache: "no-store" });
            if (cancelled) return;
            if (pr.ok) {
              const j = await pr.json();
              if (j?.pending) {
    // keep polling
  } else if (j?.review) {
              setReport((prev) =>
                prev
                  ? { ...prev, review: j.review as Review, scores: j.scores ?? prev.scores, createdAt: j.createdAt ?? prev.createdAt }
                  : { reportId: j.reportId, sessionId: params.id, createdAt: j.createdAt ?? new Date().toISOString(), scores: j.scores, review: j.review }
              );
              setPolling(false);
              setLoading(false);
              return;
            }}
          } catch {
            // ignore one poll error
          }
          if (tries < 22) {
            pollTimer = setTimeout(poll, 2000); // ~44s
          } else {
            setPolling(false);
            setLoading(false);
          }
        };
        poll();
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || String(e));
          setLoading(false);
        }
      }
    }

    fetchReport();
    return () => { cancelled = true; if (pollTimer) clearTimeout(pollTimer); };
  }, [apiUrl, params.id, rid]);

  const hasReview = !!report?.review;

  // Quick Tips synthesis (robust)
  const quickTips: string[] = useMemo(() => {
    const r = report?.review;
    if (!r) {
      return [
        "Pause 0.5–1s to cut fillers.",
        "Aim ~150 WPM; breathe at commas.",
        "Lead with the answer, then an example.",
        "Finish cleanly—avoid trailing phrases.",
        "Stand tall and keep chin level."
      ];
    }
    const fromIssues = uniq(r.issues).slice(0, 3);
    const fromTone = uniq(r.toneCoaching).slice(0, 2);
    const fromPatterns = uniq(r.englishCoaching?.patterns).slice(0, 2);
    const forced = ["Pause for clarity over fillers.", "One idea per sentence."];
    return uniq([...(r.quickTips || []), ...fromIssues, ...fromTone, ...fromPatterns, ...forced]).slice(0, 6);
  }, [report]);

  const total = useMemo(() => {
    const t = Number(report?.scores?.total ?? totalFromQuery);
    return Number.isFinite(t) ? clamp(Math.round(t), 0, 100) : 0;
  }, [report?.scores?.total, totalFromQuery]);

  /* ------------------------------ TTS actions ------------------------------ */
  const getPreferredVoice = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    // Preference: high-quality English voices
    const en = voices.filter((v) => /en(-|_)?/i.test(v.lang));
    const prefOrder = [
      /Google\s(US|UK)\sEnglish/i, // Chrome Google voices
      /Samantha|Karen|Moira|Tessa|Serena/i, // Apple voices (macOS/iOS)
      /Jenny|Aria|Salli|Amy|Emma/i, // Common cloud names
    ];
    let chosen =
      voices.find((v) => voiceName && v.name === voiceName) ||
      prefOrder
        .map((re) => en.find((v) => re.test(v.name)))
        .find(Boolean) ||
      en[0] ||
      voices[0] ||
      null;
    return chosen ?? null;
  }, [voiceName]);

  function speak() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Sorry, speech is not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    setPaused(false);

    const text = buildNarration(report?.review);
    if (!text) return;

    const voice = getPreferredVoice();
    const chunks = splitIntoChunks(text, 160);

    queued.current = chunks.map((c, i) => {
      const u = new SpeechSynthesisUtterance(c);
      if (voice) u.voice = voice;
      u.rate = rate;          // slightly fast but still natural
      u.pitch = 1.02;         // a touch warmer
      u.volume = clamp(volume, 0, 1);
      u.onend = () => {
        // when last chunk ends
        if (i === chunks.length - 1) {
          setSpeaking(false);
          setPaused(false);
        }
        onendHandles.current?.(i);
      };
      u.onerror = () => {
        setSpeaking(false);
        setPaused(false);
      };
      return u;
    });

    try {
      setSpeaking(true);
      queued.current.forEach((u, i) => {
        // add a gentle pause between chunks by adding a thin space
        if (i > 0) u.text = " " + u.text;
        window.speechSynthesis.speak(u);
      });
    } catch {
      setSpeaking(false);
      setPaused(false);
    }
  }

  function stopSpeak() {
    try { window.speechSynthesis.cancel(); } catch {}
    setSpeaking(false);
    setPaused(false);
  }

  function toggleSpeak() {
    if (speaking && !paused) {
      try { window.speechSynthesis.pause(); } catch {}
      setPaused(true);
      return;
    }
    if (speaking && paused) {
      try { window.speechSynthesis.resume(); } catch {}
      setPaused(false);
      return;
    }
    speak();
  }

  const allVoices = (typeof window !== "undefined" && "speechSynthesis" in window)
    ? window.speechSynthesis.getVoices().filter(v => /en(-|_)?/i.test(v.lang))
    : [];

  /* ------------------------------ Render ------------------------------ */
  return (
    <main
      className="
        relative p-6 max-w-7xl mx-auto
      "
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Coaching Report</h1>
          <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300">
            #{params.id}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Voice controls */}
          <div className="hidden md:flex items-center gap-2">
            <select
              aria-label="Voice"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 rounded-lg text-xs px-2 py-1 text-neutral-200"
            >
              <option value="">Auto voice</option>
              {allVoices.map((v) => (
                <option key={v.name} value={v.name}>{v.name}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs text-neutral-400">
              Rate
              <input
                type="range"
                min="0.8"
                max="1.2"
                step="0.02"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-400">
              Volume
              <input
                type="range"
                min="0.3"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleSpeak}
              disabled={!voiceReady && !hasReview}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition
              ${speaking && !paused ? "bg-emerald-500 border-emerald-400 text-black" : "bg-neutral-900 border-neutral-700 text-neutral-200 hover:bg-neutral-800"}`}
              aria-pressed={speaking && !paused}
              title={speaking ? (paused ? "Resume narration" : "Pause narration") : "Speak review"}
            >
              {speaking ? (paused ? "▶ Resume" : "⏸ Pause") : "🔊 Speak"}
            </button>
            <button
              onClick={stopSpeak}
              className="px-3 py-1.5 rounded-lg border text-sm font-medium bg-neutral-900 border-neutral-700 text-neutral-200 hover:bg-neutral-800"
              title="Stop narration (S)"
            >
              ■ Stop
            </button>
          </div>

          <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200 ml-2">
            ← Home
          </Link>
        </div>
      </div>

      {!apiUrl && (
        <div className="mt-4 p-3 rounded border border-amber-700 bg-amber-950 text-amber-100 text-sm">
          Missing NEXT_PUBLIC_API_URL — set it in your .env.local
        </div>
      )}

      {/* HERO */}
      <section className="relative mt-6 overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950">
        {/* glowing webs */}
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-80 w-[48rem] rounded-full blur-3xl bg-emerald-600/20" />
          <div className="absolute -top-24 right-0 h-64 w-[36rem] rounded-full blur-3xl bg-sky-500/20" />
        </div>

        <div className="relative p-6 md:p-8 grid gap-6 md:grid-cols-[auto,1fr]">
          <div className="flex items-center gap-6">
            <ScoreRing score={total} />
            <div>
              <div className="text-xs text-neutral-400">Overall Score</div>
              <div className="text-4xl md:text-5xl font-bold leading-tight">{total}</div>
              <div className="mt-2 text-xs text-neutral-500">
                Report ID: {rid || "—"} {report?.createdAt ? `· Generated ${fmtDate(report.createdAt)}` : ""}
              </div>
            </div>
          </div>

          {/* Quick tips rack */}
          <div className="rounded-2xl bg-neutral-900/70 border border-neutral-800 p-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium">Quick Tips</h2>
              {(loading || polling) && <Chip tone="warn">{loading ? "Preparing" : "Refreshing"}</Chip>}
              {hasReview && !loading && <Chip tone="good">AI-backed</Chip>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(loading && !hasReview) ? <TipsSkeleton /> : quickTips.map((t, i) => <TipPill key={i} text={t} />)}
            </div>
          </div>
        </div>
      </section>

      {/* METRICS */}
      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Delivery" value={report?.scores?.delivery} accent="emerald" icon={<BarIcon />} />
        <MetricCard label="Clarity" value={report?.scores?.clarity} accent="sky" icon={<SparkIcon />} />
        <MetricCard label="Presence" value={report?.scores?.presence} accent="violet" icon={<PersonIcon />} />
        <MetricCard label="Structure" value={report?.scores?.structure} accent="amber" icon={<ListIcon />} />
      </section>

      {/* REVIEW SECTIONS */}
      <section className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-medium">AI Review</h2>
          {loading && <Chip tone="warn">Generating…</Chip>}
          {!loading && hasReview && <Chip tone="good">Ready</Chip>}
          {!loading && !hasReview && !error && <Chip tone="warn">Not available</Chip>}
        </div>

        {error && (
          <div className="p-4 rounded border border-red-800 bg-red-950 text-red-200">
            Failed to load review: {error}
          </div>
        )}

        {/* Summary */}
        <SectionCard title="Summary" loading={loading && !hasReview}>
          {safeStr(report?.review?.summary)
            ? <p className="text-neutral-300 leading-7">{report!.review!.summary}</p>
            : <LinesSkeleton lines={3} />}
        </SectionCard>

        {/* Strengths / Issues */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <SectionCard title="Strengths" loading={loading && !hasReview}>
            {report?.review?.strengths?.length
              ? <ul className="list-disc pl-5 space-y-1 text-neutral-300">
                  {uniq(report.review.strengths).map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              : <LinesSkeleton lines={4} />}
          </SectionCard>

          <SectionCard title="Top Issues" loading={loading && !hasReview}>
            {report?.review?.issues?.length
              ? <ol className="list-decimal pl-5 space-y-1 text-neutral-300">
                  {uniq(report.review.issues).map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              : <LinesSkeleton lines={4} />}
          </SectionCard>
        </div>

        {/* Tone Coaching */}
        <SectionCard className="mt-4" title="Tone Coaching" loading={loading && !hasReview}>
          {report?.review?.toneCoaching?.length
            ? <ul className="grid gap-2 sm:grid-cols-2 text-neutral-300">
                {uniq(report.review.toneCoaching).map((tip, i) => (
                  <li key={i} className="p-3 rounded-lg border border-neutral-800 bg-neutral-950">{tip}</li>
                ))}
              </ul>
            : <LinesSkeleton lines={4} />}
        </SectionCard>

        {/* English Coaching */}
        <SectionCard className="mt-4" title="English Coaching" loading={loading && !hasReview}>
          {report?.review ? (
            <div className="space-y-6">
              {/* Patterns */}
              <div>
                <div className="text-xs text-neutral-400 mb-1">Patterns</div>
                {report.review.englishCoaching?.patterns?.length
                  ? <ul className="list-disc pl-5 space-y-1 text-neutral-300">
                      {uniq(report.review.englishCoaching.patterns).map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  : <LinesSkeleton lines={3} />}
              </div>

              {/* Examples */}
              <div>
                <div className="text-xs text-neutral-400 mb-2">Examples</div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {Array.isArray(report.review.englishCoaching?.examples) && report.review.englishCoaching.examples.length > 0
                    ? report.review.englishCoaching.examples.map((ex, i) => (
                        <div key={i} className="p-3 rounded-lg border border-neutral-800 bg-neutral-950">
                          <div className="text-sm"><span className="text-neutral-400">Bad:</span> “{ex.bad}”</div>
                          <div className="text-sm"><span className="text-neutral-400">Better:</span> “{ex.better}”</div>
                          <div className="text-xs text-neutral-500 mt-1">{ex.why}</div>
                        </div>
                      ))
                    : (<><LinesSkeleton lines={3} /><LinesSkeleton lines={3} /></>)}
                </div>
              </div>

              {/* Vocabulary */}
              <div>
                <div className="text-xs text-neutral-400 mb-1">New Vocabulary</div>
                {Array.isArray(report.review.englishCoaching?.newVocabulary) && report.review.englishCoaching.newVocabulary.length > 0
                  ? <ul className="list-disc pl-5 space-y-1 text-neutral-300">
                      {report.review.englishCoaching.newVocabulary.map((v, i) => (
                        <li key={i}><span className="font-medium">{v.word}</span>: {v.usage}</li>
                      ))}
                    </ul>
                  : <LinesSkeleton lines={3} />}
              </div>
            </div>
          ) : <LinesSkeleton lines={6} />}
        </SectionCard>

        {/* 7-day Plan */}
        <SectionCard className="mt-4" title="7-Day Plan" loading={loading && !hasReview}>
          {report?.review?.sevenDayPlan?.length
            ? <ol className="relative pl-6 space-y-3 text-neutral-300">
                {uniq(report.review.sevenDayPlan).map((s, i) => (
                  <li key={i} className="relative">
                    <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-emerald-500" />
                    {s}
                  </li>
                ))}
              </ol>
            : <LinesSkeleton lines={5} />}
        </SectionCard>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              try {
                const obj = report ?? { error: "No report loaded" };
                const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `report-${rid || params.id}.json`;
                a.click();
                URL.revokeObjectURL(url);
              } catch {}
            }}
            className="px-4 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-200 hover:bg-neutral-800"
          >
            Download JSON
          </a>

          <button
            onClick={() => {
              try {
                navigator.clipboard.writeText(window.location.href).catch(() => {});
              } catch {}
            }}
            className="px-4 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-200 hover:bg-neutral-800"
            title="Copy a link to this report (works while the API is running)"
          >
            Copy report link
          </button>

          <Link
            href={`/session/${params.id}`}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-black font-medium hover:brightness-95"
          >
            Start Another Session
          </Link>
        </div>

        <p className="mt-4 text-xs text-neutral-600">
          Coaching scores and AI feedback are directional, not clinical. In this demo, reports are
          stored in memory and reset when the API restarts — use “Download JSON” to keep a copy.
        </p>
      </section>
    </main>
  );
}

/* ------------------------------- Sub-UI ------------------------------- */

function Chip({ children, tone }: { children: React.ReactNode; tone: "good" | "bad" | "warn" }) {
  const base = "px-2 py-0.5 rounded-full border text-[11px] leading-none";
  const cls =
    tone === "good"
      ? "bg-emerald-600/15 border-emerald-700 text-emerald-200"
      : tone === "bad"
      ? "bg-red-600/15 border-red-700 text-red-200"
      : "bg-amber-600/15 border-amber-700 text-amber-200";
  return <span className={`${base} ${cls}`}>{children}</span>;
}

function TipPill({ text }: { text: string }) {
  return (
    <span className="text-sm px-2.5 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-200 hover:bg-neutral-800 transition">
      {text}
    </span>
  );
}

function TipsSkeleton() {
  return (
    <div className="flex flex-wrap gap-2 w-full">
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className="h-6 w-28 rounded-full bg-neutral-900 border border-neutral-800 animate-pulse" />
      ))}
    </div>
  );
}

function LinesSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 rounded bg-neutral-900 border border-neutral-800 animate-pulse" />
      ))}
    </div>
  );
}

function SectionCard({
  title,
  children,
  loading,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <section className={`bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 backdrop-blur ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm text-neutral-300 font-medium">{title}</h3>
        {loading && <span className="text-xs text-neutral-500">loading…</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  accent = "emerald",
  icon,
}: {
  label: string;
  value?: number;
  accent?: "emerald" | "sky" | "violet" | "amber";
  icon?: React.ReactNode;
}) {
  const v = clamp(Math.round(value ?? 0), 0, 100);
  const bar =
    accent === "emerald"
      ? "bg-emerald-500"
      : accent === "sky"
      ? "bg-sky-500"
      : accent === "violet"
      ? "bg-violet-500"
      : "bg-amber-500";
  return (
    <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800">
      <div className="flex items-center gap-2">
        {icon}
        <div className="text-xs text-neutral-400">{label}</div>
      </div>
      <div className="text-3xl font-bold mt-0.5">{v}</div>
      <div className="mt-2 h-2 rounded-full bg-neutral-800 overflow-hidden">
        <div className={`h-full ${bar} transition-[width] duration-700`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function ScoreRing({ score = 0 }: { score: number }) {
  const size = 136;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = clamp(score, 0, 100);
  const dash = (pct / 100) * c;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        <defs>
          <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#g)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all duration-700 drop-shadow-[0_0_16px_rgba(34,197,94,0.35)]"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-sm text-neutral-400">Score</span>
      </div>
    </div>
  );
}

/* ------------------------------- Icons ------------------------------- */
function BarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20V8M10 20V4M16 20v-6M22 20V10" strokeLinecap="round" />
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-sky-400" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3" strokeLinecap="round" />
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-violet-400" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="7" r="3" /><path d="M5 21c0-4 3-7 7-7s7 3 7 7" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h12M4 18h8" strokeLinecap="round" />
    </svg>
  );
}
