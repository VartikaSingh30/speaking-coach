// apps/api/src/services/gemini-review.ts

/**
 * Production-grade Gemini "Speaking Coach" review service (interview focused).
 */

function normalizeModelId(raw: string | undefined, fallback: string) {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return fallback;
  return trimmed.startsWith("models/") ? trimmed.slice("models/".length) : trimmed;
}

const DEFAULT_MODEL_ID = "gemini-2.5-flash";
const MODEL_ID = normalizeModelId(process.env.GEMINI_REVIEW_MODEL, DEFAULT_MODEL_ID);
const MODEL_PATH = `models/${MODEL_ID}`;
const TEMPERATURE = Number(process.env.GEMINI_REVIEW_TEMPERATURE ?? 0.2);
const MAX_TOKENS = Number(process.env.GEMINI_REVIEW_MAX_TOKENS ?? 2048);

/* ----------------------------- Types ----------------------------- */
export type ReviewInput = {
  transcript: string;
  minutesSpoken: number;
  avgWpm: number;
  fillersPerMin: number;
  speakingRatioPct: number;
  avgLoudnessDb: number;
};

export type InterviewRewrite = {
  concise: string;
  star: {
    situation: string;
    task: string;
    action: string;
    result: string;
    finalAnswer: string;
  };
  strongerPhrases: string[];
  followUps: string[];
};

export type Review = {
  summary: string;
  strengths: string[];
  issues: string[];
  toneCoaching: string[];
  englishCoaching: {
    patterns: string[];
    examples: Array<{ bad: string; better: string; why: string }>;
    newVocabulary: Array<{ word: string; usage: string }>;
  };
  sevenDayPlan: string[];
  quickTips: string[];
  interviewRewrite: InterviewRewrite;
};

/* ------------------------- Fetch helper -------------------------- */
async function doFetch(url: string, init: RequestInit) {
  const g: any = globalThis as any;
  const f: typeof fetch =
    typeof g.fetch === "function" ? g.fetch.bind(g) : (await import("node-fetch")).default as any;
  return f(url, init);
}

/* --------------------------- Utilities --------------------------- */
function sanitizeTranscript(s: string): string {
  if (!s) return "";
  let out = s.replace(/\s+/g, " ").trim();
  out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
  out = out.replace(/\b(?:\+?\d[\d\-\s()]{7,}\d)\b/g, "[phone]");
  out = out.replace(/[!?.,]{4,}/g, "...");
  return out;
}

function coerceJsonBlock(s: string): string {
  if (!s) return s;
  const fence = /```json\s*([\s\S]*?)```/i.exec(s);
  if (fence?.[1]) return fence[1].trim();
  const anyFence = /```\s*([\s\S]*?)```/i.exec(s);
  if (anyFence?.[1]) return anyFence[1].trim();
  return s.trim();
}

function tryRepairJson(s: string): string {
  const noBom = s.replace(/^\uFEFF/, "");
  return noBom.replace(/,\s*([}\]])/g, "$1"); // strip trailing commas
}

function isObj(v: any): v is Record<string, any> {
  return v && typeof v === "object";
}
function ensureString(v: any): string {
  return typeof v === "string" ? v : "";
}
function ensureStringArray(v: any, max = 20): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).slice(0, max);
}
function ensureQuickTips(v: any): string[] {
  const tips = ensureStringArray(v, 8).map((t) => (t.length > 80 ? t.slice(0, 80) : t));
  return tips
    .map((t) => {
      const words = t.split(/\s+/);
      return words.length <= 10 ? t : words.slice(0, 10).join(" ");
    })
    .slice(0, 5);
}

function fillInterviewRewriteDefaults(v: any): InterviewRewrite {
  const star = isObj(v?.star) ? v.star : {};
  return {
    concise: ensureString(v?.concise),
    star: {
      situation: ensureString(star?.situation),
      task: ensureString(star?.task),
      action: ensureString(star?.action),
      result: ensureString(star?.result),
      finalAnswer: ensureString(star?.finalAnswer),
    },
    strongerPhrases: ensureStringArray(v?.strongerPhrases, 12),
    followUps: ensureStringArray(v?.followUps, 8),
  };
}

function validateReviewShape(obj: any): Review {
  if (!isObj(obj)) throw new Error("review: not an object");

  const review: Review = {
    summary: ensureString(obj.summary),
    strengths: ensureStringArray(obj.strengths),
    issues: ensureStringArray(obj.issues),
    toneCoaching: ensureStringArray(obj.toneCoaching),
    englishCoaching: {
      patterns: ensureStringArray(obj?.englishCoaching?.patterns),
      examples: Array.isArray(obj?.englishCoaching?.examples)
        ? obj.englishCoaching.examples
            .filter(isObj)
            .map((e: any) => ({
              bad: ensureString(e.bad),
              better: ensureString(e.better),
              why: ensureString(e.why),
            }))
            .slice(0, 10)
        : [],
      newVocabulary: Array.isArray(obj?.englishCoaching?.newVocabulary)
        ? obj.englishCoaching.newVocabulary
            .filter(isObj)
            .map((e: any) => ({ word: ensureString(e.word), usage: ensureString(e.usage) }))
            .slice(0, 10)
        : [],
    },
    sevenDayPlan: ensureStringArray(obj.sevenDayPlan, 10),
    quickTips: ensureQuickTips(obj.quickTips),
    interviewRewrite: fillInterviewRewriteDefaults(obj.interviewRewrite),
  };

  if (!review.summary) throw new Error("review.summary missing");
  if (!review.strengths.length) throw new Error("review.strengths empty");
  if (!review.issues.length) throw new Error("review.issues empty");
  if (!review.toneCoaching.length) throw new Error("review.toneCoaching empty");
  if (!review.englishCoaching.patterns.length) throw new Error("englishCoaching.patterns empty");
  if (!review.sevenDayPlan.length) throw new Error("sevenDayPlan empty");
  if (!review.quickTips.length) throw new Error("quickTips empty");

  const ir = review.interviewRewrite;
  const emptySTAR = !ir.star.situation && !ir.star.task && !ir.star.action && !ir.star.result;
  if (!ir.concise && emptySTAR && !ir.strongerPhrases.length) {
    review.interviewRewrite.concise = review.summary;
  }
  return review;
}

