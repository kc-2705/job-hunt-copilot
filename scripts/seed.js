const bcrypt = require('bcryptjs');
const User = require('../server/models/User');
const Resume = require('../server/models/Resume');
const Job = require('../server/models/Job');
const { toChunks } = require('../server/services/resumeParser');
const { embed } = require('../server/services/embeddings');
const data = require('./demo-data.json');

const DEMO = { name: 'Alex Morgan', email: 'demo@jobcopilot.app', password: 'demo12345' };

/** Creates (or resets) the demo account with a sample resume and three analyzed jobs. */
async function seedDemo() {
  const existing = await User.findOne({ email: DEMO.email });
  if (existing) {
    await Promise.all([Job.deleteMany({ user: existing._id }), Resume.deleteOne({ user: existing._id }), User.deleteOne({ _id: existing._id })]);
  }
  const user = await User.create({ name: DEMO.name, email: DEMO.email, passwordHash: await bcrypt.hash(DEMO.password, 10) });

  const chunks = toChunks(data.resume.text);
  (await embed(chunks.map((c) => c.text))).forEach((v, i) => (chunks[i].embedding = v));
  await Resume.create({ user: user._id, fileName: data.resume.fileName, text: data.resume.text, chunks });

  const day = 24 * 60 * 60 * 1000;
  await Job.insertMany(
    data.jobs.map((j, i) => ({
      ...j,
      user: user._id,
      details: { ...j.details, yearsRequired: j.details.yearsRequired ?? undefined },
      match: { ...j.match, analyzedAt: new Date() },
      appliedAt: ['applied', 'interview'].includes(j.status) ? new Date(Date.now() - (i + 3) * day) : undefined,
    })),
  );
  return user;
}

module.exports = { seedDemo, DEMO };
