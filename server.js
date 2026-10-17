const env = require('./server/config/env');
const { connectDb } = require('./server/config/db');
const { createApp } = require('./server/app');

async function start() {
  const conn = await connectDb(env.mongoUrl());
  console.log(`Connected to MongoDB (${conn.host})`);
  // On the public demo site, (re)create the demo account at each start so visitors always see a clean example.
  if (process.env.SEED_DEMO === 'true') {
    const { seedDemo, DEMO } = require('./scripts/seed');
    await seedDemo();
    console.log(`Demo account ready: ${DEMO.email}`);
  }
  createApp().listen(env.port, () => console.log(`API running on http://localhost:${env.port}`));
}

start().catch((err) => {
  console.error(`Could not start the server: ${err.message}`);
  process.exit(1);
});
