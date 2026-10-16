process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.EMBEDDINGS = 'fake';
process.env.GROQ_API_KEY = 'test-key';

const { describe, test, before, after, beforeEach } = require('node:test');
const { expect } = require('expect');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../server/app');
const { connectDb, disconnectDb } = require('../server/config/db');

// A fake Groq: answers each kind of request with a fixed, valid response.
const realFetch = global.fetch;
const llmCalls = [];
function fakeGroq(url, options) {
  if (!String(url).includes('/chat/completions')) return realFetch(url, options);
  const body = JSON.parse(options.body);
  llmCalls.push(body);
  const schemaName = body.response_format?.json_schema?.name;
  const answers = {
    job_post: {
      title: 'Backend Engineer',
      company: 'Acme',
      summary: 'Build APIs.',
      seniority: 'Mid',
      yearsRequired: 3,
      location: 'Remote',
      workType: 'remote',
      sponsorship: 'no',
      sponsorshipQuote: 'We cannot sponsor visas.',
      requirements: [
        { skill: 'Node.js', importance: 'required' },
        { skill: 'PostgreSQL', importance: 'required' },
        { skill: 'Kubernetes', importance: 'nice' },
      ],
    },
    // Claims evidence bullet 999, which doesn't exist; the server must drop it.
    match: {
      items: [
        { id: 0, verdict: 'met', explanation: 'Built Node.js APIs.', evidence: [0] },
        { id: 1, verdict: 'met', explanation: 'Says PostgreSQL.', evidence: [999] },
        { id: 2, verdict: 'missing', explanation: 'Not mentioned.', evidence: [] },
      ],
    },
  };
  let content;
  if (schemaName === 'tailor') {
    const ids = [...body.messages[1].content.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
    content = JSON.stringify({ bullets: ids.map((id) => ({ id, rewritten: 'Built Node.js APIs serving 10 million users on Kubernetes.', reason: 'Focus' })) });
  } else {
    content = schemaName ? JSON.stringify(answers[schemaName]) : 'Dear Hiring Manager,\n\nI am applying.\n\nSincerely,\nKavya';
  }
  return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));
}

const RESUME = `Kavya Example
kavya@example.com

PROFESSIONAL SUMMARY
Full-stack developer with five years of experience building web applications.

WORK EXPERIENCE
Software Engineer, Example Corp (2021 - Present)
• Built REST APIs in Node.js and Express for order tracking with request validation.
• Designed MySQL schemas and indexes that made the slowest report much faster.
• Built React dashboards for warehouse staff to track shipments.

SKILLS
JavaScript, TypeScript, Node.js, React, MySQL, Docker
`;

const JOB_POST = `Backend Engineer at Acme. ${'We build APIs for logistics companies and need someone who loves Node.js. '.repeat(5)} We cannot sponsor visas.`;

let mongo;
let app;

before(async () => {
  global.fetch = fakeGroq;
  mongo = await MongoMemoryServer.create();
  await connectDb(mongo.getUri());
  app = createApp();
});

after(async () => {
  global.fetch = realFetch;
  await disconnectDb();
  await mongo.stop();
});

beforeEach(async () => {
  llmCalls.length = 0;
  await mongoose.connection.db.dropDatabase();
});

async function signUp(email = 'kavya@example.com') {
  const res = await request(app).post('/api/v1/auth/register').send({ name: 'Kavya', email, password: 'secret123' });
  expect(res.status).toBe(201);
  return { Authorization: `Bearer ${res.body.token}` };
}

async function withResumeAndJob() {
  const auth = await signUp();
  await request(app).put('/api/v1/resume').set(auth).send({ text: RESUME }).expect(200);
  const { body } = await request(app).post('/api/v1/jobs').set(auth).send({ description: JOB_POST }).expect(201);
  return { auth, job: body.job };
}

