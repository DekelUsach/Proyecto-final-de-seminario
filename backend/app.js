import 'dotenv/config';
import express from "express";
import cors from "cors";
import { indexStory, askQuestion, allocateNextStoryId, listStories, deleteStory } from "./rag/index.js";
import multer from 'multer';
import { extractTextFromPdf, extractTextFromDocx } from './rag/ingest.js';
import fetch from 'node-fetch';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Configuración OCR
const OCR_MIN_TEXT_LENGTH = Number.isFinite(Number(process.env.OCR_MIN_TEXT_LENGTH))
  ? Number(process.env.OCR_MIN_TEXT_LENGTH)
  : 100;
const OCR_LANG = (process.env.OCR_LANG || 'spa').toString();

// Indexar texto y asignar storyId autoincremental
app.post("/api/indexStory", async (req, res) => {
  try {
    let { text, title } = req.body;
    text = (text ?? "").trim();
    title = (title ?? "").trim();
    if (!text) {
      return res.status(400).json({ error: "Parametro requerido: text" });
    }
    const storyIdNum = await allocateNextStoryId();
    const storyId = String(storyIdNum);
    await indexStory(storyId, text, title);
    res.json({ ok: true, storyId, title });
  } catch (err) {
    console.error("/api/indexStory error", err);
    res.status(500).json({ error: err.message || "internal_error" });
  }
});

// Hacer pregunta usando RAG
app.post("/api/ask", async (req, res) => {
  try {
    let { storyId, question } = req.body;
    storyId = (storyId ?? "").trim();
    question = (question ?? "").trim();
    if (!storyId || !question) {
      return res.status(400).json({ error: "Parametros requeridos: storyId, question" });
    }
    const answer = await askQuestion(storyId, question);
    res.json({ answer });
  } catch (err) {
    console.error("/api/ask error", err);
    res.status(500).json({ error: err.message || "internal_error" });
  }
});

// Listar textos indexados
app.get("/api/stories", async (_req, res) => {
  try {
    const stories = await listStories();
    res.json({ stories });
  } catch (err) {
    console.error("/api/stories error", err);
    res.status(500).json({ error: err.message || "internal_error" });
  }
});

// Eliminar un texto por storyId
app.delete("/api/stories/:storyId", async (req, res) => {
  try {
    const storyId = String(req.params.storyId || "").trim();
    if (!storyId) return res.status(400).json({ error: "Parametro requerido: storyId" });
    const ok = await deleteStory(storyId);
    if (!ok) return res.status(500).json({ error: "no_se_pudo_eliminar" });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/stories/:storyId error", err);
    res.status(500).json({ error: err.message || "internal_error" });
  }
});

// Subida de archivos para extracción de texto (pdf/docx)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const title = (req.body?.title || '').toString().trim();
    if (!file) return res.status(400).json({ error: 'file_required' });
    
    console.log(`[UPLOAD] Archivo recibido:`, {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      title: title
    });
    
    const mime = file.mimetype || '';
    let text = '';
    
    if (mime === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      console.log(`[UPLOAD] Procesando PDF...`);
      text = await extractTextFromPdf(file.buffer, { language: OCR_LANG, minLength: OCR_MIN_TEXT_LENGTH });
      console.log(`[UPLOAD] PDF procesado, texto extraído: ${text.length} caracteres`);
    } else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.originalname.toLowerCase().endsWith('.docx')
    ) {
      console.log(`[UPLOAD] Procesando DOCX...`);
      text = await extractTextFromDocx(file.buffer);
      console.log(`[UPLOAD] DOCX procesado, texto extraído: ${text.length} caracteres`);
    } else {
      console.log(`[UPLOAD] Tipo de archivo no soportado:`, mime);
      return res.status(400).json({ error: 'unsupported_type' });
    }
    
    if (!text || text.length < OCR_MIN_TEXT_LENGTH) {
      console.log(`[UPLOAD] Texto insuficiente: ${text?.length || 0} caracteres`);
      return res.status(400).json({ 
        error: 'no_text_extracted',
        details: {
          extractedLength: text?.length || 0,
          fileSize: file.size,
          fileType: mime,
          minRequired: OCR_MIN_TEXT_LENGTH
        }
      });
    }
    
    console.log(`[UPLOAD] Texto válido, indexando...`);
    const storyIdNum = await allocateNextStoryId();
    const storyId = String(storyIdNum);
    await indexStory(storyId, text, title);
    console.log(`[UPLOAD] Indexación exitosa, ID: ${storyId}`);
    
    res.json({ ok: true, storyId, title: title || null, length: text.length });
  } catch (err) {
    console.error('/api/upload error', err);
    res.status(500).json({ error: err.message || 'internal_error' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
