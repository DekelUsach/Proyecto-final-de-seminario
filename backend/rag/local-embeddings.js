import { GoogleGenerativeAI } from "@google/generative-ai";

// Fallback local embedding (hashing) para cuando no haya API Key
const VECTOR_DIMENSION = 384;

function simpleTokenizer(text) {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function l2Normalize(vec) {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq) || 1;
  return vec.map(v => v / norm);
}

let geminiClient = null;
let geminiEmbeddingModel = null;

function tryInitGemini() {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
  if (!apiKey) return false;
  try {
    geminiClient = new GoogleGenerativeAI(apiKey);
    geminiEmbeddingModel = geminiClient.getGenerativeModel({ model: "text-embedding-004" });
    return true;
  } catch (_) {
    geminiClient = null;
    geminiEmbeddingModel = null;
    return false;
  }
}

export async function getEmbeddingModel() {
  const canUseGemini = geminiEmbeddingModel || tryInitGemini();
  if (canUseGemini && geminiEmbeddingModel) {
    return {
      async embed(text) {
        const res = await geminiEmbeddingModel.embedContent({
          content: {
            parts: [{ text }]
          }
        });
        const values = res?.embedding?.values || res?.embedding?.value || [];
        if (!Array.isArray(values)) throw new Error("Embedding inválido de Gemini");
        return values;
      }
    };
  }

  // Fallback local hashing embedding
  return {
    async embed(text) {
      const tokens = simpleTokenizer(text);
      const vec = new Array(VECTOR_DIMENSION).fill(0);
      for (const tok of tokens) {
        const idx = ((djb2Hash(tok) % VECTOR_DIMENSION) + VECTOR_DIMENSION) % VECTOR_DIMENSION;
        vec[idx] += 1;
      }
      return l2Normalize(vec);
    }
  };
}

export async function embedWithLocal(text) {
  const tokens = simpleTokenizer(text);
  const vec = new Array(VECTOR_DIMENSION).fill(0);
  for (const tok of tokens) {
    const idx = ((djb2Hash(tok) % VECTOR_DIMENSION) + VECTOR_DIMENSION) % VECTOR_DIMENSION;
    vec[idx] += 1;
  }
  return l2Normalize(vec);
}

export async function embedWithGemini(text) {
  const ok = geminiEmbeddingModel || tryInitGemini();
  if (!ok || !geminiEmbeddingModel) throw new Error("gemini_not_configured");
  const res = await geminiEmbeddingModel.embedContent({
    content: { parts: [{ text }] }
  });
  const values = res?.embedding?.values || res?.embedding?.value || [];
  if (!Array.isArray(values)) throw new Error("Embedding inválido de Gemini");
  return values;
}

