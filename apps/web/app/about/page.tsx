import type { Metadata } from "next";
import { SectionCard } from "../../components/SectionCard";
import { Badge } from "../../components/Badge";
import { GradientButton } from "../../components/GradientButton";
import { ArrowRight } from "../../components/icons";

export const metadata: Metadata = {
  title: "About",
  description: "What Echo is, how it works, and the technology behind it.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Badge tone="info">About Echo</Badge>
      <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
        A real-time AI speaking coach
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-neutral-300">
        Echo helps you practice high-stakes speaking — interviews, presentations and standups — by
        giving live feedback while you speak and an AI-written coaching report when you finish. It
        started as a HackUMBC project and is maintained as an open-source, local-first portfolio
        application.
      </p>

      <div className="mt-8 grid gap-4">
        <SectionCard title="How it works">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-neutral-300">
            <li>Your microphone audio streams over WebSocket to Google Cloud Speech-to-Text for partial and final transcripts.</li>
            <li>A second WebSocket computes rolling pace (WPM) and filler rate, sending compact coaching frames back to the browser.</li>
            <li>MediaPipe face landmarks estimate eye contact and smile on-device — video frames never leave your machine.</li>
            <li>When you end the session, the transcript and metrics are scored and sent to Gemini to generate a structured review.</li>
          </ol>
        </SectionCard>

        <SectionCard title="What it measures">
          <p className="text-sm leading-relaxed text-neutral-300">
            Delivery (pace + pauses), clarity (filler rate), presence (eye contact + smile) and a
            heuristic structure score derived from the transcript. Scores are directional coaching
            signals, not clinical measurements.
          </p>
        </SectionCard>

        <SectionCard title="Honest status">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-neutral-300">
            <li>Sessions and reports are stored <span className="text-neutral-100">in memory</span> and reset when the API restarts.</li>
            <li>There is <span className="text-neutral-100">no authentication</span> yet — it is built for local use and demos.</li>
            <li>Live transcription needs Google Cloud credentials; AI review and mock interviews need a Gemini API key.</li>
          </ul>
          <p className="mt-3 text-xs text-neutral-500">
            See the project README and <code className="text-neutral-400">docs/ROADMAP.md</code> for the full picture.
          </p>
        </SectionCard>
      </div>

      <div className="mt-8">
        <GradientButton href="/">
          Try a live session <ArrowRight />
        </GradientButton>
      </div>
    </div>
  );
}
