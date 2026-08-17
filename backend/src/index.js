const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb, pool } = require('./db');
const { auth } = require('./middleware/auth');
const { comContexto, exigePermissao } = require('./middleware/permissao');
const { loadConfigFromDb } = require('./utils/runpod');
const authRouter         = require('./routes/auth');
const livrosRouter       = require('./routes/livros');
const nascimentosRouter  = require('./routes/nascimentos');
const testamentosRouter  = require('./routes/testamentos');
const escriturasRouter   = require('./routes/escrituras');
const processRouter      = require('./routes/process');
const processLivroRouter = require('./routes/process-livro');
const configRouter       = require('./routes/config');
const usuariosRouter     = require('./routes/usuarios');
const perfisRouter       = require('./routes/perfis');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
app.use('/files', express.static(UPLOADS_DIR));

// Auth — público
app.use('/api/auth', authRouter);

// Rotas protegidas — `comContexto` carrega perfil e cota antes dos guardas
const protegida = [auth, comContexto];

app.use('/api/livros',      ...protegida, livrosRouter);
app.use('/api/nascimentos', ...protegida, nascimentosRouter);
app.use('/api/testamentos', ...protegida, testamentosRouter);
app.use('/api/escrituras',  ...protegida, escriturasRouter);
app.use('/api/usuarios',    ...protegida, usuariosRouter);
app.use('/api/perfis',      ...protegida, perfisRouter);

// Processar um documento é o mesmo que criar um registro daquele tipo, então
// o guarda usa o tipo enviado no corpo da requisição.
app.use('/api/process', ...protegida, processRouter);
app.use('/api/process', ...protegida, processLivroRouter); // /livro-capa

app.use('/api/config', ...protegida, exigePermissao('configuracoes', 'ver'), configRouter);

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
