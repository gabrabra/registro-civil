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
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${uuid()}${ext}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /image\/(jpeg|png|webp|tiff)|application\/pdf/.test(file.mimetype);
    cb(null, ok);
  }
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

const PROMPT =
  'Você é especialista em leitura de documentos de cartório brasileiro.\n\n' +
  'Analise esta imagem de registro de nascimento e extraia os dados visíveis.\n' +
  'Responda SOMENTE com JSON válido, sem texto antes ou depois:\n\n' +
  '{\n' +
  '  "nome_completo": "nome completo do registrado",\n' +
  '  "nome_mae": "nome da mãe ou null",\n' +
  '  "nome_pai": "nome do pai ou null",\n' +
  '  "data_nascimento": "data no formato YYYY-MM-DD ou null",\n' +
  '  "ano": ano como número inteiro ou null,\n' +
  '  "numero_termo": número inteiro do termo ou null,\n' +
  '  "municipio": "nome do município ou null",\n' +
  '  "estado": "sigla UF ex: PE ou null",\n' +
  '  "confianca": "alta | media | baixa",\n' +
  '  "observacoes": "dificuldades de leitura ou informações adicionais ou null"\n' +
  '}';

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  const filePath   = req.file.path;
  const fileBuffer = fs.readFileSync(filePath);
  const base64     = fileBuffer.toString('base64');

  // Garante que o pod RunPod está acordado
  try {
    await ensurePodRunning();
  } catch (err) {
    console.warn('ensurePodRunning falhou:', err.message);
  }

  let raw = '';
  try {
    const resp = await axios.post(`${OLLAMA_BASE}/api/chat`, {
      model: 'qwen2.5vl:7b',
      stream: true,
      keep_alive: -1,
      options: { temperature: 0.05 },
      messages: [{ role: 'user', content: PROMPT, images: [base64] }]
    }, { timeout: 300000, responseType: 'text' });
    raw = resp.data;
  } catch (err) {
    const d = err?.response?.data ?? '';
    if (typeof d === 'string' && d.includes('"done"')) raw = d;
    else {
      console.error('Ollama error:', err.message);
      return res.json({
        nome_completo: null, nome_mae: null, nome_pai: null,
        data_nascimento: null, ano: null, numero_termo: null,
        municipio: null, estado: null, confianca: 'baixa',
        observacoes: `Erro ao processar com IA: ${err.message}`,
        arquivo_path: filePath,
        arquivo_nome: req.file.originalname,
        arquivo_tipo: req.file.mimetype,
        arquivo_url:  `/files/${req.file.filename}`,
        ai_error: true
      });
    }
  }

  const fullContent = parseNDJSON(raw);
  console.log('Transcrição raw (200):', fullContent.substring(0, 200));

  const cleaned = fullContent.replace(/```json\n?|\n?```/g, '').trim();
  let data = {};
  try {
    const match = cleaned.match(/\{[\s\S]*\}/);
    data = match ? JSON.parse(match[0]) : {};
  } catch (_) {
    data = {};
  }

  res.json({
    nome_completo:   data.nome_completo   || null,
    nome_mae:        data.nome_mae        || null,
    nome_pai:        data.nome_pai        || null,
    data_nascimento: data.data_nascimento || null,
    ano:             data.ano             || null,
    numero_termo:    data.numero_termo    || null,
    municipio:       data.municipio       || null,
    estado:          data.estado          || null,
    confianca:       data.confianca       || 'baixa',
    observacoes:     data.observacoes     || null,
    arquivo_path:    filePath,
    arquivo_nome:    req.file.originalname,
    arquivo_tipo:    req.file.mimetype,
    arquivo_url:     `/files/${req.file.filename}`
  });
});

module.exports = router;