/** Exponential backoff in ms */
function backoff(attempt: number, base = 400, cap = 4000) {
  return Math.min(cap, base * 2 ** (attempt - 1));
}

/** Build request body with correct casing per API version */
function buildBody(version: "v1" | "v1beta", system: string, user: string) {
  const contents = [{ role: "user", parts: [{ text: system + "\n\n" + user }] }];

  if (version === "v1") {
    return {
      contents,
      generation_config: {
        response_mime_type: "application/json",
        temperature: TEMPERATURE,
        max_output_tokens: MAX_TOKENS,
      },
    } as any;
  }

  return {
    contents,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: TEMPERATURE,
      maxOutputTokens: MAX_TOKENS,
    },
  };
}

/* ----------------------------- Main ------------------------------ */
export async function geminiReview(input: ReviewInput): Promise<Review> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("geminiReview: Missing GEMINI_API_KEY environment variable");
    throw new Error("Missing GEMINI_API_KEY");
  }

  console.log("geminiReview: Making request with model:", MODEL_PATH);
  // Clip + sanitize transcript
  const MAX_CHARS = 160_000;
  const clippedTranscript = sanitizeTranscript((input.transcript || "").slice(0, MAX_CHARS));

  // Prompts
  const system = [
    "You are an interview speaking coach for English learners.",
    "Be specific, supportive, and actionable.",
    "Use simple language. Output MUST be valid JSON only.",
  ].join(" ");

  const user = `
TRANSCRIPT:
"""${clippedTranscript}"""

METRICS:
- minutesSpoken: ${input.minutesSpoken.toFixed(2)}
- avgWpm: ${Math.round(input.avgWpm)}
- fillersPerMin: ${Math.round(input.fillersPerMin)}
- speakingRatioPct: ${Math.round(input.speakingRatioPct)}
- avgLoudnessDb: ${Math.round(input.avgLoudnessDb)}

TASK:
1) Summarize performance in 2–3 sentences (supportive).
2) List strengths (3–5).
3) List biggest issues (3–5, prioritized).
4) Tone coaching: loudness, energy, pacing, articulation—practical, short tips.
5) English coaching:
   - common patterns to fix (grammar/phrasing),
   - 3–5 example corrections {bad, better, why},
   - 3–5 new vocabulary items {word, usage sentence}.
6) Give a 7-day micro-plan (one actionable drill per day).
7) Provide 3–5 "quickTips": ultra-concise, tailored (≤ 10 words each).
8) Provide "interviewRewrite":
   - concise (30–60s),
   - star { situation, task, action, result, finalAnswer },
   - strongerPhrases (5–8),
   - followUps (4–6).

Return ONLY JSON with the exact keys described.
`.trim();

  const apiBases: Array<"v1" | "v1beta"> = ["v1beta", "v1"]; // Try v1beta first as it's more stable
  const errors: string[] = [];

  for (const version of apiBases) {
    attemptLoop: for (let attempt = 1; attempt <= 3; attempt++) {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 25_000);

      try {
        const url = `https://generativelanguage.googleapis.com/${version}/${MODEL_PATH}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`;

        const body = buildBody(version, system, user);

        const resp = await doFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal as any,
        });

        const txt = await resp.text();
        clearTimeout(timeout);

        if (!resp.ok) {
          console.error(`[${version}] geminiReview API Error:`, {
            status: resp.status,
            statusText: resp.statusText,
            response: txt,
            url
          });
          const retryable = resp.status === 429 || resp.status >= 500;
          const err = new Error(`[${version}] ${resp.status} ${txt || resp.statusText}`);
          (err as any).retryable = retryable;
          throw err;
        }

        const data = JSON.parse(txt);
        const raw: string | undefined =
          data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!raw || typeof raw !== "string") {
          console.error("Gemini response structure:", JSON.stringify(data, null, 2));
          throw new Error(`[${version}] empty or non-text response`);
        }

        const jsonStr = tryRepairJson(coerceJsonBlock(raw));
        let parsed;
        try {
          parsed = JSON.parse(jsonStr);
        } catch (jsonErr) {
          console.error(`[${version}] JSON parse error:`, {
            raw: raw.substring(0, 500) + (raw.length > 500 ? '...' : ''),
            jsonStr: jsonStr.substring(0, 500) + (jsonStr.length > 500 ? '...' : ''),
            error: jsonErr
          });
          throw new Error(`[${version}] invalid JSON response`);
        }

        const review = validateReviewShape(parsed);
        review.quickTips = ensureQuickTips(review.quickTips);
        return review;
      } catch (e: any) {
        clearTimeout(timeout);
        const isAbort = e?.name === "AbortError";
        const msg = isAbort ? `[${version}] request timed out` : e?.message || String(e);
        errors.push(msg);

        const retryable = isAbort || e?.retryable;
        if (retryable && attempt < 3) {
          await new Promise((r) => setTimeout(r, backoff(attempt)));
          continue attemptLoop;
        }
        break attemptLoop;
      }
    }
  }

  throw new Error("geminiReview failed → " + Array.from(new Set(errors)).join(" | "));
}
