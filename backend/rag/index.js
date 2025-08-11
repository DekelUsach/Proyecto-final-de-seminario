import path from "path";
import { fileURLToPath } from "url";
import { connect } from "@lancedb/lancedb";
import { getEmbeddingModel } from "./local-embeddings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, "..", ".lancedb");
const TABLE_NAME = "stories";

let dbPromise;
function getDb() {
  if (!dbPromise) {
    dbPromise = connect(DB_DIR);
  }
  return dbPromise;
}

async function getOrCreateTable(initialRowsIfCreate) {
  const db = await getDb();
  const tableNames = await db.tableNames();
  if (!tableNames.includes(TABLE_NAME)) {
    if (!initialRowsIfCreate || initialRowsIfCreate.length === 0) {
      throw new Error("Debe proveer filas iniciales para crear la tabla la primera vez");
    }
    await db.createTable(TABLE_NAME, initialRowsIfCreate);
    return db.openTable(TABLE_NAME);
  }
  return db.openTable(TABLE_NAME);
}

function splitTextIntoChunks(text, chunkSize = 800, overlap = 100) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const chunk = normalized.slice(start, end);
    chunks.push(chunk);
    if (end === normalized.length) break;
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
}

export async function indexStory(storyId, text) {
  const model = await getEmbeddingModel();
  const chunks = splitTextIntoChunks(text);

  const vectors = [];
  for (const chunk of chunks) {
    const embedding = await model.embed(chunk);
    vectors.push(embedding);
  }

  const rows = chunks.map((chunk, idx) => ({
    id: `${storyId}-${idx}`,
    storyId,
    chunkId: String(idx),
    text: chunk,
    vector: vectors[idx]
  }));

  const db = await getDb();
  const names = await db.tableNames();
  let table;
  if (!names.includes(TABLE_NAME)) {
    table = await getOrCreateTable(rows);
  } else {
    table = await getOrCreateTable([]);
    await table.add(rows);
  }
}

async function retrieveTopK(storyId, question, topK = 4) {
  const table = await getOrCreateTable();
  const model = await getEmbeddingModel();
  const qVector = await model.embed(question);
  let results = await table
    .search(qVector, { vectorColumn: "vector" })
    .where(`"storyId" = '${storyId}'`)
    .limit(topK)
    .toArray();
  if (!Array.isArray(results) || results.length === 0) {
    results = await table.search(qVector, { vectorColumn: "vector" }).limit(topK).toArray();
  }
  return Array.isArray(results) ? results : [];
}

function buildPrompt(question, passages) {
  const list = Array.isArray(passages) ? passages : [];
  const context = list
    .map((p, i) => `(${i + 1}) ${p.text}`)
    .join("\n\n");
  return `Eres un asistente útil. Usa exclusivamente el contexto para responder de forma concisa.
Si no hay información suficiente, responde que no está en el texto.

Contexto:\n${context}\n\nPregunta: ${question}\nRespuesta:`;
}

async function localGenerate(prompt) {
  // Extrae contexto y pregunta para generar una respuesta breve por reglas sencillas
  const ctx = prompt.split("Contexto:\n")[1]?.split("\n\nPregunta:")?.[0] || "";
  const question = prompt.split("\n\nPregunta:")?.[1]?.split("\nRespuesta:")?.[0] || "";
  if (!ctx.trim()) return "Sin contexto";
  // Escoge el primer pasaje más relevante y trata de responder por coincidencia básica
  const first = ctx.split("\n\n")[0] || ctx;
  const lowerQ = question.toLowerCase();
  if (lowerQ.includes("quien") || lowerQ.includes("quién")) {
    const m = first.match(/([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*/g);
    if (m && m.length) return m[0];
  }
  if (lowerQ.includes("donde") || lowerQ.includes("dónde")) {
    const donde = first.match(/en (el|la|los|las) [^\.\,]+/i);
    if (donde) return donde[0];
  }
  const sentence = first.split(/[\.\!\?]/)[0];
  return sentence?.trim() || first.trim();
}

import { generateWithGemini } from "./llm-gemini.js";

export async function askQuestion(storyId, question) {
  const top = await retrieveTopK(storyId, question, 4);
  if (!top.length) return "Sin contexto";
  const prompt = buildPrompt(question, top);
  try {
    const answer = await generateWithGemini(prompt);
    if (answer && answer.trim()) return answer.trim();
  } catch (_) {}
  return await localGenerate(prompt);
}


