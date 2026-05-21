const express = require('express');
const multer  = require('multer');
const axios   = require('axios');
const path    = require('path');
const fs      = require('fs');
const { v4: uuid } = require('uuid');
const { pool } = require('../db');
const { ensurePodRunning, stopPod, scheduleIdleStop, getPodStatus, getPodConfig, getAvailableModels, OLLAMA_BASE, VISION_MODELS } = require('../utils/runpod');
const { detectRecordCount, splitImage } = require('../utils/imageSegment');
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

const BASE_PROMPT =
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

function buildPrompt(livro) {
  if (!livro) return BASE_PROMPT;

  const yearStart = livro.data_inicio ? new Date(livro.data_inicio).getFullYear() : null;
  const yearEnd   = livro.data_fim    ? new Date(livro.data_fim).getFullYear()    : null;
  const yearRange = yearStart || yearEnd
    ? `${yearStart ?? '?'} a ${yearEnd ?? '?'}`
    : null;

  let ctx = '\n\nCONTEXTO DO LIVRO (dados verificados — use para corrigir sua leitura):';
  ctx += `\n- Número do Livro: ${livro.numero}`;
  if (livro.cartorio)  ctx += `\n- Cartório: ${livro.cartorio}`;
  if (livro.municipio) ctx += `\n- Município: ${livro.municipio}`;
  if (livro.estado)    ctx += `\n- Estado: ${livro.estado}`;
  if (yearRange)       ctx += `\n- Período do livro: ${yearRange}`;
  if (livro.termo_inicio && livro.termo_fim)
    ctx += `\n- Termos: ${livro.termo_inicio} a ${livro.termo_fim}`;

  if (yearRange) {
    ctx += `\n\nATENÇÃO: O campo "ano" de cada registro DEVE estar entre ${yearStart ?? '?'} e ${yearEnd ?? '?'}.`;
    ctx += ` Se você encontrar um ano fora deste intervalo, você cometeu um erro de leitura — releia com mais cuidado.`;
  }
  if (livro.municipio)
    ctx += `\n"municipio" deve ser "${livro.municipio}" e "estado" deve ser "${livro.estado || '?'}" conforme o livro.`;

  return BASE_PROMPT + ctx;
}

async function getLivro(livroId) {
  if (!livroId) return null;
  try {
    const { rows } = await pool.query('SELECT * FROM livros WHERE id = $1', [livroId]);
    return rows[0] || null;
  } catch { return null; }
}

function applyBookConstraints(registros, livro) {
  if (!livro) return registros;

  const yearStart = livro.data_inicio ? new Date(livro.data_inicio).getFullYear() : null;
  const yearEnd   = livro.data_fim    ? new Date(livro.data_fim).getFullYear()    : null;

  return registros.map(reg => {
    const r = { ...reg };

    // Book is authoritative for these fields
    r.livro = livro.numero;
    if (livro.municipio) r.municipio = livro.municipio;
    if (livro.estado)    r.estado    = livro.estado;

    // Clamp registration year to book's date range
    if (r.ano != null) {
      const ano = parseInt(r.ano);
      if (!isNaN(ano)) {
        let clamped = ano;
        if (yearStart && clamped < yearStart) clamped = yearStart;
        if (yearEnd   && clamped > yearEnd)   clamped = yearEnd;
        if (clamped !== ano) {
          r.ano = clamped;
          r.confianca = 'baixa';
          r.observacoes = [r.observacoes, `Ano corrigido de ${ano} para ${clamped} (fora do período do livro)`]
            .filter(Boolean).join(' | ');
        }
      }
    }

    return r;
  });
}

const RECORD_FIELDS = [
  'nome_completo', 'nome_mae', 'nome_pai',
  'data_nascimento', 'ano', 'numero_termo',
  'municipio', 'estado', 'observacoes',
];

