import fetch from "node-fetch";
import { geminiEmbedding } from './embedding.js';
import { getOrCreateCollection } from './vectorStore.js';

export async function retrieveRelevant(storyId, question, topK = 5) {
  const collection = await getOrCreateCollection("stories");
  const vector = await geminiEmbedding(question);

  const results = await collection.query({
    queryEmbeddings: [vector],
    nResults: topK,
    where: { storyId: storyId }
  });

  return results.metadatas[0]?.map(m => m.text) || [];
}

export async function answerQuestion(storyId, question) {
  const passages = await retrieveRelevant(storyId, question);
  const contexto = passages.join("\n\n");

  const payload = {
    contents: [
      {
        parts: [
          { text: "You are an AI assistant that answers questions based on the provided context." },
          { text: "=== CONTEXT ===\n" + contexto + "\n=== END CONTEXT ===" },
          { text: question }
        ]
      }
    ]
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n") || "";
}
