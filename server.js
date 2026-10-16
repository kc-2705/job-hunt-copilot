const env = require('./server/config/env');
const { connectDb } = require('./server/config/db');
const { createApp } = require('./server/app');

async function start() {
  const conn = await connectDb(env.mongoUrl());
  console.log(`Connected to MongoDB (${conn.host})`);
  createApp().listen(env.port, () => console.log(`API running on http://localhost:${env.port}`));
}

start().catch((err) => {
  console.error(`Could not start the server: ${err.message}`);
  process.exit(1);
});
