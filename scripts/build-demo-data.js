/**
 * Runs the real AI once over the sample resume and job posts in docs/samples and
 * saves the results to scripts/demo-data.json, so the demo works without an API key.
 *
 *   node scripts/build-demo-data.js
 */
const fs = require('fs');
const path = require('path');
const { toChunks } = require('../server/services/resumeParser');
const { embed } = require('../server/services/embeddings');
const copilot = require('../server/services/copilot');

const samples = path.join(__dirname, '..', 'docs', 'samples');
const read = (f) => fs.readFileSync(path.join(samples, f), 'utf8');

const JOBS = [
  { file: 'job-fullstack.txt', status: 'interview', url: 'https://example.com/jobs/brightline-senior-fullstack', extras: true },
  { file: 'job-frontend-react.txt', status: 'applied', url: 'https://example.com/jobs/pinecrest-frontend', extras: false },
  { file: 'job-backend-java.txt', status: 'saved', url: 'https://example.com/jobs/fernway-backend', extras: false },
];

async function main() {
  const resumeText = read('resume-alex-morgan.txt');
  const chunks = toChunks(resumeText);
  (await embed(chunks.map((c) => c.text))).forEach((v, i) => (chunks[i].embedding = v));

  const jobs = [];
  for (const spec of JOBS) {
    // Groq free tier allows 8,000 tokens a minute, so space the jobs out.
    if (jobs.length) await new Promise((r) => setTimeout(r, 65000));
    const description = read(spec.file);
    const { title, company, yearsRequired, ...details } = await copilot.readJobPost(description);
    const job = { title, company, url: spec.url, status: spec.status, description, details: { ...details, yearsRequired } };
    job.match = await copilot.matchResume(details.requirements, chunks);
    if (spec.extras) {
      job.tailored = await copilot.tailorBullets(job, chunks);
      job.coverLetter = await copilot.coverLetter(job, chunks, 'Alex Morgan');
    }
    console.log(`${title} at ${company}: score ${job.match.score}, sponsorship ${details.sponsorship}`);
    jobs.push(job);
  }

  const out = { resume: { fileName: 'resume-alex-morgan.txt', text: resumeText }, jobs };
  fs.writeFileSync(path.join(__dirname, 'demo-data.json'), `${JSON.stringify(out, null, 2)}\n`);
  console.log('Saved scripts/demo-data.json');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
