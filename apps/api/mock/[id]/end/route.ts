import { NextResponse } from "next/server";

const sessions = (global as any).__MOCK_SESSIONS__ as Map<string, any>;

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const s = sessions?.get(params.id);
  if (!s) return NextResponse.json({ error: "mock not found" }, { status: 404 });

  // compute a naive final
  const avg = s.answers.length
    ? Math.round(s.answers.reduce((a: number, x: any) => a + (x.score ?? 0), 0) / s.answers.length)
    : 0;

  const reportId = `${params.id}-r`;
  // you could save a report object here
  sessions.set(reportId, { ...s, finalScore: avg });

  return NextResponse.json({ reportId, finalScore: avg });
}
