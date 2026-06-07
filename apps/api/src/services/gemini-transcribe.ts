// apps/api/src/services/gemini-transcribe.ts
const MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || "models/gemini-2.5-flash";

export async function transcribeAudioWebmWeb(
  audioBytes: Uint8Array,
  hints?: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  // Build prompt parts. (Short hint improves accuracy/latency)
  const parts: any[] = [];
  const systemHint =
    hints ??
    "Transcribe this audio accurately. Return only the raw transcript text without timestamps.";
  parts.push({ text: systemHint });

  parts.push({
    inline_data: {
      mime_type: "audio/webm",
      data: Buffer.from(audioBytes).toString("base64"),
    },
  });

  // Try v1 first, then v1beta as fallback.
  const versions: ("v1" | "v1beta")[] = ["v1", "v1beta"];
  const errors: string[] = [];

  for (const v of versions) {
    try {
      const url = `https://generativelanguage.googleapis.com/${v}/${MODEL}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }] }),
      });

      const txt = await resp.text();
      if (!resp.ok) throw new Error(`[${v}] ${txt || resp.statusText}`);

      const data = JSON.parse(txt);
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ??
        data?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data ??
        "";
      return text.trim();
    } catch (e: any) {
      errors.push(`${v}: ${e?.message || String(e)}`);
    }
  }

  throw new Error(`transcribeAudioWebmWeb failed → ${errors.join(" | ")}`);
}
