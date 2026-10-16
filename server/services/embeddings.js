const path = require('path');
const env = require('../config/env');

// Sentence embeddings turn text into vectors so we can find the resume bullets
// that mean the same thing as a job requirement, even with different wording
// ("built REST services" matches "API development").

const DIMENSIONS = 384;
let extractor = null;

async function localEmbed(texts) {
  if (!extractor) {
    const { pipeline, env: hf } = await import('@huggingface/transformers');
    // Use a local copy first (see scripts/download-model.sh), then fall back to downloading.
    const modelDir = path.join(__dirname, '..', '..', '.cache', 'models');
    hf.localModelPath = modelDir;
    hf.allowLocalModels = true;
    hf.cacheDir = modelDir;
    // all-MiniLM-L6-v2 (quantized): about 23 MB, fast on a CPU, downloaded once on first use.
    // The first download can hit a dropped connection, so try a few times.
    for (let attempt = 1; !extractor; attempt++) {
      try {
        extractor = await pipeline('feature-extraction', env.embeddings.model, { dtype: 'q8' });
      } catch (err) {
        if (attempt >= 4) throw err;
        await new Promise((r) => setTimeout(r, attempt * 1500));
      }
    }
  }
  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  return output.tolist();
}

// Deterministic word-hashing embedder for tests: similar words give similar vectors.
function fakeEmbed(texts) {
  return texts.map((t) => {
    const v = new Array(DIMENSIONS).fill(0);
    for (const word of t.toLowerCase().match(/[a-z0-9+#.]+/g) ?? []) {
      let h = 0;
      for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      v[h % DIMENSIONS] += 1;
    }
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  });
}

async function embed(texts) {
  if (!texts.length) return [];
  return env.embeddings.mode === 'fake' ? fakeEmbed(texts) : localEmbed(texts);
}

/** Cosine similarity of two normalized vectors (just a dot product). */
function similarity(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** Indexes of the `k` chunks most similar to the query vector, best first. */
function topK(query, chunks, k = 3) {
  return chunks
    .map((c, i) => ({ i, score: c.embedding?.length ? similarity(query, c.embedding) : -1 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

module.exports = { embed, similarity, topK, DIMENSIONS };
