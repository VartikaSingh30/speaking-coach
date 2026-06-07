import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for the Echo demo application.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Terms of Use</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Echo is provided as an open-source demo. This is not legal advice.
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-neutral-300">
        <section>
          <h2 className="text-base font-semibold text-neutral-100">Demo software, as-is</h2>
          <p className="mt-2">
            Echo is a portfolio / hackathon project provided “as is”, without warranty of any kind.
            Coaching scores and AI feedback are directional and may be inaccurate; use your own
            judgment.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-neutral-100">Acceptable use</h2>
          <p className="mt-2">
            Use Echo for your own speaking practice. Do not record or analyze other people without
            their consent, and do not rely on Echo for hiring, medical, or legal decisions.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-neutral-100">Third-party services</h2>
          <p className="mt-2">
            Features depend on Google Cloud Speech-to-Text and the Google Gemini API. You are
            responsible for complying with those providers&apos; terms and for any usage costs on your
            own keys.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-neutral-100">License</h2>
          <p className="mt-2">
            The source code is released under the MIT License. See the repository&apos;s LICENSE file
            for details.
          </p>
        </section>
      </div>
    </div>
  );
}
