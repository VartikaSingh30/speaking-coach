// apps/api/src/services/gemini-mock.ts
/**
 * Mock Interview services:
 * - generateQuestionSet
 * - judgeAnswer
 * - finalizeMock
 *
 * JSON-mode, retries, timeouts similar to gemini-review.ts
 */

function normalizeModelId(raw: string | undefined, fallback: string) {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return fallback;
  return trimmed.startsWith("models/") ? trimmed.slice("models/".length) : trimmed;
}

const DEFAULT_MODEL_ID = "gemini-2.5-flash";
const MODEL_ID = normalizeModelId(process.env.GEMINI_MOCK_MODEL, DEFAULT_MODEL_ID);
const MODEL_PATH = `models/${MODEL_ID}`;
const TEMPERATURE = Number(process.env.GEMINI_MOCK_TEMPERATURE ?? 0.2);
const MAX_TOKENS = Number(process.env.GEMINI_MOCK_MAX_TOKENS ?? 2048);

export type Difficulty = "easy" | "medium" | "hard";

export type QuestionGenReq = {
  role: string;
  difficulty: Difficulty;
  numQuestions: number; // 3-10 recommended
};

export type GenQuestion = {
  id: string;
  text: string;
  guidance?: string;
  targetCapabilities?: string[];
};

export type QuestionGenResp = {
  questions: GenQuestion[];
};

export type JudgeReq = {
  question: string;
  answer: string;
  role: string;
  difficulty: Difficulty;
};

export type JudgeResp = {
  scoreContent: number; // 0-100
  rubric: {
    understanding: number;
    structure: number;
    depth: number;
    examples: number;
    clarity: number;
  };
  notes: string[];
  suggestedBetterAnswer?: string;
};

export type FinalizeReq = {
  role: string;
  difficulty: Difficulty;
  items: Array<{
    question: string;
    scoreContent: number;
    rubric: JudgeResp["rubric"];
    notes: string[];
  }>;
};

export type FinalizeResp = {
  overall: number;
  signal: "Strong yes" | "Yes" | "Leaning yes" | "Neutral" | "Leaning no" | "No";
  summary: string;
  strengths: string[];
  gaps: string[];
  nextSteps: string[];
};

// --- fetch wrapper (Node18 / node-fetch fallback) ---
async function doFetch(url: string, init: RequestInit) {
  const g: any = globalThis as any;
  const f: typeof fetch =
    typeof g.fetch === "function" ? g.fetch.bind(g) : (await import("node-fetch")).default as any;
  return f(url, init);
}

function backoff(attempt: number, base = 400, cap = 4000) {
  return Math.min(cap, base * 2 ** (attempt - 1));
}

function adaptBodyForVersion(body: any, version: "v1" | "v1beta") {
  if (version === "v1") {
    if (body?.generation_config) return body;
    if (!body?.generationConfig) return body;
    const { generationConfig, ...rest } = body;
    const snake: Record<string, unknown> = {};
    if ("responseMimeType" in generationConfig) {
      snake.response_mime_type = generationConfig.responseMimeType;
    }
    if ("temperature" in generationConfig) {
      snake.temperature = generationConfig.temperature;
    }
    if ("maxOutputTokens" in generationConfig) {
      snake.max_output_tokens = generationConfig.maxOutputTokens;
    }
    if ("topK" in generationConfig) {
      snake.top_k = (generationConfig as any).topK;
    }
    if ("topP" in generationConfig) {
      snake.top_p = (generationConfig as any).topP;
    }
    return {
      ...rest,
      generation_config: snake,
    };
  }

  if (version === "v1beta" && body?.generation_config) {
    const { generation_config, ...rest } = body;
    const camel: Record<string, unknown> = {};
    if ("response_mime_type" in generation_config) {
      camel.responseMimeType = generation_config.response_mime_type;
    }
    if ("temperature" in generation_config) {
      camel.temperature = generation_config.temperature;
    }
    if ("max_output_tokens" in generation_config) {
      camel.maxOutputTokens = generation_config.max_output_tokens;
    }
    if ("top_k" in generation_config) {
      camel.topK = (generation_config as any).top_k;
    }
    if ("top_p" in generation_config) {
      camel.topP = (generation_config as any).top_p;
    }
    return {
      ...rest,
      generationConfig: camel,
    };
  }

  return body;
}

async function callGeminiJSON(body: any, tag: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error(`[${tag}] Missing GEMINI_API_KEY environment variable`);
    throw new Error("Missing GEMINI_API_KEY");
  }

  console.log(`[${tag}] Making request with model: ${MODEL_PATH}`);
  const apiBases: Array<"v1" | "v1beta"> = ["v1beta", "v1"]; // Try v1beta first as it's more stable
  const errors: string[] = [];

  for (const v of apiBases) {
    attemptLoop: for (let attempt = 1; attempt <= 3; attempt++) {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 25000);
      try {
        const url = `https://generativelanguage.googleapis.com/${v}/${MODEL_PATH}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`;
        const payload = adaptBodyForVersion(body, v);
        const resp = await doFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: ctrl.signal as any,
        });
        const txt = await resp.text();
        clearTimeout(timeout);

        if (!resp.ok) {
          console.error(`[${v}/${tag}] API Error:`, {
            status: resp.status,
            statusText: resp.statusText,
            response: txt,
            url
          });
          const retryable = resp.status === 429 || resp.status >= 500;
          const err = new Error(`[${v}/${tag}] ${resp.status} ${txt || resp.statusText}`);
          (err as any).retryable = retryable;
          throw err;
        }

        const data = JSON.parse(txt);
        const raw: string | undefined =
          data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!raw || typeof raw !== "string") {
          console.error("Gemini response structure:", JSON.stringify(data, null, 2));
          throw new Error(`[${v}/${tag}] empty response or unexpected structure`);
        }
        
        try {
          return JSON.parse(raw); // JSON-mode
        } catch (jsonErr) {
          console.error(`[${v}/${tag}] JSON parse error:`, {
            raw: raw.substring(0, 500) + (raw.length > 500 ? '...' : ''),
            error: jsonErr
          });
          throw new Error(`[${v}/${tag}] invalid JSON response`);
        }
      } catch (e: any) {
        clearTimeout(timeout);
        const msg = e?.name === "AbortError" ? `[${v}/${tag}] timeout` : e?.message || String(e);
        errors.push(msg);
        const retryable = e?.name === "AbortError" || e?.retryable;
        if (retryable && attempt < 3) {
          await new Promise((r) => setTimeout(r, backoff(attempt)));
          continue attemptLoop;
        }
        break attemptLoop;
      }
    }
  }
  throw new Error(`${tag} failed → ${Array.from(new Set(errors)).join(" | ")}`);
}

