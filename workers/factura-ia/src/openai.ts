/** OpenAI Vision (GPT-4o) — motor principal cuando hay OPENAI_API_KEY. */

export async function runOpenAiVision(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  prompt: string,
  model = "gpt-4o",
): Promise<string> {
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  if (!res.ok) {
    const msg = data.error?.message || `OpenAI HTTP ${res.status}`;
    throw new Error(msg);
  }

  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("OpenAI devolvió respuesta vacía.");
  return text;
}
