const { z } = require('zod');
const Resume = require('../models/Resume');
const { HttpError } = require('../middleware/errors');
const { pdfToText, toChunks } = require('../services/resumeParser');
const { embed } = require('../services/embeddings');

const MIN_CHUNKS = 3;
const textSchema = z.object({ text: z.string().trim().min(200, 'Paste the full resume (at least a few lines).').max(30000) });

// The embedding vectors are large and only used on the server, so they're never sent to the browser.
const view = (r) => r && { fileName: r.fileName, updatedAt: r.updatedAt, chunks: r.chunks.map(({ text, section }) => ({ text, section })) };

async function get(req, res) {
  res.json({ resume: view(await Resume.findOne({ user: req.userId }).lean()) });
}

/** Accepts a PDF upload (field "file") or pasted text ({ text }). */
async function save(req, res) {
  let text;
  let fileName = 'Pasted text';
  if (req.file) {
    if (req.file.mimetype !== 'application/pdf') throw new HttpError(400, 'Please upload a PDF file.');
    try {
      text = await pdfToText(req.file.buffer);
    } catch {
      throw new HttpError(400, 'That PDF could not be read. Try another file or paste the text instead.');
    }
    fileName = req.file.originalname;
  } else {
    text = textSchema.parse(req.body ?? {}).text;
  }

  const chunks = toChunks(text);
  if (chunks.length < MIN_CHUNKS) {
    throw new HttpError(400, 'Not enough text was found. If the PDF is a scanned image, paste the resume text instead.');
  }
  const vectors = await embed(chunks.map((c) => c.text));
  chunks.forEach((c, i) => (c.embedding = vectors[i]));

  const resume = await Resume.findOneAndUpdate(
    { user: req.userId },
    { text, fileName, chunks },
    { upsert: true, returnDocument: 'after', runValidators: true },
  ).lean();
  res.json({ resume: view(resume) });
}

module.exports = { get, save };
