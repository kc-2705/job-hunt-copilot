const mongoose = require('mongoose');

// One searchable piece of the resume: a bullet point or a short paragraph, with its embedding.
const chunkSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    section: { type: String, default: '' },
    embedding: { type: [Number], default: [] },
  },
  { _id: false },
);

const resumeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fileName: { type: String, default: '' },
    text: { type: String, required: true },
    chunks: { type: [chunkSchema], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Resume', resumeSchema);