async function callModel(modelName, base64, prompt) {
  let raw = '';
  try {
    const resp = await axios.post(`${OLLAMA_BASE}/api/chat`, {
      model: modelName,
      stream: true,
      keep_alive: -1,
      options: { temperature: 0.05 },
      messages: [{ role: 'user', content: prompt, images: [base64] }]
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

function mergeResults(allRegistros) {
  const successful = allRegistros.filter(r => r.length > 0);
  if (!successful.length) return [];

  const countFreq = {};
  for (const r of successful) countFreq[r.length] = (countFreq[r.length] || 0) + 1;
  const consensusCount = Number(Object.entries(countFreq).sort((a, b) => b[1] - a[1])[0][0]);

  const merged = [];
  for (let i = 0; i < consensusCount; i++) {
    const rec = {};
    for (const field of RECORD_FIELDS) {
      rec[field] = majorityValue(successful.map(r => r[i]?.[field] ?? null));
    }
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

  const filePath    = req.file.path;
  const imageBuffer = fs.readFileSync(filePath);
  const livroId     = req.body.livro_id || null;
  const isImage     = /image\/(jpeg|png|webp|tiff)/.test(req.file.mimetype);

  console.log(`[process] Nova requisição — arquivo=${req.file.originalname} livro_id=${livroId} isImage=${isImage}`);

  let podError = null;
  try { await ensurePodRunning(); } catch (err) {
    podError = err.message;
    console.warn('[process] ensurePodRunning falhou:', err.message);
  }

  const livro  = await getLivro(livroId);
  const prompt = buildPrompt(livro);

  const arquivoInfo = {
    arquivo_path: filePath,
    arquivo_nome: req.file.originalname,
    arquivo_tipo: req.file.mimetype,
    arquivo_url:  `/files/${req.file.filename}`
  };

  const installed   = await getAvailableModels();
  const modelsToUse = VISION_MODELS.filter(m => {
    const base = m.split(':')[0];
    return installed.some(a => a === m || a.startsWith(base + ':'));
  });
  if (!modelsToUse.length) modelsToUse.push(VISION_MODELS[0]);
  const primaryModel = modelsToUse[0];
  console.log(`[process] Modelos disponíveis: ${modelsToUse.join(', ')}`);

  let allRegistros = [];

  // --- Detect multiple records per page (images only) ---
  const recordCount = isImage
    ? await detectRecordCount(imageBuffer, primaryModel, OLLAMA_BASE)
    : 1;

  if (recordCount <= 1) {
    // Single record or PDF: multi-model consensus on full image
    const results = await Promise.allSettled(
      modelsToUse.map(model => callModel(model, imageBuffer.toString('base64'), prompt))
    );
    const modelResults = results.map((r, i) => {
      if (r.status === 'fulfilled') { console.log(`[${modelsToUse[i]}] ${r.value.length} registro(s)`); return r.value; }
      console.warn(`[${modelsToUse[i]}] falhou:`, r.reason?.message);
      return [];
    });
    allRegistros = mergeResults(modelResults);
    podError = podError || (modelResults.every(r => r.length === 0) ? 'Todos os modelos falharam' : null);
  } else {
    // Multiple records: split image, process each segment with primary model
    console.log(`[process] Segmentando em ${recordCount} parte(s)...`);
    let segments;
    try {
      segments = await splitImage(imageBuffer, recordCount);
    } catch (e) {
      console.warn('[process] splitImage falhou, usando imagem completa:', e.message);
      segments = [imageBuffer];
    }

    for (let i = 0; i < segments.length; i++) {
      const segBase64 = segments[i].toString('base64');
      console.log(`[process] Segmento ${i + 1}/${segments.length} → ${primaryModel}`);
      try {
        const records = await callModel(primaryModel, segBase64, prompt);
        console.log(`[process] Segmento ${i + 1}: ${records.length} registro(s)`);
        allRegistros.push(...records);
      } catch (e) {
        console.warn(`[process] Segmento ${i + 1} falhou:`, e.message);
      }
    }
  }

  const registros = applyBookConstraints(allRegistros, livro);
  console.log(`[process] Resultado final: ${registros.length} registro(s)`);

  const allFailed = registros.length === 0;
  scheduleIdleStop();
  res.json({
    registros,
    ...arquivoInfo,
    ...(allFailed ? { ai_error: true, ai_error_detail: podError || 'Nenhum registro extraído' } : {}),
  });
});

// Debug endpoint — shows current config, pod state, and Ollama reachability
router.get('/debug', async (_req, res) => {
  const cfg = getPodConfig();
  let pod = null, ollamaOk = false, models = [];
  try { pod = await getPodStatus(); } catch (e) { pod = { error: e.message }; }
  try {
    const r = await require('axios').get(`${OLLAMA_BASE}/api/tags`, { timeout: 5000 });
    ollamaOk = true;
    models = (r.data?.models || []).map(m => m.name);
  } catch (e) { ollamaOk = false; }
  res.json({ config: cfg, pod, ollamaOk, models });
});

// Pod management endpoints
router.get('/pod/status', async (_req, res) => {
  try {
    const pod = await getPodStatus();
    res.json(pod ?? { desiredStatus: 'UNKNOWN' });
  } catch (e) {
    res.json({ desiredStatus: 'UNKNOWN', error: e.message });
  }
});

router.post('/pod/stop', async (_req, res) => {
  try {
    await stopPod();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/pod/start', async (_req, res) => {
  try {
    await ensurePodRunning();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
