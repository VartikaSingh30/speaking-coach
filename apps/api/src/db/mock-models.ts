// apps/api/src/db/mock-models.ts
export type Difficulty = "easy" | "medium" | "hard";

export interface MockQuestion {
  id: string;
  text: string;
  guidance?: string; // optional hints the interviewer might share
  targetCapabilities?: string[]; // e.g., ["system design", "ownership"]
}

export interface MockAnswerFeedback {
  questionId: string;
  answer: string; // raw user text (or ASR transcript)
  scoreContent: number; // 0-100 (content only — not delivery)
  rubric: {
    understanding: number; // correct comprehension
    structure: number;     // top-down, STAR, clear flow
    depth: number;         // technical/behavioral depth
    examples: number;      // evidence/examples
    clarity: number;       // concise, avoids rambling (content view)
  };
  notes: string[];         // short bullets (what to improve)
  suggestedBetterAnswer?: string; // short model example
}

export interface MockSession {
  mockId: string;
  createdAt: Date;
  role: string;
  difficulty: Difficulty;
  numQuestions: number;
  questions: MockQuestion[];
  answers: MockAnswerFeedback[]; // grows as user answers
  endedAt?: Date;
  final?: {
    overall: number; // 0-100
    signal: "Strong yes" | "Yes" | "Leaning yes" | "Neutral" | "Leaning no" | "No";
    summary: string; // 2-3 sentences
    strengths: string[];
    gaps: string[];
    nextSteps: string[]; // tailored drills/reading
  };
}

// super simple in-memory store
export const mockSessions: MockSession[] = [];

export function addMockSession(s: MockSession) {
  mockSessions.push(s);
  return s;
}

export function findMockById(id: string) {
  return mockSessions.find((m) => m.mockId === id);
}

export function updateMockSession(id: string, patch: Partial<MockSession>) {
  const s = findMockById(id);
  if (!s) return;
  Object.assign(s, patch);
  return s;
}
