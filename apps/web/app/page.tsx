"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import { GradientButton } from "../components/GradientButton";
import { ScenarioCard } from "../components/ScenarioCard";
import { Feature } from "../components/Feature";
import { SectionCard } from "../components/SectionCard";
import { Badge, LiveDot } from "../components/Badge";
import {
  ArrowRight,
  Check,
  Mic,
  Eye,
  Smile,
  Gauge,
  Waveform,
  Stars,
  Shield,
  Doc,
  Sparkle,
} from "../components/icons";

/* ------------------------------- Types ------------------------------- */
type Health = { ok: boolean; uptime?: number; version?: string } | null;

const SCENARIOS = [
  { id: "interview", label: "Interview", blurb: "Behavioral & role-specific prompts", icon: <Stars /> },
  { id: "presentation", label: "Presentation", blurb: "Clear, structured delivery", icon: <Waveform /> },
  { id: "standup", label: "Daily Standup", blurb: "Concise, blocker-first updates", icon: <Gauge /> },
] as const;

/* ------------------------------- Home -------------------------------- */
export default function Home() {
  const router = useRouter();
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL as string) || "";
  const envWarning = !apiUrl ? "Missing NEXT_PUBLIC_API_URL — set it in apps/web/.env.local" : null;

  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]["id"]>("interview");
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<Health>(null);
  const [error, setError] = useState<string | null>(null);

  const announce = useCallback((msg: string) => {
    const el = document.getElementById("aria-live");
    if (el) el.textContent = msg;
  }, []);

  // Health probe (soft-fail)
  useEffect(() => {
    let cancelled = false;
    async function ping() {
      if (!apiUrl) return;
      try {
        const r = await fetch(`${apiUrl}/healthz`, { cache: "no-store" });
        if (cancelled) return;
        setHealth(r.ok ? { ok: true, ...(await r.json().catch(() => ({}))) } : { ok: false });
      } catch {
        if (!cancelled) setHealth({ ok: false });
      }
    }
    ping();
    const id = setInterval(ping, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [apiUrl]);

  // Keyboard: S → start live, M → mock interview
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const typing = (e.target as HTMLElement)?.closest("input,select,textarea");
      if (typing) return;
      if (k === "s" && !loading && !envWarning) {
        e.preventDefault();
        startSession(scenario);
      }
      if (k === "m") {
        e.preventDefault();
        goMock();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading, envWarning, scenario]); // eslint-disable-line

  async function startSession(s: string) {
    if (!apiUrl) return;
    setError(null);
    setLoading(true);
    announce("Starting session…");
    try {
      const res = await fetch(`${apiUrl}/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: s }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.sessionId) {
        throw new Error(json?.error || `Failed to start session (${res.status})`);
      }
      announce("Session created. Redirecting to live view.");
      router.push(`/session/${json.sessionId}`);
    } catch (e: any) {
      const msg = e?.message || "Unable to start session. Please try again.";
      setError(msg);
      announce(msg);
    } finally {
      setLoading(false);
    }
  }

  function goMock() {
    router.push("/mock");
  }

  const healthChip = useMemo(() => {
    if (health?.ok)
      return (
        <Badge tone="good">
          <LiveDot /> API healthy{health?.version ? ` · v${health.version}` : ""}
        </Badge>
      );
    if (health && !health.ok) return <Badge tone="warn">API unreachable</Badge>;
    return <Badge tone="neutral">Checking API…</Badge>;
  }, [health]);

  return (
    <div className="relative">
      {/* ============================ HERO ============================ */}
      <section
        className="mt-4 overflow-hidden rounded-3xl border border-neutral-900 bg-neutral-950
          bg-[radial-gradient(120rem_36rem_at_30%_-20%,#22c55e20,transparent),radial-gradient(80rem_24rem_at_90%_-20%,#38bdf81a,transparent)]"
      >
        <div className="grid gap-10 px-6 py-12 md:grid-cols-[1.2fr,1fr] md:px-10 md:py-16">
          {/* Left: value + CTAs */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-[11px] text-neutral-300">
              <LiveDot />
              Real-time coaching
              <span className="text-neutral-600">•</span>
              On-device vision
              <span className="text-neutral-600">•</span>
              AI review
            </div>

            <h1 className="mt-4 text-4xl font-extrabold tracking-tight md:text-6xl">
              Speak with clarity.
              <br />
              <span className="text-gradient bg-gradient-to-br from-emerald-400 to-emerald-600">
                Interview with confidence.
              </span>
            </h1>

            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutral-300">
              Echo listens while you speak, tracks pace, fillers, eye contact and tone in real time,
              then turns your words into a personalized coaching report — complete with quick wins
              and a 7-day plan.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <GradientButton onClick={() => startSession(scenario)} disabled={loading || !!envWarning}>
                {loading ? (
                  <>
                    <Spinner size={16} /> Starting…
                  </>
                ) : (
                  <>
                    Start Live Session <ArrowRight />
                  </>
                )}
              </GradientButton>

              <GradientButton variant="ghost" onClick={goMock} title="Practice a full interview with graded answers">
                <Stars className="text-violet-400" /> Mock Interview <ArrowRight />
              </GradientButton>

              <div className="ml-1 flex items-center gap-2">
                <kbd className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300">S</kbd>
                <span className="text-xs text-neutral-500">live</span>
                <kbd className="ml-2 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300">M</kbd>
                <span className="text-xs text-neutral-500">mock</span>
              </div>

              <div className="ml-auto">{healthChip}</div>
            </div>

            <ul className="mt-6 grid gap-2 text-sm text-neutral-400">
              <li className="flex items-center gap-2"><Check className="text-emerald-400" /> Runs in modern browsers — no install</li>
              <li className="flex items-center gap-2"><Check className="text-emerald-400" /> Face tracking runs locally in your browser</li>
              <li className="flex items-center gap-2"><Check className="text-emerald-400" /> Open-source, local-first portfolio project</li>
            </ul>
          </div>

          {/* Right: Scenario picker */}
          <SectionCard
            title="Choose a scenario"
            right={envWarning ? <Badge tone="warn">Env missing</Badge> : <Badge tone="info">3 modes</Badge>}
          >
            <div className="grid gap-2">
              {SCENARIOS.map((s) => (
                <ScenarioCard
                  key={s.id}
                  id={s.id}
                  label={s.label}
                  blurb={s.blurb}
                  icon={s.icon}
                  selected={scenario === s.id}
                  onSelect={(id) => setScenario(id as typeof scenario)}
                />
              ))}
            </div>

            <div className="mt-3 text-[11px] text-neutral-500">
              Switch scenarios anytime — Echo adapts the coaching and review.
            </div>

            <div className="mt-4 rounded-lg border border-violet-600/30 bg-violet-500/10 px-3 py-2">
              <div className="flex items-center gap-2 text-[12px] text-violet-200">
                <Stars className="text-violet-300" />
                <span>
                  Want a full practice loop?{" "}
                  <button onClick={goMock} className="underline underline-offset-2 hover:text-white">
                    Try Mock Interview
                  </button>
                </span>
              </div>
            </div>
          </SectionCard>
        </div>
      </section>

      {/* Toasts */}
      {envWarning && (
        <div className="mt-6 rounded-xl border border-amber-800 bg-amber-950 p-3 text-sm text-amber-100">
          {envWarning}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl border border-red-800 bg-red-950 p-3 text-sm text-red-200">{error}</div>
      )}

      {/* ======================= HOW IT WORKS ======================= */}
      <section className="mt-14">
        <SectionHeader eyebrow="How it works" title="From first word to coaching report in four steps" />
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Feature step={1} icon={<Mic />} title="Capture" desc="Grant mic + camera. Audio streams to a live transcription pipeline; video stays in your browser." />
          <Feature step={2} icon={<Waveform />} title="Analyze live" desc="Rolling WPM, filler rate, loudness, eye contact and smile are computed every few hundred milliseconds." />
          <Feature step={3} icon={<Gauge />} title="Nudge" desc="Gentle, non-spammy nudges appear when pace drifts or fillers spike — without breaking your flow." />
          <Feature step={4} icon={<Doc />} title="Review" desc="On finish, Gemini drafts a structured report: strengths, fixes, English coaching and a 7-day plan." />
        </div>
      </section>

      {/* ====================== WHAT ECHO TRACKS ===================== */}
      <section className="mt-14">
        <SectionHeader eyebrow="What Echo tracks" title="Delivery signals, measured continuously" />
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Feature icon={<Gauge />} title="Pace (WPM)" desc="Rolling words-per-minute over a sliding window, with a healthy target band of ~140–170." />
          <Feature icon={<Waveform />} title="Filler words" desc="Detects “um”, “uh”, “like”, “you know” and more, reporting a per-minute rate." />
          <Feature icon={<Mic />} title="Loudness & speaking time" desc="Web Audio RMS estimates projection and how much of the session you actually spoke." />
          <Feature icon={<Eye />} title="Eye contact" desc="MediaPipe face landmarks estimate gaze direction toward the camera — computed on-device." />
          <Feature icon={<Smile />} title="Smile & warmth" desc="Blendshape signals approximate warmth and presence to round out delivery." />
          <Feature icon={<Stars />} title="AI review" desc="Gemini synthesizes the transcript + metrics into clarity, tone and English coaching." />
        </div>
      </section>

      {/* ====================== MOCK INTERVIEW ====================== */}
      <section className="mt-14">
        <div className="overflow-hidden rounded-3xl border border-violet-900/40 bg-gradient-to-br from-violet-950/40 to-neutral-950 p-6 md:p-10">
          <div className="grid items-center gap-8 md:grid-cols-[1.3fr,1fr]">
            <div>
              <Badge tone="info" className="mb-3">
                <Stars /> Mock Interview Mode
              </Badge>
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                A full interview loop, graded by AI
              </h2>
              <p className="mt-3 max-w-xl text-neutral-300">
                Pick a role and difficulty. Gemini generates role-aware questions, you answer with the
                same live meters as a session, and you get a per-question rubric, suggested stronger
                answers, and an overall hiring signal.
              </p>
              <ul className="mt-5 grid gap-2 text-sm text-neutral-400 sm:grid-cols-2">
                <li className="flex items-center gap-2"><Check className="text-violet-300" /> Role-aware question generation</li>
                <li className="flex items-center gap-2"><Check className="text-violet-300" /> Per-answer rubric (5 dimensions)</li>
                <li className="flex items-center gap-2"><Check className="text-violet-300" /> Suggested better answers</li>
                <li className="flex items-center gap-2"><Check className="text-violet-300" /> Readiness signal + 7-day plan</li>
              </ul>
              <div className="mt-6">
                <GradientButton variant="violet" onClick={goMock}>
                  Launch Mock Interview <ArrowRight />
                </GradientButton>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
              <div className="text-xs text-neutral-400">Sample readout</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold">7.8</span>
                <span className="text-neutral-500">/ 10</span>
                <Badge tone="good" className="ml-auto">Readiness: moderate</Badge>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                {[
                  ["Understanding", 82],
                  ["Structure", 71],
                  ["Depth", 64],
                  ["Examples", 58],
                  ["Clarity", 77],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex items-center gap-3">
                    <span className="w-28 text-neutral-400">{k}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                      <div className="h-full bg-gradient-to-r from-violet-400 to-violet-500" style={{ width: `${v}%` }} />
                    </div>
                    <span className="w-8 text-right text-neutral-300">{v as number}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-neutral-600">Illustrative example — not real user data.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== TRUST / TECH ===================== */}
      <section className="mt-14 mb-6">
        <SectionHeader eyebrow="Built on a real-time stack" title="Engineered for low-latency feedback" />
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Feature icon={<Waveform />} title="Streaming transcription" desc="Audio is chunked every 250ms over WebSocket to Google Cloud Speech-to-Text for partial + final results." />
          <Feature icon={<Gauge />} title="Coaching socket" desc="A second WebSocket computes rolling metrics and emits compact coaching frames back to the UI." />
          <Feature icon={<Eye />} title="On-device vision" desc="MediaPipe Tasks Vision runs face landmarks in the browser — video frames never leave your device." />
          <Feature icon={<Shield />} title="Privacy-aware" desc="Audio/video are used only for live analysis during your session. Transcripts are lightly redacted before AI review." />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {["Next.js 14", "TypeScript", "Express", "WebSocket (ws)", "Google Cloud Speech", "Gemini 2.5 Flash", "MediaPipe", "Tailwind CSS", "Turborepo"].map((t) => (
            <Badge key={t} tone="neutral">{t}</Badge>
          ))}
        </div>
      </section>

      {/* Footnote */}
      <p className="mb-2 flex items-center gap-2 text-xs text-neutral-500">
        <Sparkle className="text-violet-300" />
        Echo is a local-first demo. Audio/video are used only for live analysis during a session.
      </p>
    </div>
  );
}

/* -------------------------- Small UI bits -------------------------- */
function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">{eyebrow}</div>
      <h2 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{title}</h2>
    </div>
  );
}

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-label="loading"
      className="inline-block animate-spin rounded-full border-[2px] border-neutral-700 border-t-neutral-200"
      style={{ height: size, width: size }}
    />
  );
}
