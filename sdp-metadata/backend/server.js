require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { initDb } = require('./config/db');
const { startCronJobs } = require('./jobs/cron');
const { authenticate } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const connectionRoutes = require('./routes/connections');
const profilingRoutes = require('./routes/profiling');
const lineageRoutes = require('./routes/lineage');
const qualityRoutes = require('./routes/quality');
const schemaRoutes = require('./routes/schema');
const metadataRoutes = require('./routes/metadata');
const auditRoutes = require('./routes/audit');
const exploreRoutes = require('./routes/explore');
const validationRoutes = require('./routes/validation');
const homeRoutes = require('./routes/home');
const catalogRoutes = require('./routes/catalog');


process.on('uncaughtException', err => console.error('[CRITICAL]', err.message));
process.on('unhandledRejection', reason => console.error('[REJECTION]', reason));

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use('/api/catalog', authenticate, catalogRoutes);

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

app.use((req, res, next) => {
  res.on('finish', () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
    }));
  });
  next();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/connections', authenticate, connectionRoutes);
app.use('/api/profiling', authenticate, profilingRoutes);
app.use('/api/lineage', authenticate, lineageRoutes);
app.use('/api/quality', authenticate, qualityRoutes);
app.use('/api/schema', authenticate, schemaRoutes);
app.use('/api/metadata', authenticate, metadataRoutes);
app.use('/api/audit', authenticate, auditRoutes);
app.use('/api/explore', authenticate, exploreRoutes);
app.use('/api/validation', authenticate, validationRoutes);
app.use('/api/home', authenticate, homeRoutes);


const PORT = process.env.PORT || 5001;

app.listen(PORT, async () => {
  await initDb();
  startCronJobs();
  console.log(`🚀 SDP Metadata Platform running on http://localhost:${PORT}`);
});