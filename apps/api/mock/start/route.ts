import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

// naive in-memory store (reset on server restart)
const sessions = (global as any).__MOCK_SESSIONS__ ||= new Map<string, any>();

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { role = "Software Engineer", difficulty = "medium", numQuestions = 5 } = body || {};

    const id = randomUUID();
    // seed a few placeholder questions — swap with your model later
    const bank = [
      `Tell me about a challenging ${role} project you led.`,
      `How do you handle disagreements on a team?`,
      `Walk me through a recent design decision and trade-offs.`,
      `Describe a time you shipped under a tight deadline.`,
      `What do you want to learn in this ${role} role?`,
      `How do you measure success for your work?`,
      `Teach me something complex you worked on, simply.`,
    ];
    const total = Math.min(Math.max(3, Number(numQuestions)), 10);
    const questions = bank.slice(0, total);

    sessions.set(id, {
      role,
      difficulty,
      questions,
      index: 0,
      answers: [] as { transcript: string; metrics: any; score: number; feedback: string }[],
      createdAt: Date.now(),
    });

    return NextResponse.json({ mockId: id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}
