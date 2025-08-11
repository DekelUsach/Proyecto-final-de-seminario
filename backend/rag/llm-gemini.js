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

export async function generateWithGemini(prompt) {
  if (!client) throw new Error("gemini_not_configured");
  const model = client.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.0-flash" });
  const result = await model.generateContent(prompt);
  const text = result?.response?.text?.() || "";
  return text;
}


