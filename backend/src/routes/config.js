const express = require('express');
const axios   = require('axios');
const { pool } = require('../db');
const {
  getPodId, getOllamaBase, setPodId,
  getPodStatus, getAvailableModels,
  getPullingModels, getPullErrors, pullModel,
  getActiveModel, setActiveModel,
} = require('../utils/runpod');

// Modelos de visão conhecidos que podem ser instalados
const CATALOG_MODELS = [
  { name: 'qwen2.5vl:7b',      label: 'Qwen2.5-VL 7B',     description: 'Recomendado — melhor para documentos históricos' },
  { name: 'minicpm-v',         label: 'MiniCPM-V',          description: 'Leve e rápido, bom custo-benefício' },
  { name: 'llama3.2-vision',   label: 'Llama 3.2 Vision',   description: 'Meta, bom reconhecimento de texto em imagens' },
  { name: 'llava:7b',          label: 'LLaVA 7B',           description: 'Modelo visual clássico, amplamente testado' },
  { name: 'llava:13b',         label: 'LLaVA 13B',          description: 'Mais preciso, requer mais VRAM (≥16 GB)' },
  { name: 'bakllava',          label: 'BakLLaVA',           description: 'Baseado em Mistral, bom para OCR' },
  { name: 'moondream',         label: 'Moondream',          description: 'Ultra leve, para GPUs com pouca VRAM' },
];

const router = express.Router();

// GET /api/config  — retorna config atual
router.get('/', (_req, res) => {
  res.json({
    pod_id:       getPodId(),
    ollama_url:   getOllamaBase(),
    api_key_set:  Boolean(process.env.RUNPOD_API_KEY),
    active_model: getActiveModel(),
  });
});

// PUT /api/config  — altera pod ID e/ou modelo ativo, persiste no banco
router.put('/', async (req, res) => {
  const newId    = (req.body.pod_id      || '').trim();
  const newModel = (req.body.active_model || '').trim();

  if (!newId && !newModel) return res.status(400).json({ error: 'pod_id ou active_model é obrigatório' });

  try {
    if (newId) {
      await pool.query(
        `INSERT INTO configuracoes (chave, valor)
         VALUES ('runpod_pod_id', $1)
         ON CONFLICT (chave) DO UPDATE SET valor = $1, atualizado_em = NOW()`,
        [newId]
      );
      setPodId(newId);
    }
    if (newModel) {
      await pool.query(
        `INSERT INTO configuracoes (chave, valor)
         VALUES ('ai_model', $1)
         ON CONFLICT (chave) DO UPDATE SET valor = $1, atualizado_em = NOW()`,
        [newModel]
      );
      setActiveModel(newModel);
    }
    res.json({ ok: true, pod_id: getPodId(), ollama_url: getOllamaBase(), active_model: getActiveModel() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/config/catalog  — lista modelos disponíveis para instalação
router.get('/catalog', (_req, res) => {
  res.json({ models: CATALOG_MODELS });
});

// POST /api/config/install-model  — inicia pull de um modelo
router.post('/install-model', async (req, res) => {
  const model = (req.body.model || '').trim();
  if (!model) return res.status(400).json({ error: 'model é obrigatório' });

  if (getPullingModels().includes(model)) {
    return res.json({ ok: true, status: 'already_pulling', message: `${model} já está sendo instalado` });
  }

  try {
    pullModel(model); // dispara em background
    res.json({ ok: true, status: 'started', message: `Instalação de ${model} iniciada` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/config/validate  — verifica pod + Ollama + modelos
router.get('/validate', async (_req, res) => {
  const activeModel = getActiveModel();
  const result = {
    pod_id:           getPodId(),
    ollama_url:       getOllamaBase(),
    active_model:     activeModel,
    pod_status:       null,
    pod_error:        null,
    ollama_ok:        false,
    ollama_error:     null,
    models_required:  [activeModel],
    models_installed: [],
    models_missing:   [],
    models_pulling:   getPullingModels(),
    ok:               false,
  };

  // 1. Pod status via RunPod API
  try {
    const pod = await getPodStatus();
    result.pod_status = pod?.desiredStatus ?? 'UNKNOWN';
  } catch (e) {
    result.pod_status = 'ERROR';
    result.pod_error  = e.message;
  }

  // 2. Ollama reachability
  try {
    const r = await axios.get(`${getOllamaBase()}/api/tags`, { timeout: 8000 });
    result.ollama_ok        = true;
    result.models_installed = (r.data?.models || []).map(m => m.name);
  } catch (e) {
    result.ollama_error = e.message;
  }

  // 3. Which required models are missing
  result.models_missing = [activeModel].filter(m => {
    const base = m.split(':')[0];
    return !result.models_installed.some(a => a === m || a.startsWith(base + ':'));
  });

  result.models_pulling = getPullingModels();
  result.pull_errors    = getPullErrors();
  result.ok =
    result.pod_status === 'RUNNING' &&
    result.ollama_ok &&
    result.models_missing.length === 0;

  res.json(result);
});

module.exports = router;
