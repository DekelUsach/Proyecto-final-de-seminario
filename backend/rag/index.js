import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { connect } from "@lancedb/lancedb";
import { getEmbeddingModel, embedWithGemini, embedWithLocal } from "./local-embeddings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, "..", ".lancedb");
const TABLE_NAME = "stories";
const CACHE_PATH = path.join(__dirname, "..", ".lancedb", "memory-cache.json");

// Índice en memoria para mejorar recuperación inmediata tras indexar
const memoryByStory = new Map(); // storyId -> { rows: Row[], embedKind: 'gemini'|'local', dim: number }
let lastAssignedStoryId = -1; // autoincrement story id, starts at -1 so first assigned is 0
let memoryLoaded = false;

async function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  try { await fs.mkdir(dir, { recursive: true }); } catch (_) {}
}

async function saveMemoryCache() {
  try {
    await ensureDirExists(CACHE_PATH);
    const obj = {};
    for (const [sid, val] of memoryByStory.entries()) {
      obj[sid] = { embedKind: val.embedKind, dim: val.dim, rows: val.rows };
    }
    obj.__meta = { lastAssignedStoryId };
    await fs.writeFile(CACHE_PATH, JSON.stringify(obj));
  } catch (_) {}
}

async function loadMemoryCache() {
  try {
    const buf = await fs.readFile(CACHE_PATH, "utf8");
    const obj = JSON.parse(buf || "{}");
    for (const sid of Object.keys(obj)) {
      const val = obj[sid];
      if (val && Array.isArray(val.rows)) {
        memoryByStory.set(sid, { embedKind: val.embedKind || 'local', dim: val.dim || 0, rows: val.rows });
      }
    }
    if (obj.__meta && typeof obj.__meta.lastAssignedStoryId === 'number') {
      lastAssignedStoryId = obj.__meta.lastAssignedStoryId;
    } else {
      // Fallback: calcular a partir de claves en memoria
      const ids = Array.from(memoryByStory.keys())
        .map(k => Number.parseInt(k, 10))
        .filter(n => Number.isFinite(n) && n >= 0);
      lastAssignedStoryId = ids.length ? Math.max(...ids) : -1;
    }
  } catch (_) {}
  memoryLoaded = true;
}

async function ensureMemoryLoaded() {
  if (!memoryLoaded) await loadMemoryCache();
}

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

// Segmentación por oraciones con solapamiento de oraciones para evitar cortar respuestas clave
function splitTextIntoChunks(text, targetChars = 400, sentenceOverlap = 1) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const sentences = normalized.split(/(?<=[\.!?])\s+/);
  const chunks = [];
  let current = [];
  let currentLen = 0;
  for (const s of sentences) {
    if (currentLen + s.length + 1 > targetChars && current.length > 0) {
      chunks.push(current.join(" "));
      const overlap = current.slice(Math.max(0, current.length - sentenceOverlap));
      current = [...overlap];
      currentLen = current.reduce((acc, v) => acc + v.length + 1, 0);
    }
    current.push(s);
    currentLen += s.length + 1;
  }
  if (current.length) chunks.push(current.join(" "));
  return chunks;
}

export async function indexStory(storyId, text, title = "") {
  const chunks = splitTextIntoChunks(text, 400, 1);

  let embedFn = embedWithLocal;
  let embedKind = 'local';
  try {
    // Intentar Gemini para fijar dimensión (768) de forma consistente
    await embedWithGemini("ping");
    embedFn = embedWithGemini;
    embedKind = 'gemini';
  } catch (_) {
    embedFn = embedWithLocal; // 384
    embedKind = 'local';
  }

  const vectors = [];
  for (const chunk of chunks) {
    const embedding = await embedFn(chunk);
    vectors.push(embedding);
  }

  const normTitle = (title || "").toString().trim();
  const rows = chunks.map((chunk, idx) => ({
    id: `${storyId}-${idx}`,
    storyId,
    chunkId: String(idx),
    text: chunk,
    vector: vectors[idx],
    title: normTitle
  }));

  // Guardar en memoria para recuperación fiable y rápida
  const dim = vectors[0]?.length || 0;
  memoryByStory.set(storyId, { rows, embedKind, dim });
  await saveMemoryCache();

  const db = await getDb();
  const names = await db.tableNames();
  let table;
  if (!names.includes(TABLE_NAME)) {
    // Creamos la tabla con la primera forma de vector detectada
    table = await getOrCreateTable(rows);
  } else {
    table = await getOrCreateTable([]);
    try {
      await table.add(rows);
    } catch (err) {
      // Si hay incompatibilidad de dimensión del vector, recreamos la tabla
      try {
        if (typeof db.dropTable === 'function') {
          await db.dropTable(TABLE_NAME);
        }
      } catch (_) {}
      await db.createTable(TABLE_NAME, rows);
    }
  }
}

