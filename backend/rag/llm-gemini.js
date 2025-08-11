import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
let client;
if (apiKey) {
  try {
    client = new GoogleGenerativeAI(apiKey);
  } catch (_) {
    client = null;
  }
}

export async function generateWithGemini(prompt, opts = {}) {
  if (!client) throw new Error("gemini_not_configured");
  const model = client.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.0-flash" });
  const generationConfig = {
    temperature: opts.temperature ?? 0,
    topP: opts.topP ?? 0.1,
    topK: opts.topK ?? 40,
    maxOutputTokens: opts.maxTokens ?? 256
  };
  const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig });
  const text = result?.response?.text?.() || "";
  return text;
}


