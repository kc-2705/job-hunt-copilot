require('dotenv').config({ quiet: true });

const isProd = process.env.NODE_ENV === 'production';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}

module.exports = {
  isProd,
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT) || 8080,
  mongoUrl: () => required('MONGO_URL'),
  jwtSecret: () => required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Comma-separated list of front-end origins allowed to call the API.
  // Render passes the website's bare service name, so https:// and .onrender.com are added when missing.
  clientOrigins: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .map((s) => (/^https?:\/\//.test(s) ? s : `https://${s.includes('.') ? s : `${s}.onrender.com`}`)),
  // Any OpenAI-compatible chat API. Defaults to Groq's free tier running open-weight models.
  llm: {
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
    apiKey: process.env.GROQ_API_KEY || process.env.LLM_API_KEY || '',
    // Quick structured extraction uses the small model; judging and writing use the large one.
    fastModel: process.env.LLM_FAST_MODEL || 'openai/gpt-oss-20b',
    smartModel: process.env.LLM_SMART_MODEL || 'openai/gpt-oss-120b',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 60000,
  },
  // Sentence embeddings run inside the server (no API key, no cost).
  embeddings: {
    model: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
    // "fake" swaps in a tiny word-hashing embedder so tests run without downloading the model.
    mode: process.env.EMBEDDINGS || 'local',
  },
};
