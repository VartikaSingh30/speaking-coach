// apps/api/src/db/models.ts

/** ----------------------------------------------------------------
 * Review shape (kept local to avoid cross-package imports)
 * Keep in sync with services/gemini-review.ts (we store a "lite" view).
 * ---------------------------------------------------------------- */
export type ReviewLite = {
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
  quickTips: string[]; // concise (<= 10 words each)

  /** Optional interview-focused helpers (subset of the full Review) */
  interviewRewrite?: {
    concise?: string; // ~30–60s polished version
    star?: {
      situation?: string;
      task?: string;
      action?: string;
      result?: string;
      finalAnswer?: string; // cohesive STAR answer
    };
    strongerPhrases?: string[]; // sentence stems
    followUps?: string[];       // likely interviewer questions
  };
};

/** ----------------------------------------------------------------
 * Domain models
 * ---------------------------------------------------------------- */
export interface Session {
  _id?: string;            // for future MongoDB use
  sessionId: string;       // public identifier used by the app
  scenario: string;
  createdAt: Date;
  endedAt?: Date;

  // Captured content
  transcript?: string;

  // Basic delivery metrics
  avgWpm?: number;
  fillerPerMin?: number;
  eyeContactPct?: number;
  smilePct?: number;
  pauseMedianMs?: number;

  // Optional extras for richer AI review
  speakingRatioPct?: number;  // 0–100
  avgLoudnessDb?: number;     // rough RMS→dB estimate
  durationMs?: number;        // total session duration (ms)
}

export interface Report {
  _id?: string;            // for future MongoDB use
  reportId: string;        // public identifier
  sessionId: string;       // foreign key to Session.sessionId
  scores: {
    delivery: number;      // 0–100
    clarity: number;       // 0–100
    presence: number;      // 0–100
    structure: number;     // 0–100
    total: number;         // 0–100
  };
  createdAt: Date;

  // Optional AI review payload (present when Gemini review succeeds)
  review?: ReviewLite;
}

/** ----------------------------------------------------------------
 * In-memory stores (demo) — replace with real DB later
 * ---------------------------------------------------------------- */
export const sessions: Session[] = [];
export const reports: Report[] = [];

/** ----------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------- */
export function findSessionById(sessionId: string): Session | undefined {
  return sessions.find((s) => s.sessionId === sessionId);
}

export function upsertSession(payload: Session): Session {
  const idx = sessions.findIndex((s) => s.sessionId === payload.sessionId);
  if (idx >= 0) {
    sessions[idx] = { ...sessions[idx], ...payload };
    return sessions[idx];
  }
  sessions.push(payload);
  return payload;
}

export function addReport(payload: Report): Report {
  reports.push(payload);
  return payload;
}

export function findReport(sessionId: string, reportId: string): Report | undefined {
  return reports.find((r) => r.sessionId === sessionId && r.reportId === reportId);
}

export function listReportsBySession(sessionId: string): Report[] {
  return reports
    .filter((r) => r.sessionId === sessionId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}
