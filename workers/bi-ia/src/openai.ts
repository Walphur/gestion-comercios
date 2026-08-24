/** OpenAI chat (texto) — interpretación de Inteligencia de Negocio. */

export async function runOpenAiText(
  apiKey: string,
  system: string,
  user: string,
  model = "gpt-4o-mini",
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
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
