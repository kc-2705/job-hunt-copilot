const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const { requireAuth } = require('./middleware/auth');
const auth = require('./controllers/authController');
const resume = require('./controllers/resumeController');
const jobs = require('./controllers/jobController');
const llm = require('./services/llm');

const router = express.Router();

// Resumes are read in memory (never written to disk) and capped at 5 MB.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

const limiter = (limit, message) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.isTest ? 1000 : limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.userId ?? rateLimit.ipKeyGenerator(req.ip),
    message: { message },
  });

// Slows down password guessing.
const authLimiter = limiter(30, 'Too many attempts. Please wait a few minutes and try again.');
// AI calls share a free daily quota, so each user gets a fair share.
const aiLimiter = limiter(60, 'You have used the AI a lot in a short time. Please wait a few minutes.');

router.get('/health', (req, res) => res.json({ ok: true }));

router.post('/auth/register', authLimiter, auth.register);
router.post('/auth/login', authLimiter, auth.login);

// Everything below needs a signed-in user.
router.use(requireAuth);

router.get('/auth/me', auth.me);
router.delete('/auth/me', auth.deleteAccount);
router.get('/ai/status', (req, res) => res.json(llm.status()));

router.get('/resume', resume.get);
router.put('/resume', upload.single('file'), resume.save);

router.get('/jobs', jobs.list);
router.get('/jobs/stats', jobs.stats);
router.post('/jobs', aiLimiter, jobs.create);
router.get('/jobs/:id', jobs.get);
router.patch('/jobs/:id', jobs.update);
router.delete('/jobs/:id', jobs.remove);
router.post('/jobs/:id/analyze', aiLimiter, jobs.analyze);
router.post('/jobs/:id/tailor', aiLimiter, jobs.tailor);
router.post('/jobs/:id/cover-letter', aiLimiter, jobs.coverLetter);

module.exports = router;
