const express = require('express');
const multer  = require('multer');
const axios   = require('axios');
const path    = require('path');
const fs      = require('fs');
const { v4: uuid } = require('uuid');
const { ensurePodRunning, OLLAMA_BASE, VISION_MODELS } = require('../utils/runpod');
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

function parseNDJSON(raw) {
  let text = '';
  if (typeof raw === 'string') {
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try { text += JSON.parse(line)?.message?.content ?? ''; } catch (_) {}
    }
  } else if (raw?.message?.content) {
    text = raw.message.content;
  }
  return text;
}

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

const COVER_FIELDS = [
  'numero', 'cartorio', 'cnpj', 'cns',
  'termo_inicio', 'termo_fim',
  'data_inicio', 'data_fim',
  'municipio', 'estado',
];

async function callModelForCover(modelName, base64) {
  let raw = '';
  try {
    const resp = await axios.post(`${OLLAMA_BASE}/api/chat`, {
      model: modelName,
      stream: true,
      keep_alive: -1,
      options: { temperature: 0.05 },
      messages: [{ role: 'user', content: COVER_PROMPT, images: [base64] }]
    }, { timeout: 180000, responseType: 'text' });
    raw = resp.data;
  } catch (err) {
    const d = err?.response?.data ?? '';
    if (typeof d === 'string' && d.includes('"done"')) raw = d;
    else throw new Error(`${modelName}: ${err.message}`);
  }

  const content = parseNDJSON(raw).replace(/```json\n?|\n?```/g, '').trim();
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`${modelName}: JSON não encontrado`);
  return JSON.parse(match[0]);
}

function majorityValue(values) {
  const valid = values.filter(v => v != null && String(v).trim() !== '' && String(v).toLowerCase() !== 'null');
  if (!valid.length) return null;
  const freq = {};
  for (const v of valid) {
    const k = String(v).toLowerCase().trim();
    if (!freq[k]) freq[k] = { count: 0, value: v };
    freq[k].count++;
  }
  return Object.values(freq).sort((a, b) => b.count - a.count)[0].value;
}

function mergeCoverResults(objs) {
  const valid = objs.filter(o => o && !o.erro);
  if (!valid.length) return objs[0] || { erro: 'Todos os modelos falharam' };
  const result = {};
  for (const field of COVER_FIELDS) {
    result[field] = majorityValue(valid.map(o => o[field] ?? null));
  }
  return result;
}

router.post('/livro-capa', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

  const base64 = fs.readFileSync(req.file.path).toString('base64');
  try { fs.unlinkSync(req.file.path); } catch (_) {}

  try {
    await ensurePodRunning();
  } catch (err) {
    return res.status(503).json({ erro: 'Pod indisponível: ' + err.message });
  }

  const results = await Promise.allSettled(
    VISION_MODELS.map(model => callModelForCover(model, base64))
  );

  const objs = results.map((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`[${VISION_MODELS[i]}] capa OK`);
      return r.value;
    }
    console.warn(`[${VISION_MODELS[i]}] capa falhou:`, r.reason?.message);
    return null;
  }).filter(Boolean);

  res.json(mergeCoverResults(objs));
});

module.exports = router;
