process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.EMBEDDINGS = 'fake';
process.env.GROQ_API_KEY = 'test-key';
process.env.LLM_TIMEOUT_MS = '200';

const { describe, test, before, after, beforeEach } = require('node:test');
const { expect } = require('expect');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../server/app');
const { connectDb, disconnectDb } = require('../server/config/db');
const { toChunks } = require('../server/services/resumeParser');

// A fake AI whose behaviour each test can change: normal answers, errors, slow replies, bad JSON.
const realFetch = global.fetch;
let mode = 'ok';
let jobAnswer;
const calls = [];

const DEFAULT_JOB = {
  title: 'Backend Engineer',
  company: 'Acme',
  summary: 'Build APIs.',
  seniority: 'Mid',
  yearsRequired: null,
  location: 'Remote',
  workType: 'remote',
  sponsorship: 'unknown',
  sponsorshipQuote: '',
  requirements: [{ skill: 'Node.js', importance: 'required' }],
};

function fakeAi(url, options) {
  if (!String(url).includes('/chat/completions')) return realFetch(url, options);
  const body = JSON.parse(options.body);
  calls.push(body);
  if (mode === 'down') return Promise.reject(new TypeError('fetch failed'));
  if (mode === 'slow') {
    return new Promise((resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal.reason));
    });
  }
  if (mode === 'error') return Promise.resolve(new Response('internal', { status: 500 }));
  if (mode === 'garbage') return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'not json {' } }] }), { status: 200 }));
  const name = body.response_format?.json_schema?.name;
  let content;
  if (name === 'job_post') content = JSON.stringify(jobAnswer);
  else if (name === 'match') content = JSON.stringify({ items: [] });
  else if (name === 'tailor') {
    const ids = [...body.messages[1].content.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
    content = JSON.stringify({ bullets: ids.map((id) => ({ id, rewritten: 'Built APIs.', reason: 'Focus' })) });
  } else content = 'Dear Hiring Manager,\n\nI am applying.\n\nSincerely,\nTest';
  return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));
}

const RESUME = `Test Person

WORK EXPERIENCE
Software Engineer, Example Corp (2021 - Present)
• Built REST APIs in Node.js and Express for order tracking with request validation.
• Designed MySQL schemas and indexes that made the slowest report much faster.
• Built React dashboards for warehouse staff to track shipments every day.

SKILLS
JavaScript, TypeScript, Node.js, React, MySQL, Docker
`;
const POST = `Backend Engineer at Acme. ${'We build APIs for logistics companies and need someone who loves Node.js. '.repeat(5)}`;

let mongo;
let app;
let token;

async function signUp(email = 'edge@example.com') {
  const res = await request(app).post('/api/v1/auth/register').send({ name: 'Edge', email, password: 'password123' });
  return res.body.token;
}
const auth = (r) => r.set('Authorization', `Bearer ${token}`);

before(async () => {
  global.fetch = fakeAi;
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
  mode = 'ok';
  jobAnswer = structuredClone(DEFAULT_JOB);
  calls.length = 0;
  await mongoose.connection.db.dropDatabase();
  token = await signUp();
});

