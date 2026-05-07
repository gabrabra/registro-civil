const express = require('express');
const multer  = require('multer');
const axios   = require('axios');
const path    = require('path');
const fs      = require('fs');
const { v4: uuid } = require('uuid');
const { ensurePodRunning, OLLAMA_BASE } = require('../utils/runpod');
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

// POST /api/process/livro-capa — lê capa de livro com Qwen2.5-VL
router.post('/livro-capa', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

  const imageBuffer = fs.readFileSync(req.file.path);
  const base64Image = imageBuffer.toString('base64');
  try { fs.unlinkSync(req.file.path); } catch (_) {}

  try {
    await ensurePodRunning();
  } catch (err) {
    return res.status(503).json({ erro: 'Pod indisponível: ' + err.message });
  }

  const prompt =
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

  let raw = '';
  try {
    const resp = await axios.post(`${OLLAMA_BASE}/api/chat`, {
      model: 'qwen2.5vl:7b',
      stream: true,
      keep_alive: -1,
      options: { temperature: 0.05 },
      messages: [{ role: 'user', content: prompt, images: [base64Image] }]
    }, { timeout: 180000, responseType: 'text' });
    raw = resp.data;
  } catch (err) {
    const d = err?.response?.data ?? '';
    if (typeof d === 'string' && d.includes('"done"')) raw = d;
    else return res.status(500).json({ erro: 'Ollama falhou: ' + err.message });
  }

  const fullContent = parseNDJSON(raw);
  console.log('Livro capa raw (200):', fullContent.substring(0, 200));

  const cleaned = fullContent.replace(/```json\n?|\n?```/g, '').trim();
  let result = {};
  try {
    const match = cleaned.match(/\{[\s\S]*\}/);
    result = match ? JSON.parse(match[0]) : { erro: 'JSON não encontrado', raw: fullContent };
  } catch (e) {
    result = { erro: e.message, raw: fullContent };
  }

  res.json(result);
});

module.exports = router;
