const axios = require('axios');

const API_KEY = process.env.RUNPOD_API_KEY || '';

let _podId      = process.env.RUNPOD_POD_ID || 'k0vwks9huazlyg';
let _ollamaBase = process.env.RUNPOD_OLLAMA_URL || `https://${_podId}-11434.proxy.runpod.net`;

console.log(`[runpod] POD_ID="${_podId}" OLLAMA_BASE="${_ollamaBase}" API_KEY=${API_KEY ? 'SET' : 'NOT SET'}`);

// Models used for inference (whichever are installed will be used)
const VISION_MODELS = ['qwen2.5vl:7b', 'minicpm-v', 'llama3.2-vision'];
// Only this model is auto-installed on pod startup
const AUTO_INSTALL_MODELS = ['qwen2.5vl:7b'];
const IDLE_STOP_MS  = Number(process.env.RUNPOD_IDLE_STOP_MS) || 15 * 60 * 1000;

const pulling = new Set();
let idleTimer  = null;

let modelCache = { models: null, ts: 0 };

function getPodId()      { return _podId; }
function getOllamaBase() { return _ollamaBase; }

function setPodId(newId) {
  _podId = newId;
  if (!process.env.RUNPOD_OLLAMA_URL) {
    _ollamaBase = `https://${newId}-11434.proxy.runpod.net`;
  }
  modelCache = { models: null, ts: 0 };
  console.log(`[runpod] Pod ID atualizado → "${_podId}" (${_ollamaBase})`);
}

async function loadConfigFromDb(pool) {
  try {
    const r = await pool.query("SELECT valor FROM configuracoes WHERE chave = 'runpod_pod_id'");
    if (r.rows.length && r.rows[0].valor) {
      setPodId(r.rows[0].valor);
      console.log(`[runpod] Pod ID carregado do banco: ${_podId}`);
    }
  } catch (e) {
    console.warn('[runpod] Não foi possível carregar config do banco:', e.message);
  }
}

async function getAvailableModels() {
  if (modelCache.models && Date.now() - modelCache.ts < 60000) return modelCache.models;
  try {
    const r = await axios.get(`${_ollamaBase}/api/tags`, { timeout: 5000 });
    const models = (r.data?.models || []).map(m => m.name);
    modelCache = { models, ts: Date.now() };
    return models;
  } catch {
    return modelCache.models || [];
  }
}

async function gql(query) {
  const r = await axios.post(
    'https://api.runpod.io/graphql',
    { query },
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` }, timeout: 15000 }
  );
  return r.data;
}

async function getPodStatus() {
  if (!API_KEY) return null;
  const data = await gql(`{ pod(input: {podId: "${_podId}"}) { id desiredStatus runtime { uptimeInSeconds } } }`);
  return data.data?.pod ?? null;
}

async function startPod() {
  const data = await gql(`mutation { podResume(input: {podId: "${_podId}", gpuCount: 1}) { id desiredStatus } }`);
  if (data.errors?.length) throw new Error('podResume falhou: ' + data.errors[0].message);
  if (!data.data?.podResume) throw new Error('podResume retornou vazio — pod pode estar indisponível');
  return data.data.podResume;
}

async function stopPod() {
  if (!API_KEY) return;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const data = await gql(`mutation { podStop(input: {podId: "${_podId}"}) { id desiredStatus } }`);
  console.log('[runpod] Pod parado:', data.data?.podStop?.desiredStatus);
}

function scheduleIdleStop() {
  if (!API_KEY) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    console.log(`[runpod] ${IDLE_STOP_MS / 60000} min sem uso — parando pod...`);
    await stopPod().catch(e => console.error('[runpod] Stop automático falhou:', e.message));
  }, IDLE_STOP_MS);
}

async function ollamaReady(maxMs = 300000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      await axios.get(`${_ollamaBase}/api/tags`, { timeout: 8000 });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 6000));
    }
  }
  return false;
}

async function ensureModels() {
  const installed = await getAvailableModels();
  for (const model of AUTO_INSTALL_MODELS) {
    if (pulling.has(model)) continue;
    const base  = model.split(':')[0];
    const found = installed.some(m => m === model || m.startsWith(base + ':'));
    if (!found) {
      pulling.add(model);
      console.log(`[runpod] Pulling ${model} em background...`);
      axios.post(`${_ollamaBase}/api/pull`, { name: model, stream: false }, { timeout: 1800000 })
        .then(() => {
          console.log(`[runpod] ${model} pronto`);
          modelCache = { models: null, ts: 0 };
        })
        .catch(e => console.error(`[runpod] Pull ${model} falhou:`, e.message))
        .finally(() => pulling.delete(model));
    }
  }
}

async function ensurePodRunning() {
  if (!API_KEY) {
    const ready = await ollamaReady(30000);
    if (!ready) throw new Error('Ollama não está acessível e RUNPOD_API_KEY não está configurado');
    ensureModels().catch(() => {});
    return;
  }

  const pod = await getPodStatus();
  if (!pod) throw new Error(`Pod ${_podId} não encontrado`);
  console.log(`[runpod] Pod status: ${pod.desiredStatus}`);

  if (pod.desiredStatus !== 'RUNNING') {
    console.log('[runpod] Pod hibernado — iniciando...');
    await startPod();
    await new Promise(r => setTimeout(r, 5000));
  }

  console.log('[runpod] Aguardando Ollama ficar pronto...');
  const ready = await ollamaReady(300000);
  if (!ready) throw new Error('Ollama não ficou pronto no tempo esperado');
  console.log('[runpod] Ollama pronto.');

  ensureModels().catch(() => {});
}

function getPodConfig() {
  return { POD_ID: _podId, OLLAMA_BASE: _ollamaBase, API_KEY_SET: Boolean(API_KEY) };
}

function getPullingModels() {
  return [...pulling];
}

function pullModel(modelName) {
  if (pulling.has(modelName)) return;
  pulling.add(modelName);
  console.log(`[runpod] Pulling ${modelName}...`);
  axios.post(`${_ollamaBase}/api/pull`, { name: modelName, stream: false }, { timeout: 1800000 })
    .then(() => {
      console.log(`[runpod] ${modelName} pronto`);
      modelCache = { models: null, ts: 0 };
    })
    .catch(e => console.error(`[runpod] Pull ${modelName} falhou:`, e.message))
    .finally(() => pulling.delete(modelName));
}

module.exports = {
  ensurePodRunning, stopPod, scheduleIdleStop,
  getPodStatus, getPodConfig,
  getAvailableModels,
  getPodId, getOllamaBase, setPodId, loadConfigFromDb,
  getPullingModels, pullModel,
  VISION_MODELS,
};
