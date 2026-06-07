import { NextResponse } from "next/server";

const sessions = (global as any).__MOCK_SESSIONS__ as Map<string, any>;

// very naive grading stub; replace with your model later
function gradeAnswer(transcript: string, metrics: any) {
  const lengthScore = Math.min(10, Math.floor((transcript.split(/\s+/).length || 0) / 25));
  const paceScore = Math.max(0, Math.min(10, 10 - Math.abs((metrics?.avgWpm ?? 140) - 155) / 10));
  const fillerPenalty = Math.min(5, Math.floor(metrics?.fillerPerMin ?? 0));
  let score = Math.max(0, Math.min(10, Math.round((lengthScore * 0.4 + paceScore * 0.5 - fillerPenalty * 0.3))));
  const feedback = [
    lengthScore < 6 ? "Add more structured detail." : "Good level of detail.",
    fillerPenalty >= 3 ? "Reduce filler words; pause and breathe." : "Filler usage is under control.",
    paceScore < 6 ? "Adjust pace (target 140–170 WPM)." : "Nice pace.",
    metrics?.eyeContactPct != null ? (metrics.eyeContactPct < 45 ? "Increase eye contact with the camera." : "Eye contact looks good.") : "",
    metrics?.smilePct != null ? (metrics.smilePct < 25 ? "Warmer tone helps; a slight smile goes a long way." : "Friendly tone maintained.") : "",
  ].filter(Boolean).join(" ");

  return { score, feedback };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = sessions?.get(params.id);
  if (!s) return NextResponse.json({ error: "mock not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { index, transcript = "", metrics = {} } = body || {};

  if (index !== s.index) {
    return NextResponse.json({ error: "stale index" }, { status: 409 });
  }

  const { score, feedback } = gradeAnswer(transcript, metrics);

  s.answers.push({ transcript, metrics, score, feedback });
  s.index = Math.min(s.index + 1, s.questions.length);

  return NextResponse.json({ score, feedback });
}
