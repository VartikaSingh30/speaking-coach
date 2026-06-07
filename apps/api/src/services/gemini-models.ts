// apps/api/src/services/gemini-models.ts
export async function listModels(apiVersion: "v1" | "v1beta" = "v1") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${encodeURIComponent(
    apiKey
  )}`;

  const resp = await fetch(url);
  const txt = await resp.text();

  let json: any;
  try { json = JSON.parse(txt); } catch { json = { raw: txt }; }

  if (!resp.ok) {
    const msg = json?.error?.message || txt || `HTTP ${resp.status}`;
    throw new Error(`[${apiVersion}] ${msg}`);
  }

  const models = (json.models ?? []).map((m: any) => ({
    name: m.name, // e.g., "models/gemini-2.5-flash"
    desc: m.description,
    inputTokenLimit: m.inputTokenLimit,
    outputTokenLimit: m.outputTokenLimit,
    supported: m.supportedGenerationMethods, // e.g., ["generateContent", "countTokens"]
  }));

  return { apiVersion, models };
}
