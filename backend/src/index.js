const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb, pool } = require('./db');
const { auth } = require('./middleware/auth');
const { loadConfigFromDb } = require('./utils/runpod');
const authRouter         = require('./routes/auth');
const livrosRouter       = require('./routes/livros');
const nascimentosRouter  = require('./routes/nascimentos');
const testamentosRouter  = require('./routes/testamentos');
const escriturasRouter   = require('./routes/escrituras');
const processRouter      = require('./routes/process');
const processLivroRouter = require('./routes/process-livro');
const configRouter       = require('./routes/config');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
app.use('/files', express.static(UPLOADS_DIR));

// Auth — público
app.use('/api/auth', authRouter);

// Rotas protegidas
app.use('/api/livros',               auth, livrosRouter);
app.use('/api/nascimentos',          auth, nascimentosRouter);
app.use('/api/testamentos',          auth, testamentosRouter);
app.use('/api/escrituras',           auth, escriturasRouter);
app.use('/api/process',              auth, processRouter);
app.use('/api/process',      auth, processLivroRouter); // /livro-capa
app.use('/api/config',       auth, configRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;

async function start() {
  let retries = 10;
  while (retries > 0) {
    try {
      await initDb();
      console.log('Database ready');
      await loadConfigFromDb(pool);
      break;
    } catch (e) {
      retries--;
      console.log(`DB not ready, retrying (${retries} left)...`, e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`Backend on :${PORT}`));
}

start().catch(err => { console.error(err); process.exit(1); });
