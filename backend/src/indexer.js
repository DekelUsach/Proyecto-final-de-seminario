import { geminiEmbedding } from './embedding.js';
import { getOrCreateCollection } from './vectorStore.js';

function chunkText(text, size = 500) {
  const words = text.split(/\s+/);
  const chunks = [];
  let current = [];
  for (let word of words) {
    if ((current.join(' ') + ' ' + word).length > size) {
      chunks.push(current.join(' '));
      current = [];
    }
    current.push(word);
  }
  if (current.length) chunks.push(current.join(' '));
  return chunks;
}

export async function indexStory(storyId, text) {
  const collection = await getOrCreateCollection("stories");
  const chunks = chunkText(text);

  const ids = [];
  const embeddings = [];
  const metadatas = [];

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await geminiEmbedding(chunks[i]);
    ids.push(`chunk-${storyId}-${i}`);
    embeddings.push(embedding);
    metadatas.push({ storyId, text: chunks[i] });
  }

  await collection.add({
    ids,
    embeddings,
    metadatas
  });

  console.log(`Se indexaron ${chunks.length} chunks para storyId=${storyId}`);
}
