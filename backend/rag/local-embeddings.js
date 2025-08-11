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

export async function getEmbeddingModel() {
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


