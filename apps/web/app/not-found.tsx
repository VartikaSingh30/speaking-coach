import Link from "next/link";
import { GradientButton } from "../components/GradientButton";
import { ArrowRight } from "../components/icons";

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-[50vh] max-w-xl place-items-center text-center">
      <div>
        <div className="text-7xl font-extrabold tracking-tight text-neutral-800">404</div>
        <h1 className="mt-2 text-2xl font-bold">This page wandered off-script</h1>
        <p className="mt-2 text-neutral-400">
          The page you’re looking for doesn’t exist. Let’s get you back to practicing.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <GradientButton href="/">
            Back home <ArrowRight />
          </GradientButton>
          <Link
            href="/mock"
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-5 py-3 font-semibold text-neutral-100 hover:bg-neutral-800"
          >
            Try a mock interview
          </Link>
        </div>
      </div>
    </div>
  );
}
