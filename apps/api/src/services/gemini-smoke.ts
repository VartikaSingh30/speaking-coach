// apps/api/src/services/gemini-smoke.ts
// Simple REST smoke test for text generation.
// Use /smoke/gemini?model=models/<exact-name> or let it try fallbacks.

export async function geminiSmoke(modelName?: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  // Prefer current-gen, known-good model names you saw in /smoke/models
  const candidates = modelName
    ? [modelName]
    : [
        "models/gemini-2.5-flash",
        "models/gemini-2.5-pro",
        "models/gemini-2.0-flash",
      ];

  const versions: ("v1" | "v1beta")[] = ["v1", "v1beta"];
  const errors: string[] = [];

  for (const m of candidates) {
    for (const v of versions) {
      try {
        const url = `https://generativelanguage.googleapis.com/${v}/${m}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`;

        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Reply with: hello from Gemini" }] }],
          }),
        });

        const txt = await resp.text();
        if (!resp.ok) throw new Error(`[${v}] ${txt || resp.statusText}`);

        const data = JSON.parse(txt);
        const text =
          data?.candidates?.[0]?.content?.parts?.[0]?.text ??
          data?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data;

        if (!text) throw new Error(`[${v}] Empty response`);
        return `${text} (${m} via ${v})`;
      } catch (e: any) {
        errors.push(`${m} via ${v}: ${e?.message || String(e)}`);
      }
    }
  }

  throw new Error(errors.join(" | "));
}
