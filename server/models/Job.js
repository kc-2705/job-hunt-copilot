const mongoose = require('mongoose');

const STATUSES = ['saved', 'applied', 'interview', 'offer', 'rejected'];

const requirementSchema = new mongoose.Schema(
  {
    skill: { type: String, required: true },
    importance: { type: String, enum: ['required', 'nice'], default: 'required' },
  },
  { _id: false },
);

const matchItemSchema = new mongoose.Schema(
  {
    skill: String,
    importance: { type: String, enum: ['required', 'nice'] },
    verdict: { type: String, enum: ['met', 'partial', 'missing'] },
    explanation: String,
    // Indexes into the resume's chunks, so the UI can show the exact bullet used as proof.
    evidence: [Number],
  },
  { _id: false },
);

const tailoredSchema = new mongoose.Schema(
  {
    chunk: Number,
    original: String,
    rewritten: String,
    reason: String,
    // Words in the rewrite (numbers, tools) that were not in the original bullet; shown as "please check".
    newTerms: [String],
  },
  { _id: false },
);

const jobSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: '', trim: true, maxlength: 120 },
    company: { type: String, default: '', trim: true, maxlength: 120 },
    url: { type: String, default: '', trim: true, maxlength: 500 },
    description: { type: String, required: true, maxlength: 20000 },
    status: { type: String, enum: STATUSES, default: 'saved', index: true },
    notes: { type: String, default: '', maxlength: 2000 },
    appliedAt: Date,

    // Filled in by the AI when the job is added.
    details: {
      summary: String,
      seniority: String,
      yearsRequired: Number,
      location: String,
      workType: { type: String, enum: ['remote', 'hybrid', 'onsite', 'unknown'], default: 'unknown' },
      sponsorship: { type: String, enum: ['yes', 'no', 'unknown'], default: 'unknown' },
      sponsorshipQuote: String,
      requirements: [requirementSchema],
    },

    match: {
      score: Number,
      items: [matchItemSchema],
      strengths: [String],
      gaps: [String],
      analyzedAt: Date,
    },

    tailored: [tailoredSchema],
    coverLetter: { type: String, default: '' },
  },
  { timestamps: true },
);

jobSchema.index({ user: 1, updatedAt: -1 });

module.exports = mongoose.model('Job', jobSchema);
module.exports.STATUSES = STATUSES;
