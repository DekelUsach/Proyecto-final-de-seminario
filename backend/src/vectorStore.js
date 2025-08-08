import { ChromaClient } from "chromadb";

export const chroma = new ChromaClient({
  host: "http://localhost:8000"
});

export async function getOrCreateCollection(name) {
  try {
    return await chroma.getOrCreateCollection({ name });
  } catch (err) {
    console.error("Error creando colección:", err);
    throw err;
  }
}
