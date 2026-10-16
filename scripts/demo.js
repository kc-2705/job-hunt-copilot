/**
 * Runs the API with a temporary in-memory MongoDB and a demo account: a sample resume
 * and three analyzed jobs (from scripts/demo-data.json). No database setup needed.
 * Data is lost when you stop it.
 *
 *   npm run demo        then log in as demo@jobcopilot.app / demo12345
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex');

const env = require('../server/config/env');
const { connectDb } = require('../server/config/db');
const { createApp } = require('../server/app');
const { seedDemo, DEMO } = require('./seed');

async function main() {
  const mongo = await MongoMemoryServer.create();
  await connectDb(mongo.getUri());
  await seedDemo();
  createApp().listen(env.port, () => {
    console.log(`Demo API running on http://localhost:${env.port}`);
    console.log(`Log in as ${DEMO.email} / ${DEMO.password}`);
    if (!env.llm.apiKey) console.log('No GROQ_API_KEY set: browsing works, but new AI requests will be turned off.');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
