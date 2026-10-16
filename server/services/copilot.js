const llm = require('./llm');
const { embed, topK } = require('./embeddings');

// The job-search features. The pattern throughout: retrieve the relevant resume
// bullets with embeddings (RAG), let the model judge or write using only those,
// and do every calculation (scores, checks) in code.

const EVIDENCE_PER_SKILL = 3;
const TAILOR_COUNT = 6;

// ---- 1. Read a job post ----------------------------------------------------

const jobSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    company: { type: 'string' },
    summary: { type: 'string' },
    seniority: { type: 'string' },
    yearsRequired: { type: ['number', 'null'] },
    location: { type: 'string' },
    workType: { type: 'string', enum: ['remote', 'hybrid', 'onsite', 'unknown'] },
    sponsorship: { type: 'string', enum: ['yes', 'no', 'unknown'] },
    sponsorshipQuote: { type: 'string' },
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { skill: { type: 'string' }, importance: { type: 'string', enum: ['required', 'nice'] } },
        required: ['skill', 'importance'],
      },
    },
  },
  required: ['title', 'company', 'summary', 'seniority', 'yearsRequired', 'location', 'workType', 'sponsorship', 'sponsorshipQuote', 'requirements'],
};

async function readJobPost(description) {
  const out = await llm.json({
    name: 'job_post',
    schema: jobSchema,
    system:
      'You read job posts for a job seeker. Extract the facts exactly as written. ' +
      'title: the role name only, without the company or location (e.g. "Senior Full Stack Engineer"). ' +
      'requirements: 6 to 14 concrete skills or qualifications (technologies, practices, domain knowledge, degrees), ' +
      'each short (2 to 6 words). If a minimum number of years is stated, include it as a requirement such as ' +
      '"5+ years of software development". Mark "required" for must-haves and "nice" for preferred or bonus items. ' +
      'sponsorship: "no" if the post says it will not sponsor visas or requires citizenship / existing work authorization ' +
      'without sponsorship; "yes" if it offers sponsorship; otherwise "unknown". sponsorshipQuote: the exact sentence, or "". ' +
      'yearsRequired: the minimum years of experience as a number, or null. Use "" for anything not stated.',
    user: description.slice(0, 12000),
  });
  // De-duplicate skills the model listed twice.
  const seen = new Set();
  out.requirements = out.requirements.filter((r) => {
    const key = r.skill.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return out;
}

// ---- 2. Match the resume against the job (RAG) -----------------------------

const matchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'integer' },
          verdict: { type: 'string', enum: ['met', 'partial', 'missing'] },
          explanation: { type: 'string' },
          evidence: { type: 'array', items: { type: 'integer' } },
        },
        required: ['id', 'verdict', 'explanation', 'evidence'],
      },
    },
  },
  required: ['items'],
};

const WEIGHT = { required: 2, nice: 1 };
const CREDIT = { met: 1, partial: 0.5, missing: 0 };

/** 0–100, weighting must-haves twice as much as nice-to-haves. Calculated in code, not by the model. */
function score(items) {
  const total = items.reduce((s, i) => s + WEIGHT[i.importance], 0);
  if (!total) return 0;
  const earned = items.reduce((s, i) => s + WEIGHT[i.importance] * CREDIT[i.verdict], 0);
  return Math.round((earned / total) * 100);
}

const STOP_WORDS = new Set(
  'and or the a an of with in on for to experience experienced years year strong knowledge familiarity working using skills ability plus based other'.split(' '),
);

