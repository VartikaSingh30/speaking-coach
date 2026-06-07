import { NextResponse } from "next/server";

const sessions = (global as any).__MOCK_SESSIONS__ as Map<string, any>;

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const s = sessions?.get(params.id);
  if (!s) return NextResponse.json({ error: "mock not found" }, { status: 404 });

  const { index, questions } = s;
  if (index >= questions.length) {
    return NextResponse.json({ index, total: questions.length, question: "" });
  }
  return NextResponse.json({ index, total: questions.length, question: questions[index] });
}