describe('input edge cases', () => {
  test('a request body over the size limit gets a clear 413, not a server error', async () => {
    const res = await auth(request(app).post('/api/v1/jobs')).send({ description: 'x'.repeat(3 * 1024 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/too large/i);
  });

  test('job links must be http or https (no javascript: links)', async () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com/job']) {
      const res = await auth(request(app).post('/api/v1/jobs')).send({ description: POST, url });
      expect(res.status).toBe(400);
    }
    const ok = await auth(request(app).post('/api/v1/jobs')).send({ description: POST, url: 'https://jobs.example.com/1' });
    expect(ok.status).toBe(201);
  });

  test('a job post over 20,000 characters is refused politely', async () => {
    const res = await auth(request(app).post('/api/v1/jobs')).send({ description: 'a'.repeat(20001) });
    expect(res.status).toBe(400);
  });

  test('broken JSON and wrong types are 400s', async () => {
    const bad = await auth(request(app).post('/api/v1/jobs')).set('Content-Type', 'application/json').send('{"description": ');
    expect(bad.status).toBe(400);
    const wrong = await auth(request(app).post('/api/v1/jobs')).send({ description: 12345 });
    expect(wrong.status).toBe(400);
    const status = await auth(request(app).patch(`/api/v1/jobs/${new mongoose.Types.ObjectId()}`)).send({ status: 'hired' });
    expect([400, 404]).toContain(status.status);
  });

  test('ids that are not valid are 400, unknown ids are 404', async () => {
    expect((await auth(request(app).get('/api/v1/jobs/not-an-id'))).status).toBe(400);
    expect((await auth(request(app).get(`/api/v1/jobs/${new mongoose.Types.ObjectId()}`))).status).toBe(404);
  });

  test('email is case-insensitive and duplicates are refused', async () => {
    const dup = await request(app).post('/api/v1/auth/register').send({ name: 'X', email: 'EDGE@Example.com', password: 'password123' });
    expect(dup.status).toBe(409);
    const login = await request(app).post('/api/v1/auth/login').send({ email: ' Edge@EXAMPLE.com ', password: 'password123' });
    expect(login.status).toBe(200);
  });

  test('script tags in text are stored as plain text, never run', async () => {
    const created = await auth(request(app).post('/api/v1/jobs')).send({ description: POST });
    const res = await auth(request(app).patch(`/api/v1/jobs/${created.body.job._id}`)).send({ notes: '<script>alert(1)</script>' });
    expect(res.body.job.notes).toBe('<script>alert(1)</script>');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('accounts', () => {
  test('after deleting an account, its old login token stops working everywhere', async () => {
    expect((await auth(request(app).delete('/api/v1/auth/me'))).status).toBe(204);
    expect((await auth(request(app).get('/api/v1/jobs'))).status).toBe(401);
    expect((await auth(request(app).post('/api/v1/jobs')).send({ description: POST })).status).toBe(401);
  });

  test('a tampered or expired token is rejected', async () => {
    const tampered = `${token.slice(0, -2)}xx`;
    expect((await request(app).get('/api/v1/jobs').set('Authorization', `Bearer ${tampered}`)).status).toBe(401);
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign({ sub: new mongoose.Types.ObjectId().toString() }, 'test-secret', { expiresIn: -10 });
    expect((await request(app).get('/api/v1/jobs').set('Authorization', `Bearer ${expired}`)).status).toBe(401);
  });
});

describe('resume edge cases', () => {
  test('a fake PDF (wrong content with a .pdf name) gets a friendly error', async () => {
    const res = await auth(request(app).put('/api/v1/resume')).attach('file', Buffer.from('hello, not a pdf'), { filename: 'resume.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/could not be read/i);
  });

  test('a file over 5 MB is refused', async () => {
    const res = await auth(request(app).put('/api/v1/resume')).attach('file', Buffer.alloc(6 * 1024 * 1024), { filename: 'big.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/5 MB/);
  });

  test('a pasted resume with no section headings still gets tailored bullets', async () => {
    const plain = RESUME.replace(/^(WORK EXPERIENCE|SKILLS)\n/gm, '');
    await auth(request(app).put('/api/v1/resume')).send({ text: plain }).expect(200);
    const job = await auth(request(app).post('/api/v1/jobs')).send({ description: POST });
    const res = await auth(request(app).post(`/api/v1/jobs/${job.body.job._id}/tailor`));
    expect(res.status).toBe(200);
    expect(res.body.job.tailored.length).toBeGreaterThan(0);
  });

  test('Windows line endings and odd bullet symbols are handled', () => {
    const chunks = toChunks('EXPERIENCE\r\n▪ Built a payments API with Node.js and Stripe\r\n– Cut page load time in half with caching\r\n');
    expect(chunks.map((c) => c.text)).toEqual(['Built a payments API with Node.js and Stripe', 'Cut page load time in half with caching']);
  });
});

describe('when the AI misbehaves', () => {
  test('a job post with no clear requirements still saves, and analysis returns a 0 score instead of failing', async () => {
    jobAnswer.requirements = [];
    jobAnswer.title = '';
    await auth(request(app).put('/api/v1/resume')).send({ text: RESUME }).expect(200);
    const job = await auth(request(app).post('/api/v1/jobs')).send({ description: POST });
    expect(job.status).toBe(201);
    expect(job.body.job.title).toBe('Untitled role');
    const analyzed = await auth(request(app).post(`/api/v1/jobs/${job.body.job._id}/analyze`));
    expect(analyzed.status).toBe(200);
    expect(analyzed.body.job.match.score).toBe(0);
  });

  test('an AI answer with unexpected values (bad enum, years as text) does not crash the save', async () => {
    jobAnswer.workType = 'on-site';
    jobAnswer.sponsorship = 'maybe';
    const res = await auth(request(app).post('/api/v1/jobs')).send({ description: POST });
    expect(res.status).toBe(201);
    expect(res.body.job.details.workType).toBe('unknown');
    expect(res.body.job.details.sponsorship).toBe('unknown');
  });

  test('work authorization is not scored as a skill requirement', async () => {
    jobAnswer.requirements.push({ skill: 'Authorized to work in US without sponsorship', importance: 'required' });
    const res = await auth(request(app).post('/api/v1/jobs')).send({ description: POST });
    expect(res.body.job.details.requirements.map((r) => r.skill)).toEqual(['Node.js']);
  });

  test('AI service down gives a clear 502 message', async () => {
    mode = 'down';
    const res = await auth(request(app).post('/api/v1/jobs')).send({ description: POST });
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/AI/);
  });

  test('a slow AI times out with a clear 504 message', async () => {
    mode = 'slow';
    const res = await auth(request(app).post('/api/v1/jobs')).send({ description: POST });
    expect(res.status).toBe(504);
    expect(res.body.message).toMatch(/too long/i);
  });

  test('an AI error or unreadable answer is a 502, and nothing half-saved is left behind', async () => {
    for (const m of ['error', 'garbage']) {
      mode = m;
      const res = await auth(request(app).post('/api/v1/jobs')).send({ description: POST });
      expect(res.status).toBe(502);
    }
    mode = 'ok';
    expect((await auth(request(app).get('/api/v1/jobs'))).body.jobs).toHaveLength(0);
  });

  test('without an API key the AI routes say so plainly', async () => {
    const env = require('../server/config/env');
    const key = env.llm.apiKey;
    env.llm.apiKey = '';
    try {
      const res = await auth(request(app).post('/api/v1/jobs')).send({ description: POST });
      expect(res.status).toBe(503);
    } finally {
      env.llm.apiKey = key;
    }
  });
});

describe('unknown routes', () => {
  test('unknown API routes are JSON 404s', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect([401, 404]).toContain(res.status);
    const res2 = await request(app).get('/api/nothing-here');
    expect(res2.status).toBe(404);
  });
});
