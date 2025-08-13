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
  const systemInstruction = opts.systemInstruction || opts.system || undefined;
  const model = client.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    ...(systemInstruction ? { systemInstruction } : {})
  });
  const generationConfig = {
    temperature: opts.temperature ?? 0.4,
    topP: opts.topP ?? 0.8,
    topK: opts.topK ?? 40,
    maxOutputTokens: opts.maxTokens ?? 512
  };
  const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig });
  const text = result?.response?.text?.() || "";
  return text;
}

export async function generateWithGeminiModel(prompt, modelName, opts = {}) {
  if (!client) throw new Error("gemini_not_configured");
  const effectiveModel = String(modelName || '').trim() || process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const systemInstruction = opts.systemInstruction || opts.system || undefined;
  const model = client.getGenerativeModel({
    model: effectiveModel,
    ...(systemInstruction ? { systemInstruction } : {})
  });
  const generationConfig = {
    temperature: opts.temperature ?? 0.4,
    topP: opts.topP ?? 0.8,
    topK: opts.topK ?? 40,
    maxOutputTokens: opts.maxTokens ?? 512
  };
  const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig });
  const text = result?.response?.text?.() || "";
  return text;
}


