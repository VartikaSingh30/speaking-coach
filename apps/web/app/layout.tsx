// app/layout.tsx
import "../styles/globals.css";
import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";

const repositoryUrl = "https://github.com/poolanithinreddy/echo-ai-speaking-coach";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Echo — Coaching for Confident Speaking",
    template: "%s · Echo",
  },
  description:
    "Real-time speaking coach with AI feedback, transcripts, and actionable plans.",
  applicationName: "Echo",
  generator: "Next.js",
  referrer: "strict-origin-when-cross-origin",
  keywords: [
    "speaking coach",
    "communication",
    "interview practice",
    "AI coaching",
    "public speaking",
    "transcripts",
  ],
  authors: [{ name: "Nithin Reddy Poola", url: "https://nithinreddy.com/" }],
  creator: "Nithin Reddy Poola",
  publisher: "Echo",
  metadataBase: new URL(repositoryUrl),
  openGraph: {
    type: "website",
    url: repositoryUrl,
    title: "Echo — Coaching for Confident Speaking",
    description:
      "Real-time coaching, live metrics, and AI reviews that help you speak clearly and confidently.",
    siteName: "Echo",
  },
  twitter: {
    card: "summary_large_image",
    title: "Echo — Coaching for Confident Speaking",
    description:
      "Real-time coaching, live metrics, and AI reviews that help you speak clearly and confidently.",
  },
  other: { "mobile-web-app-capable": "yes" },
  category: "productivity",
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0a0a0a" }],
  width: "device-width",
  initialScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jakarta.variable} h-full`}
      suppressHydrationWarning
    >
      <body
        className={[
          // Typography + theming
          "min-h-dvh [color-scheme:dark] antialiased",
          "font-sans text-neutral-100 selection:bg-emerald-500/30 selection:text-neutral-100",
          // Deep background base
          "bg-neutral-950",
        ].join(" ")}
      >
        {/* ===== Decorative Canvas (glows + grid + film grain) ===== */}
        {/* Glow #1 (left) */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-20"
          style={{
            background:
              "radial-gradient(1000px 500px at -10% -10%, rgba(34,197,94,0.15), transparent 60%)",
          }}
        />
        {/* Glow #2 (right) */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-20"
          style={{
            background:
              "radial-gradient(900px 400px at 110% -10%, rgba(56,189,248,0.12), transparent 60%)",
          }}
        />
        {/* Subtle grid */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 opacity-[0.06] mix-blend-screen"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            maskImage:
              "radial-gradient(1200px 700px at 50% -15%, black, transparent 70%), radial-gradient(1000px 500px at 80% -10%, black, transparent 70%)",
          }}
        />
        {/* Film grain */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 opacity-[0.04]"
          style={{
            backgroundImage: "url('/noise.svg')",
            backgroundSize: "auto",
          }}
        />

        {/* ===== Accessibility: Skip Link ===== */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:top-4 focus:left-4 focus:px-3 focus:py-2 focus:rounded-lg focus:bg-neutral-900 focus:border focus:border-neutral-700"
        >
          Skip to content
        </a>

        {/* ===== Header / Global Nav ===== */}
        <header className="sticky top-0 z-40 border-b border-neutral-900/80 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/60">
          <div className="mx-auto max-w-7xl h-14 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <a href="/" className="group inline-flex items-center gap-2">
              <span className="relative grid place-items-center">
                <span className="size-6 rounded-md bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_0_24px_rgba(16,185,129,0.35)]" />
                <span className="absolute inset-0 blur-md rounded-md bg-emerald-500/25 opacity-0 group-hover:opacity-100 transition" />
              </span>
              <span className="font-semibold tracking-tight">Echo</span>
              <span className="hidden sm:inline text-[11px] text-neutral-400 border-l border-neutral-800 pl-3">
                Coaching for Confident Speaking
              </span>
            </a>

            <nav className="hidden md:flex items-center gap-6 text-sm">
              <a className="text-neutral-300 hover:text-white transition" href="/">Home</a>
              <a className="text-neutral-300 hover:text-white transition" href="/mock">Mock Interview</a>
              <a className="text-neutral-300 hover:text-white transition" href="/about">About</a>
              <a
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-600/50 bg-emerald-600/15 px-3 py-1.5 text-emerald-300 hover:bg-emerald-600/20 hover:text-emerald-200 transition"
                href="/"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" className="opacity-90" aria-hidden>
                  <path fill="currentColor" d="M11 21v-8H3v-2h8V3h2v8h8v2h-8v8z" />
                </svg>
                Start Session
              </a>
            </nav>
          </div>
        </header>

        {/* ===== Main Content ===== */}
        <main id="main" className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>

        {/* ===== Footer ===== */}
        <footer className="border-t border-neutral-900/80">
          <div className="mx-auto max-w-7xl h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs text-neutral-400">
            <div className="flex items-center gap-2">
              <span>© {new Date().getFullYear()} Echo</span>
              <span className="text-neutral-600">•</span>
              <span className="hidden sm:inline">Built for clearer, more confident speaking.</span>
            </div>
            <div className="flex items-center gap-4">
              <a className="hover:text-neutral-200 transition" href="/about">About</a>
              <a className="hover:text-neutral-200 transition" href="/privacy">Privacy</a>
              <a className="hover:text-neutral-200 transition" href="/terms">Terms</a>
              <a className="hover:text-neutral-200 transition" href={repositoryUrl} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </div>
          </div>
        </footer>

        {/* ===== Live region for system status (set innerText via pages) ===== */}
        <div id="aria-live" role="status" aria-live="polite" className="sr-only" />

        {/* ===== Modal/Toast portals ===== */}
        <div id="portal-root" />
        <div id="toast-root" />

        {/* ===== JSON-LD (Org) ===== */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Echo",
              url: repositoryUrl,
              founder: {
                "@type": "Person",
                name: "Nithin Reddy Poola",
                url: "https://nithinreddy.com/",
              },
              sameAs: [repositoryUrl, "https://nithinreddy.com/"],
            }),
          }}
        />

        {/* Reduce motion preference */}
        <style
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `
              :root {
                --radius-lg: 16px;
                --ring: 0 0 0 1px rgba(255,255,255,0.06);
                --shadow-soft: 0 10px 25px rgba(0,0,0,0.45);
              }
              html, body {
                font-family: var(--font-inter), system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', 'Noto Sans', Arial, 'Apple Color Emoji', 'Segoe UI Emoji';
                font-optical-sizing: auto;
              }
              h1, h2, h3 {
                font-family: var(--font-jakarta), var(--font-inter), system-ui, -apple-system, Segoe UI, Roboto;
                letter-spacing: -0.01em;
              }
              @media (prefers-reduced-motion: reduce) {
                * {
                  animation-duration: 0.001ms !important;
                  animation-iteration-count: 1 !important;
                  transition-duration: 0.001ms !important;
                  scroll-behavior: auto !important;
                }
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
