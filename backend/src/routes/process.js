const express = require('express');
const multer  = require('multer');
const axios   = require('axios');
const path    = require('path');
const fs      = require('fs');
const { v4: uuid } = require('uuid');
const { pool } = require('../db');
const { ensurePodRunning, stopPod, scheduleIdleStop, getPodStatus, getPodConfig, getOllamaBase, getActiveModel } = require('../utils/runpod');
const { detectRecordCount } = require('../utils/imageSegment');
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

function buildPrompt(livro, recordCountHint) {
  if (!livro && !recordCountHint) return BASE_PROMPT;

  const yearStart = livro.data_inicio ? new Date(livro.data_inicio).getFullYear() : null;
  const yearEnd   = livro.data_fim    ? new Date(livro.data_fim).getFullYear()    : null;
  const yearRange = yearStart || yearEnd
    ? `${yearStart ?? '?'} a ${yearEnd ?? '?'}`
    : null;

  let ctx = livro ? '\n\nCONTEXTO DO LIVRO (dados verificados — use para corrigir sua leitura):' : '';
  if (livro) {
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
  }

  if (recordCountHint && recordCountHint > 1) {
    ctx += `\n\nIMPORTANTE: Esta imagem contém EXATAMENTE ${recordCountHint} registros de nascimento.`;
    ctx += ` Você DEVE retornar um array com EXATAMENTE ${recordCountHint} objetos — um por registro. Não retorne array vazio.`;
  }

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

async function callModel(modelName, base64, prompt) {
  let raw = '';
  try {
    const resp = await axios.post(`${getOllamaBase()}/api/chat`, {
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

  const livro = await getLivro(livroId);
  const model = getActiveModel();

  const arquivoInfo = {
    arquivo_path: filePath,
    arquivo_nome: req.file.originalname,
    arquivo_tipo: req.file.mimetype,
    arquivo_url:  `/files/${req.file.filename}`
  };

  console.log(`[process] Modelo ativo: ${model}`);

  let allRegistros = [];

  // Detect number of records in page (images only)
  const recordCount = isImage
    ? await detectRecordCount(imageBuffer, model, getOllamaBase())
    : 1;

  // Always process the FULL image — splitting causes partial records that fool the model
  const prompt = buildPrompt(livro, recordCount > 1 ? recordCount : null);
  console.log(`[process] Processando imagem completa (${recordCount} registro(s) detectados) → ${model}`);

  try {
    const records = await callModel(model, imageBuffer.toString('base64'), prompt);
    console.log(`[process] ${model}: ${records.length} registro(s)`);
    allRegistros = records;
  } catch (e) {
    console.warn(`[process] ${model} falhou:`, e.message);
    podError = podError || e.message;
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
    const r = await require('axios').get(`${getOllamaBase()}/api/tags`, { timeout: 5000 });
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