describe('auth', () => {
  test('rejects requests without a token', async () => {
    await request(app).get('/api/v1/jobs').expect(401);
  });

  test('does not reveal whether an email exists', async () => {
    await signUp();
    const wrongPassword = await request(app).post('/api/v1/auth/login').send({ email: 'kavya@example.com', password: 'nope12345' });
    const unknownEmail = await request(app).post('/api/v1/auth/login').send({ email: 'who@example.com', password: 'nope12345' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
  });
});

describe('resume', () => {
  test('splits pasted text into sections and bullets, without sending embeddings to the browser', async () => {
    const auth = await signUp();
    const { body } = await request(app).put('/api/v1/resume').set(auth).send({ text: RESUME }).expect(200);
    const texts = body.resume.chunks.map((c) => c.text);
    expect(texts).toContain('Built REST APIs in Node.js and Express for order tracking with request validation.');
    expect(body.resume.chunks.find((c) => c.text.startsWith('Built REST')).section).toBe('WORK EXPERIENCE');
    expect(body.resume.chunks[0]).not.toHaveProperty('embedding');
  });

  test('rejects text that is too short to be a resume', async () => {
    const auth = await signUp();
    const res = await request(app).put('/api/v1/resume').set(auth).send({ text: 'hello' });
    expect(res.status).toBe(400);
  });

  test('rejects uploads that are not PDFs', async () => {
    const auth = await signUp();
    const res = await request(app).put('/api/v1/resume').set(auth).attach('file', Buffer.from('not a pdf'), { filename: 'resume.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/PDF/);
  });
});

describe('jobs and AI', () => {
  test('adding a job reads the post, including visa sponsorship', async () => {
    const { job } = await withResumeAndJob();
    expect(job.title).toBe('Backend Engineer');
    expect(job.details.sponsorship).toBe('no');
    expect(job.details.requirements).toHaveLength(3);
    expect(job.status).toBe('saved');
  });

  test('analyze scores in code and drops evidence that points at bullets that do not exist', async () => {
    const { auth, job } = await withResumeAndJob();
    const { body } = await request(app).post(`/api/v1/jobs/${job._id}/analyze`).set(auth).expect(200);
    const [node, postgres, k8s] = body.job.match.items;
    expect(node.verdict).toBe('met');
    // The model said "met" but its only evidence was invalid, so it is downgraded to partial.
    expect(postgres.evidence).toEqual([]);
    expect(postgres.verdict).toBe('partial');
    expect(k8s.verdict).toBe('missing');
    // required met (2) + required partial (1) + nice missing (0) = 3 of 5 points.
    expect(body.job.match.score).toBe(60);
    expect(body.job.match.gaps).toEqual([]);
  });

  test('tailoring only rewrites experience bullets and flags invented facts', async () => {
    const { auth, job } = await withResumeAndJob();
    const { body } = await request(app).post(`/api/v1/jobs/${job._id}/tailor`).set(auth).expect(200);
    expect(body.job.tailored.length).toBeGreaterThan(0);
    for (const b of body.job.tailored) {
      expect(b.original).not.toMatch(/Example Corp|PROFESSIONAL|five years/);
      // "10 million" and "Kubernetes" were not in any original bullet.
      expect(b.newTerms).toEqual(expect.arrayContaining(['10', 'kubernetes']));
    }
  });

  test('sends only retrieved bullets to the AI, not the whole resume', async () => {
    const { auth, job } = await withResumeAndJob();
    await request(app).post(`/api/v1/jobs/${job._id}/analyze`).set(auth).expect(200);
    const matchCall = llmCalls.find((c) => c.response_format?.json_schema?.name === 'match');
    expect(matchCall.messages[1].content).not.toContain('PROFESSIONAL SUMMARY');
  });

  test('cover letter is saved on the job', async () => {
    const { auth, job } = await withResumeAndJob();
    const { body } = await request(app).post(`/api/v1/jobs/${job._id}/cover-letter`).set(auth).expect(200);
    expect(body.job.coverLetter).toMatch(/^Dear Hiring Manager/);
  });

  test('AI features need a resume first', async () => {
    const auth = await signUp();
    const { body } = await request(app).post('/api/v1/jobs').set(auth).send({ description: JOB_POST }).expect(201);
    const res = await request(app).post(`/api/v1/jobs/${body.job._id}/analyze`).set(auth);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/resume/i);
  });

  test('moving a job to applied records the date, and stats count it', async () => {
    const { auth, job } = await withResumeAndJob();
    const { body } = await request(app).patch(`/api/v1/jobs/${job._id}`).set(auth).send({ status: 'applied' }).expect(200);
    expect(body.job.appliedAt).toBeTruthy();
    const stats = await request(app).get('/api/v1/jobs/stats').set(auth).expect(200);
    expect(stats.body.byStatus.applied).toBe(1);
    expect(stats.body.total).toBe(1);
  });

  test('users can never see or change each other\'s jobs', async () => {
    const { job } = await withResumeAndJob();
    const other = await signUp('other@example.com');
    await request(app).get(`/api/v1/jobs/${job._id}`).set(other).expect(404);
    await request(app).patch(`/api/v1/jobs/${job._id}`).set(other).send({ status: 'offer' }).expect(404);
    await request(app).post(`/api/v1/jobs/${job._id}/analyze`).set(other).expect(404);
    await request(app).delete(`/api/v1/jobs/${job._id}`).set(other).expect(404);
    const list = await request(app).get('/api/v1/jobs').set(other).expect(200);
    expect(list.body.jobs).toEqual([]);
  });
});