// Búsqueda con umbral de similitud y MMR simple para diversidad
function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / denom;
}

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}+/gu, "")
    .replace(/[^a-z0-9áéíóúñü\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const ES_STOP = new Set([
  "el","la","los","las","un","una","unos","unas","y","o","u","de","del","al","a","en","por","para","con","sin","que","se","su","sus","le","les","lo","como","es","esta","este","esta","estas","estos","pero","si","no","ya","muy","más","mas","menos","sobre","entre","cuando","donde","dónde","quien","quién","qué","que"
]);

function keywordScore(question, text) {
  const qTokens = tokenize(question).filter(t => !ES_STOP.has(t));
  if (qTokens.length === 0) return 0;
  const tTokens = tokenize(text);
  const tSet = new Set(tTokens);
  let overlap = 0;
  for (const t of qTokens) if (tSet.has(t)) overlap += 1;
  return overlap / qTokens.length;
}

async function retrieveTopK(storyId, question, topK = 5, minSim = 0.15, mmrLambda = 0.8) {
  await ensureMemoryLoaded();
  // 1) Preferimos índice en memoria si existe (consistente con embeddings usados al indexar)
  const mem = memoryByStory.get(storyId);
  if (mem && Array.isArray(mem.rows) && mem.rows.length) {
    const useGemini = mem.embedKind === 'gemini';
    const qVector = useGemini ? await embedWithGemini(question) : await embedWithLocal(question);
    const scoredMem = mem.rows.map(r => ({ ...r, _sim: cosineSimilarity(qVector, r.vector) }))
      .sort((a, b) => b._sim - a._sim);

    const base = scoredMem.filter(r => r._sim >= minSim);
    const candidates = base.length ? base : scoredMem.slice(0, Math.max(5, topK));
    if (!candidates.length) return [];

    // MMR
    const selected = [];
    const selectedVectors = [];
    const candCopy = [...candidates];
    while (selected.length < topK && candCopy.length > 0) {
      let bestIdx = 0, bestScore = -Infinity;
      for (let i = 0; i < candCopy.length; i++) {
        const cand = candCopy[i];
        const relevance = cand._sim;
        let redundancy = 0;
        for (const v of selectedVectors) {
          redundancy = Math.max(redundancy, cosineSimilarity(cand.vector, v));
        }
        const mmrScore = mmrLambda * relevance - (1 - mmrLambda) * redundancy;
        if (mmrScore > bestScore) { bestScore = mmrScore; bestIdx = i; }
      }
      const chosen = candCopy.splice(bestIdx, 1)[0];
      selected.push(chosen);
      selectedVectors.push(chosen.vector);
    }

    // Expansión de vecinos ±1 usando memoria
    const idToRow = new Map(mem.rows.map(r => [String(r.id), r]));
    const seen = new Set(selected.map(r => String(r.id)));
    const expanded = [...selected];
    for (const s of selected) {
      const idx = Number(s.chunkId);
      for (const off of [-1, 1]) {
        const nid = `${s.storyId}-${idx + off}`;
        if (!seen.has(nid) && idToRow.has(nid)) {
          expanded.push(idToRow.get(nid));
          seen.add(nid);
        }
      }
    }

    // Reranking híbrido
    const reranked = expanded.map(r => {
      const kscore = keywordScore(question, r.text || "");
      const sscore = cosineSimilarity(qVector, r.vector);
      const final = 0.6 * sscore + 0.4 * kscore;
      return { ...r, _hybrid: final };
    }).sort((a, b) => b._hybrid - a._hybrid);

    return reranked.slice(0, Math.max(topK, 6));
  }

  // 2) Fallback a LanceDB si no hay memoria
  const table = await getOrCreateTable();
  // Intentar usar la misma dimensión que al indexar; fallback si la búsqueda falla por dimensión.
  let useGemini = false;
  try {
    await embedWithGemini("ping");
    useGemini = true;
  } catch (_) {
    useGemini = false;
  }

  let qVector = useGemini ? await embedWithGemini(question) : await embedWithLocal(question);
  // Hacemos una sola búsqueda amplia y filtramos por storyId en memoria
  let raw;
  try {
    raw = await table
      .search(qVector, { vectorColumn: "vector" })
      .limit(Math.max(200, topK * 20))
      .toArray();
  } catch (err) {
    // Reintento con otra dimensión si falló
    qVector = useGemini ? await embedWithLocal(question) : await embedWithGemini(question);
    raw = await table
      .search(qVector, { vectorColumn: "vector" })
      .limit(Math.max(200, topK * 20))
      .toArray();
  }

  const rawArr = Array.isArray(raw) ? raw : [];
  const rawFiltered = rawArr.filter(r => String(r.storyId) === String(storyId));
  const baseRaw = rawFiltered.length ? rawFiltered : rawArr;

  const scored = baseRaw.map(r => ({ ...r, _sim: cosineSimilarity(qVector, r.vector) }))
    .sort((a, b) => b._sim - a._sim);

  // Filtro por umbral, pero si queda vacío, usamos los mejores por score sin umbral
  const base = scored.filter(r => r._sim >= minSim);
  const candidates = base.length ? base : scored.slice(0, Math.max(5, topK));
  if (candidates.length === 0) return [];

  // MMR greedy (diversidad)
  const selected = [];
  const selectedVectors = [];
  while (selected.length < topK && candidates.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const relevance = cand._sim;
      let redundancy = 0;
      for (const v of selectedVectors) {
        redundancy = Math.max(redundancy, cosineSimilarity(cand.vector, v));
      }
      const mmrScore = mmrLambda * relevance - (1 - mmrLambda) * redundancy;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }
    const chosen = candidates.splice(bestIdx, 1)[0];
    selected.push(chosen);
    selectedVectors.push(chosen.vector);
  }

  // Expansión por vecinos (±1 chunk)
  const idToRow = new Map((scored || []).map(r => [String(r.id), r]));
  const seen = new Set(selected.map(r => String(r.id)));
  const expanded = [...selected];
  for (const s of selected) {
    const idx = Number(s.chunkId);
    for (const off of [-1, 1]) {
      const neighborId = `${s.storyId}-${idx + off}`;
      if (!seen.has(neighborId) && idToRow.has(neighborId)) {
        expanded.push(idToRow.get(neighborId));
        seen.add(neighborId);
      }
    }
  }

  // Reranking híbrido (sim + palabras clave)
  const reranked = expanded.map(r => {
    const kscore = keywordScore(question, r.text || "");
    const sscore = cosineSimilarity(qVector, r.vector);
    // peso: 0.6 denso + 0.4 palabras clave
    const final = 0.6 * sscore + 0.4 * kscore;
    return { ...r, _hybrid: final };
  }).sort((a, b) => b._hybrid - a._hybrid);

  // Limitar a topK-8 pasajes finales
  return reranked.slice(0, Math.max(topK, 6));
}

function buildPrompt(question, passages) {
  const list = Array.isArray(passages) ? passages : [];
  const context = list
    .map((p, i) => `(${i + 1}) ${p.text}`)
    .join("\n\n");
  return `=== CONTEXTO RELEVANTE ===\n${context}\n=== FIN CONTEXTO ===\n\nPregunta del usuario: ${question}\n\nInstrucciones de estilo:\n- Responde de forma clara, amable y personalizada en español rioplatense neutral.\n- Si la respuesta no está escrita de forma explícita en el contexto, deduce y sintetiza a partir de lo que el texto sugiere.\n- Si la pregunta no está relacionada con el texto, explica amablemente que se está yendo por las ramas e invítalo a volver al contenido cargado.\n- Evita respuestas telegráficas; ofrece 2-5 oraciones útiles como máximo.\n\nRespuesta:`;
}

function buildGlobalContextText(rows, maxChars = 6000) {
  const texts = (rows || []).map(r => r.text || "").filter(Boolean);
  const joined = texts.join("\n\n");
  if (joined.length <= maxChars) return joined;
  return joined.slice(0, maxChars);
}

// Intento extractivo simple antes de llamar al LLM
function tryExtractiveAnswer(question, passages) {
  const q = (question || "").toLowerCase();
  const texts = (passages || []).map(p => p.text || "");

  // Si la pregunta pide interpretación/síntesis, evitamos respuestas extractivas
  const needsSynthesis = (
    q.includes("¿por qué") || q.includes("por qué") || q.includes("porque") ||
    q.includes("como") || q.includes("cómo") || q.includes("de qué manera") ||
    q.includes("metáfora") || q.includes("metafora") ||
    q.includes("crecimiento") || q.includes("superación") || q.includes("superacion") ||
    q.includes("interpret") || q.includes("explica") || q.includes("refleja")
  );
  if (needsSynthesis) return "";

  const permitiaRegex = /(?:le|les)?\s*permit[íi]a\s+([^\.;\n]+)/i;
  const poderDeRegex = /poder(?:\s+de\s+|\s+para\s+)([^\.;\n]+)/i;
  const habilidadDeRegex = /habilidad(?:\s+de\s+|\s+para\s+)([^\.;\n]+)/i;
  const capacidadDeRegex = /capacidad(?:\s+de\s+|\s+para\s+)([^\.;\n]+)/i;

  const pickBest = (matches) => {
    let best = "";
    for (const m of matches) {
      const fragment = (m || "").trim().replace(/^"|"$/g, "");
      if (fragment.length > best.length) best = fragment;
    }
    return best ? `"${best}"` : "";
  };

  // Solo intentar estos patrones si la pregunta lo sugiere
  const askPermit = q.includes("permitia") || q.includes("permitía");
  const askPower = q.includes("poder");
  const askSkill = q.includes("habilidad") || q.includes("capacidad");

  if (askPermit) {
    const m1 = [];
    for (const t of texts) {
      const m = t.match(permitiaRegex);
      if (m && m[1]) m1.push(m[1]);
    }
    const ans1 = pickBest(m1);
    if (ans1) return ans1;
  }

  if (askPower) {
    const m2 = [];
    for (const t of texts) {
      const m = t.match(poderDeRegex);
      if (m && m[1]) m2.push(m[1]);
    }
    const ans2 = pickBest(m2);
    if (ans2) return ans2;
  }

  if (askSkill) {
    const m3 = [];
    for (const t of texts) {
      let m = t.match(habilidadDeRegex);
      if (m && m[1]) m3.push(m[1]);
      m = t.match(capacidadDeRegex);
      if (m && m[1]) m3.push(m[1]);
    }
    const ans3 = pickBest(m3);
    if (ans3) return ans3;
  }

  // Nombre del lugar/objeto: "Cómo se llama..." / "nombre del..."
  if (q.includes("cómo se llama") || q.includes("como se llama") || q.includes("nombre")) {
    const llamadoRegex = /llamad[oa]\s+([^\.;\n]+)/i;
    const seLlamaRegex = /se\s+llama\s+([^\.;\n]+)/i;
    const nombreDeRegex = /nombre\s+(?:del|de\s+la|de\s+los|de\s+las)\s+([^\.;\n]+)/i;

    const matches = [];
    for (const t of texts) {
      let m = t.match(llamadoRegex);
      if (m && m[1]) matches.push(m[1]);
      m = t.match(seLlamaRegex);
      if (m && m[1]) matches.push(m[1]);
      m = t.match(nombreDeRegex);
      if (m && m[1]) matches.push(m[1]);
    }
    if (matches.length) {
      let best = matches.reduce((a, b) => (a.length >= b.length ? a : b));
      best = best.replace(/^"|"$/g, "").trim();
      return best ? `"${best}"` : "";
    }
  }

  if (q.includes("qué poder") || q.includes("que poder")) {
    for (const t of texts) {
      const sentences = t.split(/[\.!?]/);
      for (const s of sentences) {
        const sl = s.toLowerCase();
        if (sl.includes("poder") || sl.includes("permitia") || sl.includes("permitía")) {
          const frag = s.trim();
          if (frag) return `"${frag}"`;
        }
      }
    }
  }

  return "";
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
  await ensureMemoryLoaded();
  // Verificar existencia del storyId antes de proceder
  const exists = await storyExists(storyId);
  if (!exists) {
    return "El texto que estas solicitando, no existe";
  }
  const top = await retrieveTopK(storyId, question, 6, 0.25, 0.7);
  // Si no hay pasajes, intentamos con TODO el texto indexado en memoria (si existe)
  if (!top.length) {
    await ensureMemoryLoaded();
    const mem = memoryByStory.get(storyId);
    if (mem && Array.isArray(mem.rows) && mem.rows.length) {
      const globalCtx = buildGlobalContextText(mem.rows, 6000);
      const prompt = buildPrompt(question, [{ text: globalCtx }]);
      try {
        const answer = await generateWithGemini(prompt, {
          temperature: 0.5,
          topP: 0.8,
          maxTokens: 512,
          systemInstruction: "Tu eres LULU, la mascota virtual de Loomi. Eres amable, cercana y ayudas al usuario a entender el texto cargado de la manera más fácil posible. Si te preguntan algo fuera del texto, avisa con calidez que se está yendo por las ramas e invítalo a volver al contenido cargado."
        });
        if (answer && answer.trim()) return answer.trim();
      } catch (_) {}
    }
    return "Hola, soy LULU. No encontré fragmentos exactos, pero puedo ayudarte si me preguntas algo directamente sobre el texto que cargaste.";
  }

  // Primero, intento extractivo si hay una cita clara
  const extractive = tryExtractiveAnswer(question, top);
  if (extractive) {
    // Solo usar formato "Como dice el texto" si la respuesta no es vacía y la pregunta NO requiere síntesis
    const ql = (question || "").toLowerCase();
    const syntheticIntent = ql.includes("de qué manera") || ql.includes("metáfora") || ql.includes("metafora") || ql.includes("por qué") || ql.includes("porque") || ql.includes("cómo") || ql.includes("como");
    if (!syntheticIntent) return `Como dice el texto: ${extractive}`;
  }

  // Prompt con pasajes relevantes
  const prompt = buildPrompt(question, top);
  try {
    const answer = await generateWithGemini(prompt, {
      temperature: 0.5,
      topP: 0.8,
      maxTokens: 512,
      systemInstruction: "Tu eres LULU, la mascota virtual de Loomi. Eres amable, cercana y respondes en español. Basas tus respuestas en el contexto, pero cuando no hay una frase exacta, sintetizas conclusiones razonables. Si la pregunta no está relacionada con el texto, avisa amablemente y sugiere volver al contenido cargado."
    });
    if (answer && answer.trim()) return answer.trim();
  } catch (_) {}

  // Fallback local: genera una síntesis breve y amable
  const local = await localGenerate(prompt);
  if (local) return `Te cuento de forma simple: ${local}`;
  // Si por algún motivo local no produce nada, sintetizar desde todo el texto
  const mem = memoryByStory.get(storyId);
  if (mem && Array.isArray(mem.rows) && mem.rows.length) {
    const globalCtx = buildGlobalContextText(mem.rows, 6000);
    const globalPrompt = buildPrompt(question, [{ text: globalCtx }]);
    try {
      const ans2 = await generateWithGemini(globalPrompt, {
        temperature: 0.6,
        topP: 0.85,
        maxTokens: 512,
        systemInstruction: "Tu eres LULU, la mascota virtual de Loomi. Eres amable y sintetizas ideas cuando no hay citas exactas."
      });
      if (ans2 && ans2.trim()) return ans2.trim();
    } catch (_) {}
  }
  return "No pude generar una respuesta en este momento.";
}

async function maxStoryIdFromTable() {
  try {
    const db = await getDb();
    const names = await db.tableNames();
    if (!names.includes(TABLE_NAME)) return -1;
    const table = await getOrCreateTable();
    const rows = await table.toArray();
    const ids = (Array.isArray(rows) ? rows : [])
      .map(r => Number.parseInt(String(r.storyId), 10))
      .filter(n => Number.isFinite(n) && n >= 0);
    return ids.length ? Math.max(...ids) : -1;
  } catch (_) {
    return -1;
  }
}

export async function allocateNextStoryId() {
  await ensureMemoryLoaded();
  if (lastAssignedStoryId < 0) {
    // Inicializar desde memoria y tabla
    const memIds = Array.from(memoryByStory.keys())
      .map(k => Number.parseInt(k, 10))
      .filter(n => Number.isFinite(n) && n >= 0);
    let maxId = memIds.length ? Math.max(...memIds) : -1;
    const tableMax = await maxStoryIdFromTable();
    if (tableMax > maxId) maxId = tableMax;
    lastAssignedStoryId = maxId;
  }
  lastAssignedStoryId += 1;
  await saveMemoryCache();
  return lastAssignedStoryId;
}

async function storyExists(storyId) {
  try {
    const mem = memoryByStory.get(storyId);
    if (mem && Array.isArray(mem.rows) && mem.rows.length > 0) return true;
    // Si no está en memoria, buscamos en la tabla de LanceDB
    const db = await getDb();
    const names = await db.tableNames();
    if (!names.includes(TABLE_NAME)) return false;
    const table = await getOrCreateTable();
    try {
      // Intento económico: leer un subconjunto grande y filtrar
      const all = await table.toArray();
      return Array.isArray(all) && all.some(r => String(r.storyId) === String(storyId));
    } catch (_) {
      return false;
    }
  } catch (_) {
    return false;
  }
}

export async function listStories() {
  await ensureMemoryLoaded();
  const list = [];
  try {
    // Primero desde memoria
    for (const [sid, val] of memoryByStory.entries()) {
      const title = val?.rows?.[0]?.title || "";
      const count = Array.isArray(val?.rows) ? val.rows.length : 0;
      list.push({ storyId: String(sid), title, chunks: count });
    }
    if (list.length > 0) return list.sort((a, b) => Number(a.storyId) - Number(b.storyId));
    // Si memoria vacía, leer tabla completa
    const table = await getOrCreateTable();
    const rows = await table.toArray();
    const map = new Map();
    for (const r of rows || []) {
      const sid = String(r.storyId);
      const prev = map.get(sid) || { storyId: sid, title: r.title || "", chunks: 0 };
      prev.chunks += 1;
      if (!prev.title && r.title) prev.title = r.title;
      map.set(sid, prev);
    }
    return Array.from(map.values()).sort((a, b) => Number(a.storyId) - Number(b.storyId));
  } catch (_) {
    return list;
  }
}

export async function deleteStory(storyId) {
  await ensureMemoryLoaded();
  try {
    // 1) borrar de memoria
    memoryByStory.delete(String(storyId));
    await saveMemoryCache();

    // 2) borrar de la tabla (recreándola sin esos registros)
    const db = await getDb();
    const names = await db.tableNames();
    if (!names.includes(TABLE_NAME)) return true;
    const table = await getOrCreateTable();
    const rows = await table.toArray();
    const kept = (Array.isArray(rows) ? rows : []).filter(r => String(r.storyId) !== String(storyId));
    if (kept.length === (rows?.length || 0)) return true; // nada que borrar
    // dropear/recrear
    try { if (typeof db.dropTable === 'function') await db.dropTable(TABLE_NAME); } catch (_) {}
    if (kept.length > 0) {
      await db.createTable(TABLE_NAME, kept);
    } else {
      // crear tabla vacía requiere al menos una fila; omitimos y dejamos que se cree en la próxima indexación
    }
    return true;
  } catch (_) {
    return false;
  }
}