/** Distinctive words of a requirement ("PostgreSQL relational database" -> postgresql, relational, database). */
function keywords(skill) {
  return (skill.toLowerCase().match(/[a-z0-9+#./]+/g) ?? []).filter((w) => w.length > 1 && !STOP_WORDS.has(w) && !/^\d+\+?$/.test(w));
}

/**
 * Hybrid retrieval: the bullets closest in meaning (embeddings) plus any bullet that names the
 * skill outright (keywords). Meaning search alone can miss a long skills line like
 * "MySQL, PostgreSQL, MongoDB, Redis", where one word is buried among many.
 */
function retrieve(query, skill, chunks) {
  const semantic = topK(query, chunks, EVIDENCE_PER_SKILL).map((m) => m.i);
  const words = keywords(skill);
  const exact = chunks
    .map((c, i) => ({ i, hits: words.filter((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.+#/]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(c.text)).length }))
    .filter((m) => m.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 2)
    .map((m) => m.i);
  return [...new Set([...semantic, ...exact])];
}

async function matchResume(requirements, chunks) {
  if (!requirements.length) return { score: 0, items: [], strengths: [], gaps: [] };

  // Retrieve the most relevant resume bullets for each requirement.
  const queries = await embed(requirements.map((r) => r.skill));
  const candidates = requirements.map((r, id) => ({
    id,
    ...r,
    bullets: retrieve(queries[id], r.skill, chunks),
  }));

  // Only the retrieved bullets are sent, which keeps each request small (free tier: 8,000 tokens a minute).
  const used = [...new Set(candidates.flatMap((c) => c.bullets))].sort((a, b) => a - b);
  const bulletList = used.map((i) => `[${i}] ${chunks[i].text}`).join('\n');
  const reqList = candidates.map((c) => `${c.id}. ${c.skill} (${c.importance}); candidate bullets: ${c.bullets.join(', ')}`).join('\n');

  const out = await llm.json({
    name: 'match',
    smart: true,
    effort: 'medium',
    schema: matchSchema,
    system:
      'You are a careful recruiter checking a resume against job requirements. For each requirement, decide using ONLY the ' +
      'resume bullets provided: "met" if a bullet clearly shows it, "partial" if it shows something closely related or ' +
      'only part of it, "missing" if none of them show it. Do not assume skills that are not written. ' +
      'Industry experience (payments, healthcare, education...) counts only when a bullet shows work in that industry, ' +
      'not a passing mention. Years of experience count only when a bullet states them. ' +
      'evidence: the bullet numbers that support your verdict (empty when missing). explanation: one short sentence about the ' +
      'experience, written to the candidate as "you"; never mention bullet numbers.',
    user: `Requirements:\n${reqList}\n\nResume bullets:\n${bulletList}`,
  });

  const byId = new Map(out.items.map((i) => [i.id, i]));
  const items = candidates.map((c) => {
    const a = byId.get(c.id);
    const verdict = a?.verdict ?? 'missing';
    // Keep only evidence that points at real bullets we actually sent.
    const evidence = verdict === 'missing' ? [] : (a?.evidence ?? []).filter((i) => used.includes(i));
    return {
      skill: c.skill,
      importance: c.importance,
      verdict: verdict !== 'missing' && evidence.length === 0 ? 'partial' : verdict,
      explanation: a?.explanation ? a.explanation.charAt(0).toUpperCase() + a.explanation.slice(1) : 'Not assessed.',
      evidence,
    };
  });

  return {
    score: score(items),
    items,
    strengths: items.filter((i) => i.verdict === 'met').map((i) => i.skill),
    gaps: items.filter((i) => i.verdict === 'missing' && i.importance === 'required').map((i) => i.skill),
  };
}

// ---- 3. Tailor resume bullets ----------------------------------------------

const tailorSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    bullets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'integer' }, rewritten: { type: 'string' }, reason: { type: 'string' } },
        required: ['id', 'rewritten', 'reason'],
      },
    },
  },
  required: ['bullets'],
};

// "Software Engineer, Northwind Logistics, Chicago (Mar 2023 - Present)": a role heading, not an achievement.
const DATE_RANGE = /\b(19|20)\d{2}\b.*(\b(19|20)\d{2}\b|present|current|now)/i;
function isRoleLine(text) {
  return text.length < 140 && DATE_RANGE.test(text);
}

// Numbers, acronyms and capitalized tool names: the kinds of words a rewrite must not invent.
function keyTerms(text) {
  const terms = new Set();
  const words = text.match(/[A-Za-z0-9][A-Za-z0-9+#./%-]*/g) ?? [];
  words.forEach((raw, i) => {
    const w = raw.replace(/[.,]+$/, '');
    const isNumber = /^\d/.test(w);
    // Capitalized words after the first one are usually names of tools, companies or products.
    const isName = i > 0 && /^[A-Z]/.test(w);
    if (isNumber || isName) terms.add(w.toLowerCase());
  });
  return terms;
}

/** Terms in the rewrite that were not in the original bullet, so the user can double-check them. */
function newTerms(original, rewritten) {
  const before = keyTerms(original);
  return [...keyTerms(rewritten)].filter((t) => !before.has(t));
}

async function tailorBullets(job, chunks) {
  // Pick the experience bullets most related to what this job asks for.
  const wanted = job.details.requirements.map((r) => r.skill).join(', ');
  const [query] = await embed([`${job.title}. ${wanted}`]);
  const experience = chunks
    .map((c, i) => ({ ...c, i }))
    // Only real experience/project bullets: not the header, summary, skills list, education or job title lines.
    .filter((c) => c.section && !/summary|profile|objective|skill|education|certif/i.test(c.section) && c.text.length > 60 && !isRoleLine(c.text));
  const picked = topK(query, experience, TAILOR_COUNT).map((m) => experience[m.i]);

  const out = await llm.json({
    name: 'tailor',
    smart: true,
    schema: tailorSchema,
    system:
      'You improve resume bullets for a specific job. Rewrite each bullet so it leads with what matters most for this job ' +
      'and uses the job post\'s wording where it truthfully applies. Strict rules: keep every fact true to the original; ' +
      'never add tools, numbers, metrics, team sizes or results that are not in the original bullet; keep it to one ' +
      'sentence under 35 words; start with a strong past-tense verb. reason: what changed, in 3 to 6 words.',
    user:
      `Job: ${job.title} at ${job.company}\nKey requirements: ${wanted}\n\n` +
      `Bullets:\n${picked.map((c) => `${c.i}. ${c.text}`).join('\n')}`,
  });

  const byId = new Map(out.bullets.map((b) => [b.id, b]));
  return picked
    .filter((c) => byId.has(c.i))
    .map((c) => {
      const b = byId.get(c.i);
      return { chunk: c.i, original: c.text, rewritten: b.rewritten.trim(), reason: b.reason, newTerms: newTerms(c.text, b.rewritten) };
    });
}

// ---- 4. Cover letter ---------------------------------------------------------

async function coverLetter(job, chunks, applicantName) {
  const strengths = (job.match?.items ?? []).filter((i) => i.verdict === 'met');
  const evidence = [...new Set(strengths.flatMap((i) => i.evidence))].slice(0, 6).map((i) => `- ${chunks[i]?.text}`).filter(Boolean);
  const facts = evidence.length ? evidence.join('\n') : chunks.slice(0, 6).map((c) => `- ${c.text}`).join('\n');

  return llm.text({
    system:
      'Write a short cover letter (3 short paragraphs, under 230 words) in plain, professional, simple English. ' +
      'No storytelling, no clichés like "I am thrilled", no exaggeration. Use only the facts provided about the applicant; ' +
      'do not invent employers, numbers or skills, and never make a claim stronger than the fact (if a fact says "supported", ' +
      'do not write "led" or "maintained"). Do not claim to meet every requirement. Paragraph 1: the role and one-line fit. Paragraph 2: two or three ' +
      'relevant experiences from the facts. Paragraph 3: a brief, polite close. Start with "Dear Hiring Manager," and ' +
      `end with "Sincerely,\\n${applicantName}". Output only the letter.`,
    user: `Role: ${job.title}\nCompany: ${job.company}\nAbout the job: ${job.details.summary}\n\nApplicant facts:\n${facts}`,
  });
}

module.exports = { readJobPost, matchResume, tailorBullets, coverLetter, score, newTerms, keywords, retrieve, isRoleLine };
