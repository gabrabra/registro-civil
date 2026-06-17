const express = require('express');
const multer  = require('multer');
const axios   = require('axios');
const path    = require('path');
const fs      = require('fs');
const { v4: uuid } = require('uuid');
const { ensurePodRunning, scheduleIdleStop, getOllamaBase, getActiveModel } = require('../utils/runpod');
const router  = express.Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => cb(null, `capa_${uuid()}${path.extname(file.originalname) || '.jpg'}`)
  }),
  limits: { fileSize: 20 * 1024 * 1024 }
});

const COVER_PROMPT =
  'Você é especialista em leitura de capas de livros de cartório brasileiro.\n\n' +
  'Analise esta imagem de capa de livro de registro civil e extraia os dados visíveis.\n' +
  'Responda SOMENTE com JSON válido, sem texto antes ou depois:\n\n' +
  '{\n' +
  '  "numero": "número ou código do livro ex: A-74",\n' +
  '  "cartorio": "nome completo do cartório",\n' +
  '  "cnpj": "CNPJ se visível ex: 29.138.710.0001-64 ou null",\n' +
  '  "cns": "CNS se visível ex: 07410-4 ou null",\n' +
  '  "termo_inicio": número inteiro do primeiro termo ou null,\n' +
  '  "termo_fim": número inteiro do último termo ou null,\n' +
  '  "data_inicio": "data YYYY-MM-DD ou null",\n' +
  '  "data_fim": "data YYYY-MM-DD ou null",\n' +
  '  "municipio": "nome do município ou null",\n' +
  '  "estado": "sigla UF ex: PE ou null"\n' +
  '}';

async function callModelForCover(modelName, base64) {
  let resp;
  try {
    resp = await axios.post(`${getOllamaBase()}/api/chat`, {
      model: modelName,
      stream: false,
      keep_alive: -1,
      options: { temperature: 0.1, num_predict: 512 },
      messages: [{ role: 'user', content: COVER_PROMPT, images: [base64] }]
    }, { timeout: 180000 });
  } catch (err) {
    throw new Error(`${modelName}: ${err.message}`);
  }

  const rawContent = resp.data?.message?.content || '';
  console.log(`[callModelForCover] ${modelName}: ${rawContent.length} chars — "${rawContent.slice(0, 150).replace(/\n/g, '\\n')}"`);

  const content = rawContent.replace(/```json\n?|\n?```/g, '').trim();
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`${modelName}: JSON não encontrado`);
  return JSON.parse(match[0]);
}

router.post('/livro-capa', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

  // Keep the file — don't delete it
  const base64      = fs.readFileSync(req.file.path).toString('base64');
  const arquivoInfo = {
    arquivo_capa_path: req.file.path,
    arquivo_capa_nome: req.file.originalname,
    arquivo_capa_url:  `/files/${req.file.filename}`,
  };

  try {
    await ensurePodRunning();
  } catch (err) {
    return res.status(503).json({ erro: 'Pod indisponível: ' + err.message });
  }

  const model = getActiveModel();
  console.log(`[process-livro] Modelo ativo: ${model}`);

  let coverData = null;
  try {
    coverData = await callModelForCover(model, base64);
    console.log(`[process-livro] ${model}: capa OK`);
  } catch (e) {
    console.warn(`[process-livro] ${model}: capa falhou:`, e.message);
  }

  scheduleIdleStop();
  res.json({ ...(coverData || {}), ...arquivoInfo });
});

module.exports = router;
