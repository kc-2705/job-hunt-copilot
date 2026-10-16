process.env.EMBEDDINGS = 'fake';

const { describe, test } = require('node:test');
const { expect } = require('expect');
const copilot = require('../server/services/copilot');
const { toChunks } = require('../server/services/resumeParser');
const { embed } = require('../server/services/embeddings');

describe('match score', () => {
  test('weights required skills twice as much as nice-to-haves', () => {
    const items = [
      { importance: 'required', verdict: 'met' },
      { importance: 'required', verdict: 'missing' },
      { importance: 'nice', verdict: 'met' },
    ];
    // (2 + 0 + 1) / (2 + 2 + 1) = 60%
    expect(copilot.score(items)).toBe(60);
    expect(copilot.score([])).toBe(0);
  });
});

describe('hybrid retrieval', () => {
  test('finds a skill buried in a long skills line by keyword', async () => {
    const chunks = toChunks(`EXPERIENCE
• Led the migration of reporting pages to a new framework for faster loading.
• Worked with the support team to fix customer issues every week.

SKILLS
Languages: Java, Python, Go, Rust, Kotlin, Scala, PostgreSQL, MySQL, MongoDB, Redis, Cassandra, Elasticsearch
`);
    (await embed(chunks.map((c) => c.text))).forEach((v, i) => (chunks[i].embedding = v));
    const [q] = await embed(['PostgreSQL relational database']);
    const hits = copilot.retrieve(q, 'PostgreSQL relational database', chunks).map((i) => chunks[i].text);
    expect(hits.some((t) => t.includes('PostgreSQL'))).toBe(true);
  });

  test('ignores filler words when picking keywords', () => {
    expect(copilot.keywords('5+ years of experience with React and TypeScript')).toEqual(['react', 'typescript']);
  });
});

describe('tailoring safety', () => {
  test('flags numbers and tools the rewrite added', () => {
    const terms = copilot.newTerms('Built REST APIs in Node.js for orders.', 'Built REST APIs in Node.js and GraphQL for 2 million orders on AWS.');
    expect(terms).toEqual(expect.arrayContaining(['graphql', '2', 'aws']));
    expect(terms).not.toContain('rest');
  });

  test('treats job title lines with dates as headings, not achievements', () => {
    expect(copilot.isRoleLine('Software Engineer, Northwind Logistics, Chicago, IL (Mar 2023 - Present)')).toBe(true);
    expect(copilot.isRoleLine('Cut report time from 9 seconds to 1 second in 2024 using indexes on the orders table.')).toBe(false);
  });
});
