// apps/api/src/routes/session.ts
import { Router } from "express";
import {
  type Session,
  type Report,
  findSessionById,
  upsertSession,
  addReport,
  listReportsBySession,
  type ReviewLite,
} from "../db/models.js";
import { geminiReview, type Review as GeminiReview } from "../services/gemini-review.js";

export const router = Router();

/* ----------------------------------------------------------------
 * Utilities
 * ---------------------------------------------------------------- */
function genId(len = 12): string {
  // URL-safe; not crypto-strong (OK for demo). Use crypto.randomUUID() for DB IDs later.
  return Math.random().toString(36).slice(2, 2 + len);
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function sanitizeTranscript(s: unknown, max = 160_000): string {
  if (typeof s !== "string") return "";
  let out = s.slice(0, max);
  out = out.replace(/\s+/g, " ").trim();
  // mask emails/phones lightly
  out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
  out = out.replace(/\b(?:\+?\d[\d\-\s()]{7,}\d)\b/g, "[phone]");
  // collapse absurd punctuation runs
  out = out.replace(/[!?.,]{4,}/g, "...");
  return out;
}

/* ----------------------------------------------------------------
 * Scoring heuristic (tunable)
 * ---------------------------------------------------------------- */
type Scores = {
  delivery: number;
  clarity: number;
  presence: number;
  structure: number;
  total: number;
};

/**
 * Heuristic structure score (0–100) derived from the transcript.
 *
 * It rewards balanced length, a sensible number of coherent sentences,
 * explicit transitions, concrete examples/evidence, and a clear opening.
 * This is intentionally lightweight and deterministic (easy to unit-test);
 * a transcript-aware LLM pass could refine it later — see docs/ROADMAP.md.
 */
export function structureScore(transcript: string): number {
  const text = (transcript || "").trim();
  if (!text) return 0;

  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const sentenceCount = sentences.length;
  const lower = " " + text.toLowerCase() + " ";

  // 1) Length balance (0–25): reward ~60–400 words; penalize very short / rambling
  let lengthScore: number;
  if (wordCount < 20) lengthScore = (wordCount / 20) * 12;
  else if (wordCount <= 60) lengthScore = 12 + ((wordCount - 20) / 40) * 13;
  else if (wordCount <= 400) lengthScore = 25;
  else lengthScore = Math.max(15, 25 - ((wordCount - 400) / 200) * 5);

  // 2) Coherent sentences (0–25): enough sentences + healthy average length
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
  const transitionHits = transitions.reduce((n, t) => n + (lower.includes(" " + t + " ") || lower.includes(" " + t) ? 1 : 0), 0);
  const transitionScore = Math.min(25, transitionHits * 6);

  // 4) Examples / evidence (0–15)
  const exampleMarkers = ["for example", "for instance", "such as", "e.g", "one time", "in my last", "at my"];
  const hasExample = exampleMarkers.some((m) => lower.includes(m));
  const hasNumbers = /\d/.test(text);
  const exampleScore = (hasExample ? 10 : 0) + (hasNumbers ? 5 : 0);

  // 5) Opening clarity (0–10): a reasonably sized first sentence
  const firstLen = sentences[0] ? sentences[0].split(/\s+/).filter(Boolean).length : 0;
  const openingScore = firstLen >= 5 && firstLen <= 30 ? 10 : firstLen > 0 ? 5 : 0;

  const total = lengthScore + sentenceScore + transitionScore + exampleScore + openingScore;
  return Math.round(clamp(total, 0, 100));
}

function scoreSession(p: {
  avgWpm: number;
  fillerPerMin: number;
  eyeContactPct: number;
  smilePct: number;
  pauseMedianMs: number;
  transcript?: string;
}): Scores {
  const delivery = clamp(
    100 - Math.abs(p.avgWpm - 160) * 0.6 - Math.max(0, (350 - p.pauseMedianMs) / 15),
    0,
    100
  );
  const clarity = clamp(100 - p.fillerPerMin * 5, 0, 100);
  const presence = clamp(p.eyeContactPct * 0.6 + p.smilePct * 0.4, 0, 100);
  // Derived from the transcript when available; falls back to a neutral baseline.
  const structure = p.transcript && p.transcript.trim() ? structureScore(p.transcript) : 70;
  const total = Math.round(delivery * 0.3 + clarity * 0.25 + presence * 0.25 + structure * 0.2);

  return {
    delivery: Math.round(delivery),
    clarity: Math.round(clarity),
    presence: Math.round(presence),
    structure,
    total,
  };
}

/* ----------------------------------------------------------------
 * POST /session/start
 * ---------------------------------------------------------------- */
router.post("/start", (req, res) => {
  const scenario =
    typeof req.body?.scenario === "string" && req.body.scenario.trim()
      ? req.body.scenario.trim()
      : "interview";

  const sessionId = genId(12);

  const session: Session = {
    sessionId,
    scenario,
    createdAt: new Date(),
  };
  upsertSession(session);

  res.json({
    sessionId,
    scenario,
    wsUrl: process.env.WS_URL || "/ws/coaching",
  });
});

/* ----------------------------------------------------------------
 * POST /session/end
 * Collects metrics, generates scores, and (if transcript present) calls Gemini.
 * Returns the saved report (with review if available).
 * ---------------------------------------------------------------- */
router.post("/end", async (req, res) => {
  try {
    const sessionId: string = String(req.body?.sessionId ?? "").trim();
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: "Missing sessionId" });
    }

    // Inputs from client
    const transcript = sanitizeTranscript(req.body?.transcript);
    const durationMs = num(req.body?.durationMs, 0);
    const speakingRatioPct = clamp(num(req.body?.speakingRatioPct, 0), 0, 100);
    const avgLoudnessDb = num(req.body?.avgLoudnessDb, -30);

    const avgWpm = num(req.body?.avgWpm, 160);
    const fillerPerMin = num(req.body?.fillerPerMin, 4);
    const eyeContactPct = clamp(num(req.body?.eyeContactPct, 60), 0, 100);
    const smilePct = clamp(num(req.body?.smilePct, 35), 0, 100);
    const pauseMedianMs = num(req.body?.pauseMedianMs, 350);

    // Update session (create if /start was skipped)
    const existing = findSessionById(sessionId);
    const base: Session = existing ?? {
      sessionId,
      scenario: "unspecified",
      createdAt: new Date(),
    };
    upsertSession({
      ...base,
      endedAt: new Date(),
      transcript,
      avgWpm,
      fillerPerMin,
      eyeContactPct,
      smilePct,
      pauseMedianMs,
      speakingRatioPct,
      avgLoudnessDb,
      durationMs,
    });

    const scores = scoreSession({
      avgWpm,
      fillerPerMin,
      eyeContactPct,
      smilePct,
      pauseMedianMs,
      transcript,
    });

    // Optional: call Gemini for review (soft-fail, never blocks success of report)
    let review: ReviewLite | undefined;
    if (transcript && process.env.GEMINI_API_KEY) {
      const minutesSpoken = Math.max(0.5, (durationMs || 1) / 60000);
      try {
        const r: GeminiReview = await geminiReview({
          transcript,
          minutesSpoken,
          avgWpm,
          fillersPerMin: fillerPerMin,
          speakingRatioPct,
          avgLoudnessDb,
        });

        // Narrow to the ReviewLite shape we store
        review = {
          summary: r.summary,
          strengths: r.strengths,
          issues: r.issues,
          toneCoaching: r.toneCoaching,
          englishCoaching: r.englishCoaching,
          sevenDayPlan: r.sevenDayPlan,
          quickTips: r.quickTips,
          interviewRewrite: r.interviewRewrite
            ? {
                concise: r.interviewRewrite.concise,
                star: {
                  situation: r.interviewRewrite.star?.situation,
                  task: r.interviewRewrite.star?.task,
                  action: r.interviewRewrite.star?.action,
                  result: r.interviewRewrite.star?.result,
                  finalAnswer: r.interviewRewrite.star?.finalAnswer,
                },
                strongerPhrases: r.interviewRewrite.strongerPhrases,
                followUps: r.interviewRewrite.followUps,
              }
            : undefined,
        };
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.warn("[/session/end] geminiReview failed:", e?.message || String(e));
      }
    }

    // Persist the report — include the review if we got one
    const reportId = genId(12);
    const report: Report = {
      reportId,
      sessionId,
      scores,
      createdAt: new Date(),
      ...(review ? { review } : {}),
    };
    addReport(report);

    // Respond with everything the client needs right now
    res.json({ ok: true, scores, reportId, review: review ?? null });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/* ----------------------------------------------------------------
 * GET /session/:id  — session data
 * ---------------------------------------------------------------- */
router.get("/:id", (req, res) => {
  const s = findSessionById(req.params.id);
  if (!s) return res.status(404).json({ error: "Session not found" });
  res.json(s);
});

/* ----------------------------------------------------------------
 * GET /session/:sessionId/report/:reportId — report (includes review if present)
 * ---------------------------------------------------------------- */
router.get("/:sessionId/report/:reportId", (req, res) => {
  const list = listReportsBySession(req.params.sessionId);
  const report = list.find((r) => r.reportId === req.params.reportId);
  if (!report) return res.status(404).json({ error: "Report not found" });
  res.json(report);
});

/* ----------------------------------------------------------------
 * GET /session/:sessionId/review — newest report that has a review
 * Frontend can poll this without getting 404s.
 * ---------------------------------------------------------------- */
router.get("/:sessionId/review", (req, res) => {
  const list = listReportsBySession(req.params.sessionId);
  const withReview = list.find((r) => r.review);
  if (!withReview) {
    // Return 200 with a pending flag so clients don't treat it as an error
    return res.json({ pending: true });
  }
  res.json({
    reportId: withReview.reportId,
    review: withReview.review,
    scores: withReview.scores,
    createdAt: withReview.createdAt,
  });
});

/* ----------------------------------------------------------------
 * GET /session/:sessionId/reports — list all reports for a session
 * ---------------------------------------------------------------- */
router.get("/:sessionId/reports", (req, res) => {
  const list = listReportsBySession(req.params.sessionId);
  res.json({ items: list });
});
