// Shared scoring helpers for Echo sessions.
//
// NOTE: apps/api/src/routes/session.ts currently keeps an in-sync copy of this
// logic to stay fully self-contained at runtime (tsx + ESM path edge cases).
// This module is the canonical, unit-tested reference. See docs/ROADMAP.md
// for the planned consolidation onto @echo/core.

export type Scores = {
  delivery: number;
  clarity: number;
  presence: number;
  structure: number;
  total: number;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
function rnd(v: number) {
  return Math.round(v);
}

/**
 * Heuristic structure score (0–100) derived from the transcript.
 * Rewards balanced length, coherent sentences, transitions, examples and a
 * clear opening. Deterministic and side-effect free for easy testing.
 */
export function structureScore(transcript: string): number {
  const text = (transcript || "").trim();
  if (!text) return 0;

  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const sentenceCount = sentences.length;
  const lower = " " + text.toLowerCase() + " ";

  // 1) Length balance (0–25)
  let lengthScore: number;
  if (wordCount < 20) lengthScore = (wordCount / 20) * 12;
  else if (wordCount <= 60) lengthScore = 12 + ((wordCount - 20) / 40) * 13;
  else if (wordCount <= 400) lengthScore = 25;
  else lengthScore = Math.max(15, 25 - ((wordCount - 400) / 200) * 5);

  // 2) Coherent sentences (0–25)
  const avgLen = sentenceCount ? wordCount / sentenceCount : wordCount;
  let sentenceScore = Math.min(15, (Math.min(sentenceCount, 8) / 8) * 15);
  const lenOk = avgLen >= 8 && avgLen <= 28;
  sentenceScore += lenOk ? 10 : Math.max(0, 10 - Math.abs(avgLen - 18) * 0.6);

  // 3) Transitions / signposting (0–25)
  const transitions = [
    "first", "second", "third", "then", "next", "finally", "because", "however",
    "therefore", "for example", "for instance", "in addition", "as a result",
    "overall", "in summary", "to summarize", "on the other hand", "meanwhile", "specifically",
  ];
  const transitionHits = transitions.reduce(
    (n, t) => n + (lower.includes(" " + t + " ") || lower.includes(" " + t) ? 1 : 0),
    0
  );
  const transitionScore = Math.min(25, transitionHits * 6);

  // 4) Examples / evidence (0–15)
  const exampleMarkers = ["for example", "for instance", "such as", "e.g", "one time", "in my last", "at my"];
  const hasExample = exampleMarkers.some((m) => lower.includes(m));
  const hasNumbers = /\d/.test(text);
  const exampleScore = (hasExample ? 10 : 0) + (hasNumbers ? 5 : 0);

  // 5) Opening clarity (0–10)
  const firstLen = sentences[0] ? sentences[0].split(/\s+/).filter(Boolean).length : 0;
  const openingScore = firstLen >= 5 && firstLen <= 30 ? 10 : firstLen > 0 ? 5 : 0;

  const total = lengthScore + sentenceScore + transitionScore + exampleScore + openingScore;
  return Math.round(clamp(total, 0, 100));
}

export function scoreSession(p: {
  avgWpm: number;
  fillerPerMin: number;
  eyeContactPct: number;
  smilePct: number;
  pauseMedianMs: number;
  transcript?: string;
}): Scores {
  const delivery = clamp(100 - Math.abs(p.avgWpm - 160) * 0.6 - Math.max(0, (350 - p.pauseMedianMs) / 15), 0, 100);
  const clarity = clamp(100 - p.fillerPerMin * 5, 0, 100);
  const presence = clamp(p.eyeContactPct * 0.6 + p.smilePct * 0.4, 0, 100);
  const structure = p.transcript && p.transcript.trim() ? structureScore(p.transcript) : 70;
  const total = Math.round(delivery * 0.3 + clarity * 0.25 + presence * 0.25 + structure * 0.2);
  return { delivery: rnd(delivery), clarity: rnd(clarity), presence: rnd(presence), structure, total };
}
