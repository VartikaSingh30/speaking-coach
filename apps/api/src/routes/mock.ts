// apps/api/src/routes/mock.ts
import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";

import {
  addMockSession,
  findMockById,
  updateMockSession,
  MockSession,
  MockQuestion,
  MockAnswerFeedback,
} from "../db/mock-models.js";

import {
  generateQuestionSet,
  judgeAnswer,
  finalizeMock,
  type QuestionGenReq,
  type JudgeReq,
  type FinalizeReq,
} from "../services/gemini-mock.js";

export const mockRouter = Router();

/** -------------------- helpers -------------------- */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Convert 0–100 content score to 0–10 UI score */
function toTen(score100: number) {
  const s = Math.round(clamp(score100, 0, 100) / 10);
  return clamp(s, 0, 10);
}

/** Safe JSON body field helpers (renamed to avoid collisions) */
function asString(v: any, d = "") {
  return typeof v === "string" ? v : d;
}
function asNumber(v: any, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

/** Fallback question generator if Gemini is unavailable */
function fallbackQuestions(role: string, difficulty: "easy" | "medium" | "hard", n: number): MockQuestion[] {
  const base = [
    `Tell me about a time you led a project as a ${role}.`,
    `What’s a challenging ${role} problem you solved recently?`,
    `How do you handle conflict or disagreement on a team as a ${role}?`,
    `Walk me through a design/decision you made for a ${role} task.`,
    `How do you measure success in this ${role} role?`,
    `Describe a failure in a ${role} context and what you learned.`,
    `How do you prioritize tasks under pressure as a ${role}?`,
    `Explain a complex concept for a non-technical audience.`,
    `What would you improve in our product from a ${role} perspective?`,
  ];
  const out: MockQuestion[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `q${i + 1}`,
      text: `${base[i % base.length]} (difficulty: ${difficulty})`,
      guidance: "Use concise, top-down structure. Add one concrete example.",
      targetCapabilities: ["communication", "ownership", "problem solving"],
    });
  }
  return out;
}

/** -------------------- Routes -------------------- */

/** POST /mock/start  -> { mockId } */
mockRouter.post("/start", async (req: Request, res: Response) => {
  try {
    const role = (asString(req.body?.role, "Software Engineer").trim() || "Software Engineer").slice(0, 120);
    const rawDifficulty = asString(req.body?.difficulty, "medium").toLowerCase();
    const difficulty = (["easy", "medium", "hard"].includes(rawDifficulty)
      ? rawDifficulty
      : "medium") as "easy" | "medium" | "hard";
    const numQuestions = clamp(Math.round(asNumber(req.body?.numQuestions, 5)), 3, 10);

    // Try Gemini for question generation; fallback gracefully
    let questions: MockQuestion[] = [];
    try {
      const gen = await generateQuestionSet({ role, difficulty, numQuestions } as QuestionGenReq);
      questions = (gen.questions || []).map((q, i) => ({
        id: q.id || `q${i + 1}`,
        text: q.text?.trim() || `Question ${i + 1} for ${role}`,
        guidance: q.guidance?.trim() || undefined,
        targetCapabilities: Array.isArray(q.targetCapabilities) ? q.targetCapabilities : undefined,
      }));
      if (!questions.length) throw new Error("empty question set");
    } catch {
      questions = fallbackQuestions(role, difficulty, numQuestions);
    }

    const mockId = randomUUID();
    const session: MockSession = {
      mockId,
      createdAt: new Date(),
      role,
      difficulty,
      numQuestions,
      questions,
      answers: [],
    };
    addMockSession(session);

    res.json({ mockId });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed to start mock" });
  }
});

/** GET /mock/:id/next -> { index, total, question, guidance? } */
mockRouter.get("/:id/next", (req: Request, res: Response) => {
  const session = findMockById(req.params.id);
  if (!session) return res.status(404).json({ error: "mock not found" });

  const idx = session.answers.length; // next unanswered index
  const total = session.numQuestions;

  if (idx >= total) {
    return res.json({ index: idx, total, question: "" });
  }

  const q = session.questions[idx];
  res.json({
    index: idx,
    total,
    question: q.text,
    guidance: q.guidance || undefined,
  });
});

/**
 * POST /mock/:id/answer  -> { ok: true }
 * Body: { index: number, transcript: string, metrics: any }
 * Stores the answer for the given index. DOES NOT grade.
 */
mockRouter.post("/:id/answer", (req: Request, res: Response) => {
  const session = findMockById(req.params.id);
  if (!session) return res.status(404).json({ error: "mock not found" });

  const idx = asNumber(req.body?.index, -1);
  const transcript = asString(req.body?.transcript, "");
  const _metrics = req.body?.metrics ?? {};

  if (idx < 0 || idx !== session.answers.length) {
    // Strict: must answer the next expected question
    return res.status(400).json({ error: "index mismatch" });
  }

  const q = session.questions[idx];
  if (!q) return res.status(400).json({ error: "no question at index" });

  const entry: MockAnswerFeedback = {
    questionId: q.id,
    answer: transcript,
    scoreContent: 0, // will be set at /end
    rubric: { understanding: 0, structure: 0, depth: 0, examples: 0, clarity: 0 },
    notes: [],
    suggestedBetterAnswer: undefined,
    // if you’ve added `metrics?: any` to MockAnswerFeedback, you could store: metrics: _metrics
  };
  session.answers.push(entry);

  res.json({ ok: true });
});

