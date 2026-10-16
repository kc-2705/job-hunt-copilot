const mongoose = require('mongoose');
const { z } = require('zod');
const Job = require('../models/Job');
const Resume = require('../models/Resume');
const User = require('../models/User');
const { HttpError } = require('../middleware/errors');
const copilot = require('../services/copilot');

const link = z.union([z.url('Enter a valid link.'), z.literal('')]);

const createSchema = z.object({
  description: z.string().trim().min(200, 'Paste the full job post (at least a paragraph).').max(20000),
  url: link.optional().default(''),
});

const updateSchema = z.object({
  title: z.string().trim().max(120).optional(),
  company: z.string().trim().max(120).optional(),
  url: link.optional(),
  status: z.enum(Job.STATUSES).optional(),
  notes: z.string().max(2000).optional(),
  coverLetter: z.string().max(6000).optional(),
});

// The list view doesn't need the full post or the AI output.
const LIST_FIELDS = 'title company url status appliedAt updatedAt createdAt details.sponsorship details.workType details.location match.score';

async function findJob(req) {
  const job = await Job.findOne({ _id: req.params.id, user: req.userId });
  if (!job) throw new HttpError(404, 'Job not found.');
  return job;
}

async function requireResume(userId) {
  const resume = await Resume.findOne({ user: userId }).lean();
  if (!resume) throw new HttpError(400, 'Add your resume first.');
  return resume;
}

async function list(req, res) {
  const jobs = await Job.find({ user: req.userId }).select(LIST_FIELDS).sort({ updatedAt: -1 }).lean();
  res.json({ jobs });
}

async function get(req, res) {
  res.json({ job: await findJob(req) });
}

/** Saves a job post and has the AI read it (title, company, requirements, visa sponsorship). */
async function create(req, res) {
  const { description, url } = createSchema.parse(req.body);
  const { title, company, yearsRequired, ...details } = await copilot.readJobPost(description);
  const job = await Job.create({
    user: req.userId,
    title: title || 'Untitled role',
    company,
    url,
    description,
    details: { ...details, yearsRequired: yearsRequired ?? undefined },
  });
  res.status(201).json({ job });
}

async function update(req, res) {
  const data = updateSchema.parse(req.body);
  const job = await findJob(req);
  if (data.status === 'applied' && !job.appliedAt) job.appliedAt = new Date();
  Object.assign(job, data);
  await job.save();
  res.json({ job });
}

async function remove(req, res) {
  const result = await Job.deleteOne({ _id: req.params.id, user: req.userId });
  if (!result.deletedCount) throw new HttpError(404, 'Job not found.');
  res.status(204).end();
}

async function analyze(req, res) {
  const job = await findJob(req);
  const resume = await requireResume(req.userId);
  // Plain objects, not Mongoose subdocuments (spreading a subdocument loses its fields).
  const requirements = job.details.requirements.map(({ skill, importance }) => ({ skill, importance }));
  job.match = { ...(await copilot.matchResume(requirements, resume.chunks)), analyzedAt: new Date() };
  await job.save();
  res.json({ job });
}

async function tailor(req, res) {
  const job = await findJob(req);
  const resume = await requireResume(req.userId);
  job.tailored = await copilot.tailorBullets(job, resume.chunks);
  await job.save();
  res.json({ job });
}

async function coverLetter(req, res) {
  const job = await findJob(req);
  const resume = await requireResume(req.userId);
  const user = await User.findById(req.userId).lean();
  job.coverLetter = await copilot.coverLetter(job, resume.chunks, user.name);
  await job.save();
  res.json({ job });
}

/** Counts per status and the average match score, for the board header. */
async function stats(req, res) {
  const user = new mongoose.Types.ObjectId(req.userId);
  const [rows, [avg]] = await Promise.all([
    Job.aggregate([{ $match: { user } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    // $avg skips jobs that haven't been analyzed yet.
    Job.aggregate([{ $match: { user } }, { $group: { _id: null, score: { $avg: '$match.score' } } }]),
  ]);
  const byStatus = Object.fromEntries(Job.STATUSES.map((s) => [s, rows.find((r) => r._id === s)?.count ?? 0]));
  res.json({
    byStatus,
    total: rows.reduce((s, r) => s + r.count, 0),
    avgScore: avg?.score == null ? null : Math.round(avg.score),
  });
}

module.exports = { list, get, create, update, remove, analyze, tailor, coverLetter, stats };
