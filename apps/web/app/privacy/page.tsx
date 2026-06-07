import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Echo handles your audio, video, and transcripts.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Plain-language summary for this local-first demo. This is not legal advice.
      </p>

      <div className="prose-invert mt-8 space-y-6 text-sm leading-relaxed text-neutral-300">
        <section>
          <h2 className="text-base font-semibold text-neutral-100">Camera &amp; face tracking</h2>
          <p className="mt-2">
            Eye-contact and smile detection run entirely in your browser using MediaPipe. Video
            frames are processed on-device and are <span className="text-neutral-100">not uploaded</span> or stored by Echo.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-neutral-100">Microphone &amp; transcription</h2>
          <p className="mt-2">
            During a live session, audio is streamed to Google Cloud Speech-to-Text to produce a
            transcript. Audio is used for live analysis during the session; Echo does not persist raw
            audio.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-neutral-100">Transcripts &amp; AI review</h2>
          <p className="mt-2">
            To generate your report, the transcript and delivery metrics are sent to Google&apos;s
            Gemini API. Before sending, Echo applies light redaction to obvious emails and phone
            numbers. In this demo, sessions and reports are kept <span className="text-neutral-100">in memory</span> and disappear
            when the API restarts.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-neutral-100">Third-party services</h2>
          <p className="mt-2">
            Echo relies on Google Cloud Speech-to-Text and the Google Gemini API. Your use of those
            features is also subject to Google&apos;s terms and privacy policies.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-neutral-100">Your control</h2>
          <p className="mt-2">
            You choose when to start and end a session. Ending a session stops capture and releases
            the camera and microphone.
          </p>
        </section>
      </div>
    </div>
  );
}