// --- Services ---
export async function generateQuestionSet(req: QuestionGenReq): Promise<QuestionGenResp> {
  const sys = `You are an interviewer. Produce strictly valid JSON with a role-aware, difficulty-calibrated question set.`;
  const user = `
ROLE: ${req.role}
DIFFICULTY: ${req.difficulty}
NUM_QUESTIONS: ${req.numQuestions}

Return JSON ONLY:
{
  "questions": [{
    "id": "q1",
    "text": "...",
    "guidance": "...",
    "targetCapabilities": ["..."]
  }, ...]
}
`.trim();

  const body = {
    contents: [{ role: "user", parts: [{ text: sys + "\n\n" + user }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: TEMPERATURE,
      maxOutputTokens: MAX_TOKENS,
    },
  };
  const json = await callGeminiJSON(body, "generateQuestionSet");
  if (!Array.isArray(json?.questions)) throw new Error("questions missing");
  // normalize ids
  json.questions = json.questions.map((q: any, i: number) => ({
    id: String(q?.id || `q${i + 1}`),
    text: String(q?.text || "").trim(),
    guidance: typeof q?.guidance === "string" ? q.guidance.trim() : undefined,
    targetCapabilities: Array.isArray(q?.targetCapabilities)
      ? q.targetCapabilities.filter((x: any) => typeof x === "string")
      : undefined,
  }));
  return json;
}

export async function judgeAnswer(req: JudgeReq): Promise<JudgeResp> {
  const sys = `You are a strict, fair interviewer. Judge only the ANSWER to the given QUESTION. Scores are integers 0-100. Return JSON only. Keep notes concise.`;
  const user = `
ROLE: ${req.role}
DIFFICULTY: ${req.difficulty}

QUESTION:
"""${req.question}"""

ANSWER:
"""${req.answer}"""

Return JSON ONLY:
{
  "scoreContent": 0,
  "rubric": {
    "understanding": 0,
    "structure": 0,
    "depth": 0,
    "examples": 0,
    "clarity": 0
  },
  "notes": ["...", "..."],
  "suggestedBetterAnswer": "..." // short improvement, not too long
}
`.trim();

  const body = {
    contents: [{ role: "user", parts: [{ text: sys + "\n\n" + user }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 1024,
    },
  };
  const json = await callGeminiJSON(body, "judgeAnswer");

  function int(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(100, n))) : 0;
  }
  const r: JudgeResp = {
    scoreContent: int(json?.scoreContent),
    rubric: {
      understanding: int(json?.rubric?.understanding),
      structure: int(json?.rubric?.structure),
      depth: int(json?.rubric?.depth),
      examples: int(json?.rubric?.examples),
      clarity: int(json?.rubric?.clarity),
    },
    notes: Array.isArray(json?.notes)
      ? json.notes.filter((x: any) => typeof x === "string").slice(0, 6)
      : [],
    suggestedBetterAnswer:
      typeof json?.suggestedBetterAnswer === "string" ? json.suggestedBetterAnswer : undefined,
  };
  return r;
}

export async function finalizeMock(req: FinalizeReq): Promise<FinalizeResp> {
  const sys = `You are a hiring panelist making a final readout. Calibrate sensibly; avoid extremes unless justified. Return JSON.`;
  const user = `
ROLE: ${req.role}
DIFFICULTY: ${req.difficulty}

ITEMS: ${JSON.stringify(req.items, null, 2)}

Aggregate the items and return JSON ONLY:
{
  "overall": 0,
  "signal": "Strong yes" | "Yes" | "Leaning yes" | "Neutral" | "Leaning no" | "No",
  "summary": "...",
  "strengths": ["..."],
  "gaps": ["..."],
  "nextSteps": ["..."]
}
`.trim();

  const body = {
    contents: [{ role: "user", parts: [{ text: sys + "\n\n" + user }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 1024,
    },
  };
  const json = await callGeminiJSON(body, "finalizeMock");

  function int(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(100, n))) : 0;
  }
  const strengths = Array.isArray(json?.strengths)
    ? json.strengths.filter((x: any) => typeof x === "string")
    : [];
  const gaps = Array.isArray(json?.gaps) ? json.gaps.filter((x: any) => typeof x === "string") : [];
  const nextSteps = Array.isArray(json?.nextSteps)
    ? json.nextSteps.filter((x: any) => typeof x === "string")
    : [];

  const signal = String(json?.signal || "Neutral") as FinalizeResp["signal"];
  const out: FinalizeResp = {
    overall: int(json?.overall),
    signal,
    summary: typeof json?.summary === "string" ? json.summary : "",
    strengths: strengths.slice(0, 6),
    gaps: gaps.slice(0, 6),
    nextSteps: nextSteps.slice(0, 6),
  };
  return out;
}