/**
 * POST /mock/:id/end -> { reportId }
 * Grades ALL answers at once, aggregates final, and stores a rich report.
 */
mockRouter.post("/:id/end", async (req: Request, res: Response) => {
  const session = findMockById(req.params.id);
  if (!session) return res.status(404).json({ error: "mock not found" });

  // If user ended early, pad with empty answers so grading length matches
  while (session.answers.length < session.numQuestions) {
    const q = session.questions[session.answers.length];
    session.answers.push({
      questionId: q.id,
      answer: "",
      scoreContent: 0,
      rubric: { understanding: 0, structure: 0, depth: 0, examples: 0, clarity: 0 },
      notes: [],
    });
  }

  // Grade each answer
  for (let i = 0; i < session.numQuestions; i++) {
    const q = session.questions[i];
    const a = session.answers[i];

    try {
      const judged = await judgeAnswer({
        role: session.role,
        difficulty: session.difficulty,
        question: q.text,
        answer: a.answer || "",
      } as JudgeReq);

      a.scoreContent = judged.scoreContent; // 0..100
      a.rubric = judged.rubric;
      a.notes = judged.notes || [];
      a.suggestedBetterAnswer = judged.suggestedBetterAnswer;
    } catch {
      a.notes = a.notes?.length ? a.notes : ["Automatic judging unavailable. Consider re-running later."];
    }
  }

  // Finalize panel readout
  const items: FinalizeReq["items"] = session.answers.map((a, i) => ({
    question: session.questions[i].text,
    scoreContent: a.scoreContent,
    rubric: a.rubric,
    notes: a.notes || [],
  }));

  let final;
  try {
    final = await finalizeMock({
      role: session.role,
      difficulty: session.difficulty,
      items,
    } as FinalizeReq);
  } catch {
    final = {
      overall: Math.round(
        (session.answers.reduce((sum, a) => sum + a.scoreContent, 0) / (session.answers.length || 1))
      ),
      signal: "Neutral" as const,
      summary: "Automatic finalization unavailable. Using average content score.",
      strengths: [],
      gaps: ["Practice with structure and concrete examples."],
      nextSteps: [
        "Do a 5-question mock with STAR.",
        "Record and reduce fillers with short pauses.",
        "Keep pace ~150–170 WPM and speak up."
      ],
    };
  }

  // Build report payload compatible with your frontend (0–10 per question)
  const reportId = `${session.mockId}-r`;
  const perQuestion = session.answers.map((a, i) => {
    const score10 = toTen(a.scoreContent);
    const feedback = [
      ...a.notes || [],
      a.suggestedBetterAnswer ? `Suggested improvement: ${a.suggestedBetterAnswer}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      question: session.questions[i].text,
      transcript: a.answer,
      metrics: {}, // attach if you store per-answer metrics
      score: score10,
      feedback,
    };
  });

  const total10 = Math.round(
    (perQuestion.reduce((sum, x) => sum + (x.score || 0), 0) / (perQuestion.length || 1)) * 10
  ) / 10;

  // Persist a rich report object in-memory on the session itself
  updateMockSession(session.mockId, {
    endedAt: new Date(),
    final: {
      overall: final.overall, // 0..100
      signal: final.signal,
      summary: final.summary,
      strengths: final.strengths,
      gaps: final.gaps,
      nextSteps: final.nextSteps,
    },
  });

  // Store a light report “view” map to serve the /report endpoint
  (globalThis as any).__REPORTS__ ||= new Map<string, any>();
  const REPORTS: Map<string, any> = (globalThis as any).__REPORTS__;
  REPORTS.set(reportId, {
    id: reportId,
    mockId: session.mockId,
    role: session.role,
    difficulty: session.difficulty,
    totalScore: total10,     // 0..10
    perQuestion,
    createdAt: Date.now(),
    summary: final.summary,
    strengths: final.strengths,
    improvements: final.gaps,
    readiness: final.overall >= 85 ? "strong" : final.overall >= 65 ? "moderate" : "needs-work",
    plan7d: final.nextSteps,
  });

  return res.json({ reportId });
});

/** GET /mock/:id/report?rid=... -> report JSON */
mockRouter.get("/:id/report", (req: Request, res: Response) => {
  const rid = asString(req.query?.rid, "");
  const REPORTS: Map<string, any> | undefined = (globalThis as any).__REPORTS__;
  if (!REPORTS) return res.status(404).json({ error: "report not found" });

  const r = REPORTS.get(rid);
  if (!r || r.mockId !== req.params.id) return res.status(404).json({ error: "report not found" });

  res.json(r);
});
