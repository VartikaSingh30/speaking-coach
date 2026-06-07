// app/mock/[id]/report/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/** -------- Types (supports rich API but works if you return only the basics) -------- */
type DeliveryMetrics = {
  avgWpm?: number;
  fillerPerMin?: number;
  loudnessDb?: number;
  eyeContactPct?: number;
  smilePct?: number;
};

type PerQuestion = {
  question: string;
  transcript: string;
  metrics?: DeliveryMetrics;
  score?: number;           // 0..10
  feedback?: string;        // model feedback per question
  strengths?: string[];     // optional (API)
  improvements?: string[];  // optional (API)
};

type Report = {
  id: string;
  mockId: string;
  role: string;
  difficulty: "easy" | "medium" | "hard";
  totalScore: number;             // 0..10
  perQuestion: PerQuestion[];
  createdAt: number;

  // Optional, if your API returns them
  summary?: string;               // short executive summary
  strengths?: string[];           // global strengths
  improvements?: string[];        // global areas to improve
  readiness?: "strong" | "moderate" | "needs-work";
  plan7d?: string[];              // 7-day plan bullets
};

/** ----------------------- Helpers to derive insights ----------------------- */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function toPct(n?: number) {
  if (typeof n !== "number" || Number.isNaN(n)) return 0;
  return clamp(Math.round(n), 0, 100);
}
function paceAdvice(wpm?: number) {
  if (!wpm && wpm !== 0) return { label: "—", color: "neutral" as const, tip: "" };
  if (wpm < 120) return { label: `${wpm} WPM · slow`, color: "warn" as const, tip: "Speed up ~10–20% to sound engaged." };
  if (wpm > 190) return { label: `${wpm} WPM · fast`, color: "warn" as const, tip: "Slow down a touch and add pauses for clarity." };
  return { label: `${wpm} WPM · good`, color: "good" as const, tip: "" };
}
function fillerAdvice(fpm?: number) {
  if (!fpm && fpm !== 0) return { label: "—", color: "neutral" as const, tip: "" };
  if (fpm > 8) return { label: `${fpm}/min · high`, color: "warn" as const, tip: "Replace fillers with short pauses; breathe before key points." };
  if (fpm > 5) return { label: `${fpm}/min · med`, color: "warn" as const, tip: "Use a beat of silence instead of 'um'." };
  return { label: `${fpm}/min · good`, color: "good" as const, tip: "" };
}
function loudAdvice(db?: number) {
  if (typeof db !== "number") return { label: "—", color: "neutral" as const };
  if (db < -50) return { label: `${db} dB · very soft`, color: "warn" as const };
  if (db < -35) return { label: `${db} dB · soft`, color: "warn" as const };
  return { label: `${db} dB · clear`, color: "good" as const };
}
function readinessFromScore(score: number): Report["readiness"] {
  if (score >= 8.5) return "strong";
  if (score >= 6.5) return "moderate";
  return "needs-work";
}

/** Try to infer strengths/areas if backend didn't generate them */
function inferGlobal(report: Report) {
  const strengths = new Set<string>();
  const areas = new Set<string>();

  report.perQuestion.forEach((q) => {
    const m = q.metrics || {};
    if ((m.avgWpm ?? 0) >= 130 && (m.avgWpm ?? 0) <= 185) strengths.add("Good speaking pace");
    if ((m.fillerPerMin ?? 0) <= 5) strengths.add("Low filler words");
    if ((m.eyeContactPct ?? 0) >= 55) strengths.add("Solid eye contact");
    if ((m.smilePct ?? 0) >= 35) strengths.add("Warm tone / presence");

    if ((m.avgWpm ?? 0) < 120) areas.add("Pace a bit slow — add energy");
    if ((m.avgWpm ?? 0) > 190) areas.add("Pace too fast — add pauses");
    if ((m.fillerPerMin ?? 0) > 6) areas.add("Too many fillers — practice silent beats");
    if ((m.eyeContactPct ?? 0) < 40) areas.add("Raise eye contact toward camera");
    if ((m.loudnessDb ?? -45) < -45) areas.add("Speak up for clarity");
  });

  return {
    strengths: report.strengths?.length ? report.strengths : Array.from(strengths),
    improvements: report.improvements?.length ? report.improvements : Array.from(areas),
  };
}

/** Fallback 7-day plan if backend didn't provide one */
function defaultPlan(): string[] {
  return [
    "Day 1: Record 2× 60s answers; focus on fewer fillers. Re-listen and tally.",
    "Day 2: Practice pause/pace: deliver 3 bullets with 1s breath between each.",
    "Day 3: Eye contact drill: answer while looking into the camera lens for 30s chunks.",
    "Day 4: STAR structure: pick 3 stories; outline Situation → Task → Action → Result.",
    "Day 5: Projection: read a paragraph at +10% volume; keep articulation crisp.",
    "Day 6: Mock round of 5 questions; time each; write a 1-line takeaway per answer.",
    "Day 7: Full mock; compare metrics vs. Day 1; note two wins and one focus area.",
  ];
}

