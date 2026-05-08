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

const RECORD_FIELDS = [
  'nome_completo', 'nome_mae', 'nome_pai',
  'data_nascimento', 'ano', 'numero_termo',
  'municipio', 'estado', 'observacoes',
];

// Call a single model and parse its registros[] response
async function callModel(modelName, base64) {
  let raw = '';
  try {
    const resp = await axios.post(`${OLLAMA_BASE}/api/chat`, {
      model: modelName,
      stream: true,
      keep_alive: -1,
      options: { temperature: 0.05 },
      messages: [{ role: 'user', content: PROMPT, images: [base64] }]
    }, { timeout: 300000, responseType: 'text' });
    raw = resp.data;
  } catch (err) {
    const d = err?.response?.data ?? '';
    if (typeof d === 'string' && d.includes('"done"')) raw = d;
    else throw new Error(`${modelName}: ${err.message}`);
  }

  const content = parseNDJSON(raw).replace(/```json\n?|\n?```/g, '').trim();
  try {
    const arrMatch = content.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      const parsed = JSON.parse(arrMatch[0]);
      return Array.isArray(parsed) ? parsed : [parsed];
    }
    const objMatch = content.match(/\{[\s\S]*\}/);
    if (objMatch) return [JSON.parse(objMatch[0])];
  } catch (_) {}
  return [];
}

// Pick the most frequent non-null value from a list
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

// Merge registros[] arrays from multiple models using majority vote per field
function mergeResults(allRegistros) {
  const successful = allRegistros.filter(r => r.length > 0);
  if (!successful.length) return [];

  // Majority vote on number of records in the image
  const countFreq = {};
  for (const r of successful) countFreq[r.length] = (countFreq[r.length] || 0) + 1;
  const consensusCount = Number(Object.entries(countFreq).sort((a, b) => b[1] - a[1])[0][0]);

  const merged = [];
  for (let i = 0; i < consensusCount; i++) {
    const rec = {};
    for (const field of RECORD_FIELDS) {
      rec[field] = majorityValue(successful.map(r => r[i]?.[field] ?? null));
    }

    // Confidence: fraction of fields where all models agreed
    const populated = RECORD_FIELDS.filter(f => rec[f] != null);
    const agreed = populated.filter(f => {
      const vals = successful.map(r => String(r[i]?.[f] ?? '').toLowerCase().trim()).filter(v => v && v !== 'null');
      return new Set(vals).size <= 1;
    });
    const ratio = populated.length ? agreed.length / populated.length : 0;
    rec.confianca = ratio >= 0.8 ? 'alta' : ratio >= 0.5 ? 'media' : 'baixa';

    merged.push(rec);
  }
  return merged;
}

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

  // Call all models in parallel; collect results from whichever succeed
  const results = await Promise.allSettled(
    VISION_MODELS.map(model => callModel(model, base64))
  );

  const modelResults = results.map((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`[${VISION_MODELS[i]}] ${r.value.length} registro(s)`);
      return r.value;
    }
    console.warn(`[${VISION_MODELS[i]}] falhou:`, r.reason?.message);
    return [];
  });

  const registros = mergeResults(modelResults);

  console.log(`Resultado final: ${registros.length} registro(s) (modelos OK: ${modelResults.filter(r => r.length > 0).length}/${VISION_MODELS.length})`);

  const allFailed = modelResults.every(r => r.length === 0);
  res.json({ registros, ...arquivoInfo, ...(allFailed ? { ai_error: true } : {}) });
});

module.exports = router;
