import 'dotenv/config';
import express from "express";
import cors from "cors";
import { indexStory, askQuestion } from "./rag/index.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Indexar texto por storyId
app.post("/api/indexStory", async (req, res) => {
  try {
    const { storyId, text } = req.body;
    if (!storyId || !text) {
      return res.status(400).json({ error: "Parametros requeridos: storyId, text" });
    }
    await indexStory(storyId, text);
    res.json({ ok: true });
  } catch (err) {
    console.error("/api/indexStory error", err);
    res.status(500).json({ error: err.message || "internal_error" });
  }
});

// Hacer pregunta usando RAG
app.post("/api/ask", async (req, res) => {
  try {
    const { storyId, question } = req.body;
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
