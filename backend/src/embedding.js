import fetch from "node-fetch";

export async function geminiEmbedding(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedText?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    }
  );
  const json = await res.json();
  const embedding = json.embedding?.value || json.embedding || [];
  if (!Array.isArray(embedding)) throw new Error("Embedding inválido");
  return embedding;
}
