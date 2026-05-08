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
  'Analise esta imagem de livro de registro civil. Pode conter UM ou MAIS registros de nascimento na mesma página.\n\n' +
  'Responda SOMENTE com um array JSON válido, um objeto por registro encontrado:\n\n' +
  '[\n' +
  '  {\n' +
  '    "nome_completo": "nome completo do registrado",\n' +
  '    "nome_mae": "nome da mãe ou null",\n' +
  '    "nome_pai": "nome do pai ou null",\n' +
  '    "data_nascimento": "YYYY-MM-DD ou null",\n' +
  '    "ano": ano como número inteiro ou null,\n' +
  '    "numero_termo": número inteiro do termo ou null,\n' +
  '    "municipio": "nome do município ou null",\n' +
  '    "estado": "sigla UF ex: PE ou null",\n' +
  '    "confianca": "alta | media | baixa",\n' +
  '    "observacoes": "dificuldades ou informações adicionais ou null"\n' +
  '  }\n' +
  ']\n\n' +
  'Se houver apenas um registro, retorne um array com um único elemento.\n' +
  'Se não houver registros de nascimento visíveis, retorne um array vazio: []';

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  const filePath   = req.file.path;
  const fileBuffer = fs.readFileSync(filePath);
  const base64     = fileBuffer.toString('base64');

  try { await ensurePodRunning(); } catch (err) {
    console.warn('ensurePodRunning falhou:', err.message);
  }

  const arquivoInfo = {
    arquivo_path: filePath,
    arquivo_nome: req.file.originalname,
    arquivo_tipo: req.file.mimetype,
    arquivo_url:  `/files/${req.file.filename}`
  };

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
      return res.json({ registros: [], ...arquivoInfo, ai_error: true, observacoes: err.message });
    }
  }

  const fullContent = parseNDJSON(raw);
  console.log('Transcrição raw (200):', fullContent.substring(0, 300));

  const cleaned = fullContent.replace(/```json\n?|\n?```/g, '').trim();

  let registros = [];
  try {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      registros = Array.isArray(parsed) ? parsed : [parsed];
    } else {
      // fallback: maybe AI returned a single object
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      if (objMatch) registros = [JSON.parse(objMatch[0])];
    }
  } catch (_) {}

  res.json({ registros, ...arquivoInfo });
});

module.exports = router;
