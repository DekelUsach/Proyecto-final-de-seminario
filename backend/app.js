import express from "express";
import { startChroma } from "./chromaServer.js";
import { getOrCreateCollection } from "./vectorStore.js";

startChroma(); // Lanza el servidor de Chroma en segundo plano

const app = express();
app.use(express.json());

app.post("/index", async (req, res) => {
  const { name, text } = req.body;
  const collection = await getOrCreateCollection(name);

  await collection.add({
    ids: ["doc1"],
    documents: [text]
  });

  res.json({ message: "Texto indexado" });
});

app.listen(3001, () => console.log("Servidor en http://localhost:3001"));