/** Small UI atoms */
function Pill({ tone = "neutral", children }: { tone?: "good" | "warn" | "neutral"; children: React.ReactNode }) {
  const cls =
    tone === "good"
      ? "bg-emerald-600/15 border-emerald-700 text-emerald-200"
      : tone === "warn"
      ? "bg-amber-600/15 border-amber-700 text-amber-100"
      : "bg-neutral-900 border-neutral-700 text-neutral-300";
  return <span className={`inline-flex items-center px-2 py-0.5 text-[11px] rounded-full border ${cls}`}>{children}</span>;
}

function Bar({ valuePct }: { valuePct: number }) {
  const w = clamp(Math.round(valuePct), 0, 100);
  return (
    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
      <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-[width] duration-300" style={{ width: `${w}%` }} />
    </div>
  );
}

export default function MockReport({ params }: { params: { id: string } }) {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL as string) || "";
  const sp = useSearchParams();
  const rid = sp.get("rid") || "";
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!apiUrl || !rid) throw new Error("Missing API URL or rid");
        const r = await fetch(`${apiUrl}/mock/${params.id}/report?rid=${encodeURIComponent(rid)}`, { cache: "no-store" });
        const text = await r.text();
        const j: Report = text ? JSON.parse(text) : ({} as any);
        if (!r.ok) throw new Error((j as any)?.error || `Failed (${r.status})`);
        if (!cancelled) setReport(j);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load report");
      }
    })();
    return () => { cancelled = true; };
  }, [apiUrl, params.id, rid]);

  const derived = useMemo(() => {
    if (!report) return { strengths: [], improvements: [], readiness: "needs-work" as Report["readiness"] };
    const base = inferGlobal(report);
    const readiness = report.readiness || readinessFromScore(report.totalScore || 0);
    return { strengths: base.strengths, improvements: base.improvements, readiness };
  }, [report]);

  if (err) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <div className="rounded-xl border border-red-800 bg-red-950 text-red-100 p-3 text-sm">{err}</div>
        <Link href="/" className="mt-4 inline-block text-neutral-300 hover:text-white">← Home</Link>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <div className="text-neutral-400">Loading report…</div>
      </main>
    );
  }

  const readinessTone =
    derived.readiness === "strong" ? "good" : derived.readiness === "moderate" ? "neutral" : "warn";

  return (
    <main className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mock Report</h1>
        <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">← Home</Link>
      </div>

      <div className="mt-3 text-sm text-neutral-400 flex flex-wrap gap-2 items-center">
        Role: <span className="text-neutral-200">{report.role}</span> •
        Difficulty: <span className="text-neutral-200 capitalize">{report.difficulty}</span> •
        <Pill tone={readinessTone}>Readiness: {derived.readiness}</Pill>
      </div>

      {/* Overall */}
      <section className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-sm text-neutral-400">Overall</div>
            <div className="mt-1 text-4xl font-extrabold">{report.totalScore}/10</div>
          </div>
          {report.summary ? (
            <p className="text-sm text-neutral-300 max-w-xl">{report.summary}</p>
          ) : null}
        </div>
      </section>

      {/* Strengths / Areas */}
      <section className="mt-4 grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-emerald-700/40 bg-emerald-600/10 p-4">
          <h2 className="text-sm font-medium text-emerald-200">Strengths</h2>
          <ul className="mt-2 space-y-1 text-sm text-neutral-200">
            {derived.strengths?.length ? derived.strengths.map((s, i) => <li key={i}>• {s}</li>) : <li>• Clear delivery on several answers</li>}
          </ul>
        </div>
        <div className="rounded-2xl border border-amber-700/40 bg-amber-600/10 p-4">
          <h2 className="text-sm font-medium text-amber-100">Areas to improve</h2>
          <ul className="mt-2 space-y-1 text-sm text-neutral-200">
            {derived.improvements?.length ? derived.improvements.map((s, i) => <li key={i}>• {s}</li>) : (
              <>
                <li>• Reduce filler words with short pauses</li>
                <li>• Keep pace near 150–170 WPM for clarity</li>
              </>
            )}
          </ul>
        </div>
      </section>

      {/* 7-day plan */}
      <section className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
        <h2 className="text-base font-semibold">7-day practice plan</h2>
        <ol className="mt-2 space-y-1 text-sm text-neutral-300 list-decimal list-inside">
          {(report.plan7d && report.plan7d.length ? report.plan7d : defaultPlan()).map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ol>
      </section>

      {/* Per question */}
      <div className="mt-6 space-y-4">
        {report.perQuestion.map((q, i) => {
          const p = paceAdvice(q.metrics?.avgWpm);
          const f = fillerAdvice(q.metrics?.fillerPerMin);
          const loud = loudAdvice(q.metrics?.loudnessDb);
          const eyePct = toPct(q.metrics?.eyeContactPct);
          const smilePct = toPct(q.metrics?.smilePct);

          // If API didn’t add targeted improvements, synthesize basic ones
          const fixes = q.improvements?.length ? q.improvements : [
            ...(p.tip ? [p.tip] : []),
            ...(f.tip ? [f.tip] : []),
            eyePct < 45 ? ["Raise eye contact; anchor gaze near lens."] : [],
            (q.metrics?.loudnessDb ?? -50) < -45 ? ["Project voice; sit tall and aim voice at the mic."] : [],
          ].flat();

          const strengths = q.strengths?.length ? q.strengths : [
            p.color === "good" ? "Comfortable pace" : "",
            f.color === "good" ? "Low filler rate" : "",
            eyePct >= 55 ? "Good eye contact" : "",
            smilePct >= 35 ? "Warm tone" : "",
          ].filter(Boolean);

          return (
            <section key={i} className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-base font-semibold">Q{i + 1}</h2>
                <div className="text-sm">Score: <span className="font-semibold">{q.score ?? "—"}/10</span></div>
              </div>

              <p className="mt-2 text-neutral-200">{q.question}</p>

              <div className="mt-3">
                <div className="text-xs text-neutral-400 mb-1">Your answer</div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 whitespace-pre-wrap text-sm text-neutral-200">
                  {q.transcript || <span className="text-neutral-500">—</span>}
                </div>
              </div>

              {/* Delivery metrics */}
              <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Metric title="Pace" badge={p.label} tone={p.color}>
                  <Bar valuePct={q.metrics?.avgWpm ? clamp((q.metrics.avgWpm / 190) * 100, 0, 100) : 0} />
                </Metric>
                <Metric title="Fillers" badge={f.label} tone={f.color}>
                  <Bar valuePct={q.metrics?.fillerPerMin != null ? clamp(((8 - q.metrics.fillerPerMin) / 8) * 100, 0, 100) : 0} />
                </Metric>
                <Metric title="Loudness" badge={loud.label} tone={loud.color as any}>
                  <Bar valuePct={q.metrics?.loudnessDb != null ? clamp(((q.metrics.loudnessDb + 80) / 75) * 100, 0, 100) : 0} />
                </Metric>
                <Metric title="Eye contact" badge={`${eyePct}%`} tone={eyePct >= 55 ? "good" : eyePct <= 40 ? "warn" : "neutral"}>
                  <Bar valuePct={eyePct} />
                </Metric>
                <Metric title="Smile" badge={`${smilePct}%`} tone={smilePct >= 35 ? "good" : "neutral"}>
                  <Bar valuePct={smilePct} />
                </Metric>
              </div>

              {/* Strengths & Fixes per question */}
              <div className="mt-4 grid md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-700/40 bg-emerald-600/10 p-3">
                  <div className="text-xs font-medium text-emerald-200">What worked</div>
                  <ul className="mt-1 space-y-1 text-sm text-neutral-200">
                    {strengths.length ? strengths.map((s, j) => <li key={j}>• {s}</li>) : <li>• Clear point made</li>}
                  </ul>
                </div>
                <div className="rounded-lg border border-amber-700/40 bg-amber-600/10 p-3">
                  <div className="text-xs font-medium text-amber-100">How to level up</div>
                  <ul className="mt-1 space-y-1 text-sm text-neutral-200">
                    {fixes.length ? fixes.map((s, j) => <li key={j}>• {s}</li>) : <li>• Add a concrete example or metric.</li>}
                  </ul>
                </div>
              </div>

              {/* Model feedback if available */}
              {q.feedback ? (
                <div className="mt-3 rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 text-sm text-neutral-200">
                  <span className="text-neutral-300 font-medium">Reviewer note:</span> {q.feedback}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </main>
  );
}

/** Metric card */
function Metric({
  title,
  badge,
  tone = "neutral",
  children,
}: {
  title: string;
  badge?: string;
  tone?: "good" | "warn" | "neutral";
  children: React.ReactNode;
}) {
  const border =
    tone === "good"
      ? "border-emerald-700/40"
      : tone === "warn"
      ? "border-amber-700/40"
      : "border-neutral-700/60";
  const chip =
    tone === "good"
      ? "bg-emerald-600/15 border-emerald-700 text-emerald-200"
      : tone === "warn"
      ? "bg-amber-600/15 border-amber-700 text-amber-100"
      : "bg-neutral-900 border-neutral-700 text-neutral-300";
  return (
    <div className={`rounded-lg border ${border} bg-neutral-950 p-3`}>
      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-400">{title}</div>
        {badge ? <span className={`text-[11px] px-2 py-0.5 rounded-full border ${chip}`}>{badge}</span> : null}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
