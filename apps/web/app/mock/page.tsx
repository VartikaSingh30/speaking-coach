"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

const DIFF = ["easy", "medium", "hard"] as const;

export default function MockHome() {
  const router = useRouter();
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL as string) || "";

  const [role, setRole] = useState("Software Engineer — Backend");
  const [difficulty, setDifficulty] = useState<(typeof DIFF)[number]>("medium");
  const [num, setNum] = useState(5);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const disabled = !apiUrl || loading;

  async function start() {
    if (!apiUrl) {
      alert("Missing NEXT_PUBLIC_API_URL");
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch(`${apiUrl}/mock/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, difficulty, numQuestions: num }),
      });

      // Handle servers that return HTML on error (prevents “Unexpected token '<'...”)
      const raw = await r.text();
      let j: any = null;
      try { j = raw ? JSON.parse(raw) : null; } catch { /* HTML or plain text */ }

      if (!r.ok || !j?.mockId) {
        const hint = j?.error || (raw?.slice(0, 180) || "Unknown error");
        throw new Error(`Failed to start mock${j?.status ? ` (status ${j.status})` : ""}: ${hint}`);
      }
      router.push(`/mock/${j.mockId}`);
    } catch (e: any) {
      setErr(e?.message || "Failed to start mock");
    } finally {
      setLoading(false);
    }
  }

  const envWarning = useMemo(
    () => (!apiUrl ? "Missing NEXT_PUBLIC_API_URL — set it in your .env.local" : null),
    [apiUrl]
  );

  return (
    <main className="relative max-w-4xl mx-auto">
      <section className="mt-6 overflow-hidden rounded-3xl border border-neutral-900 bg-neutral-950
        bg-[radial-gradient(120rem_36rem_at_30%_-20%,#22c55e20,transparent),radial-gradient(80rem_24rem_at_90%_-20%,#38bdf81a,transparent)]">
        <div className="px-6 py-10 md:px-10 md:py-12 grid gap-8 md:grid-cols-[1.2fr,1fr]">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              Mock Interview
            </h1>
            <p className="text-neutral-300 mt-2 text-lg">
              Role-aware questions, per-answer grading, and a hiring-likelihood signal at the end.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-neutral-400">
              <li>• Camera + mic with live meters</li>
              <li>• Optional eye-contact & smile detection (toggle)</li>
              <li>• Instant feedback after each answer</li>
              <li>• Final report with strengths, gaps, and suggested practice</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
            <label className="block">
              <div className="text-sm text-neutral-300 mb-1">Role / Position</div>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2 text-sm"
                placeholder="e.g., Product Manager, Data Scientist, iOS Engineer"
              />
            </label>

            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <label className="block">
                <div className="text-sm text-neutral-300 mb-1">Difficulty</div>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as any)}
                  className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2 text-sm"
                >
                  {DIFF.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>

              <label className="block">
                <div className="text-sm text-neutral-300 mb-1"># of Questions</div>
                <input
                  type="number" min={3} max={10}
                  value={num}
                  onChange={(e) => setNum(Number(e.target.value))}
                  className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <button
              onClick={start}
              disabled={disabled}
              className="mt-4 inline-flex items-center justify-center rounded-xl px-4 py-2 bg-emerald-500 text-black font-semibold hover:brightness-95 disabled:opacity-60"
            >
              {loading ? "Starting…" : "Start Mock"}
            </button>

            {envWarning && (
              <div className="mt-3 rounded-lg border border-amber-800 bg-amber-950 text-amber-100 p-2 text-sm">
                {envWarning}
              </div>
            )}
            {err && (
              <div className="mt-3 rounded-lg border border-red-800 bg-red-950 text-red-200 p-2 text-sm">
                {err}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
