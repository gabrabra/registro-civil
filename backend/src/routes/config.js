const express = require('express');
const axios   = require('axios');
const { pool } = require('../db');
const {
  getPodId, getOllamaBase, setPodId,
  getPodStatus, getAvailableModels,
  VISION_MODELS,
} = require('../utils/runpod');

const router = express.Router();

// GET /api/config  — retorna config atual
router.get('/', (_req, res) => {
  res.json({
    pod_id:      getPodId(),
    ollama_url:  getOllamaBase(),
    api_key_set: Boolean(process.env.RUNPOD_API_KEY),
  });
});

// PUT /api/config  — altera pod ID, persiste no banco
router.put('/', async (req, res) => {
  const newId = (req.body.pod_id || '').trim();
  if (!newId) return res.status(400).json({ error: 'pod_id é obrigatório' });

  try {
    await pool.query(
      `INSERT INTO configuracoes (chave, valor)
       VALUES ('runpod_pod_id', $1)
       ON CONFLICT (chave) DO UPDATE SET valor = $1, atualizado_em = NOW()`,
      [newId]
    );
    setPodId(newId);
    res.json({ ok: true, pod_id: getPodId(), ollama_url: getOllamaBase() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/config/validate  — verifica pod + Ollama + modelos
router.get('/validate', async (_req, res) => {
  const result = {
    pod_id:           getPodId(),
    ollama_url:       getOllamaBase(),
    pod_status:       null,
    pod_error:        null,
    ollama_ok:        false,
    ollama_error:     null,
    models_required:  VISION_MODELS,
    models_installed: [],
    models_missing:   [],
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
  result.models_missing = VISION_MODELS.filter(m => {
    const base = m.split(':')[0];
    return !result.models_installed.some(a => a === m || a.startsWith(base + ':'));
  });

  result.ok =
    result.pod_status === 'RUNNING' &&
    result.ollama_ok &&
    result.models_missing.length === 0;

  res.json(result);
});

module.exports = router;
