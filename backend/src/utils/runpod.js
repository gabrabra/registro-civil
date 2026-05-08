const axios = require('axios');

const API_KEY  = process.env.RUNPOD_API_KEY  || '';
const POD_ID   = process.env.RUNPOD_POD_ID   || '6y0yvpxgoqoth8';
const OLLAMA_BASE = process.env.RUNPOD_OLLAMA_URL ||
  `https://${POD_ID}-11434.proxy.runpod.net`;

const VISION_MODELS = ['qwen2.5vl:7b', 'minicpm-v', 'llama3.2-vision'];

// Stop pod after this many ms of inactivity (default: 15 min)
const IDLE_STOP_MS = Number(process.env.RUNPOD_IDLE_STOP_MS) || 15 * 60 * 1000;

const pulling = new Set();
let idleTimer = null;

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
  const data = await gql(`{ pod(input: {podId: "${POD_ID}"}) { id desiredStatus runtime { uptimeInSeconds } } }`);
  return data.data?.pod ?? null;
}

async function startPod() {
  const data = await gql(`mutation { podResume(input: {podId: "${POD_ID}", gpuCount: 1}) { id desiredStatus } }`);
  return data.data?.podResume;
}

async function stopPod() {
  if (!API_KEY) return;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const data = await gql(`mutation { podStop(input: {podId: "${POD_ID}"}) { id desiredStatus } }`);
  console.log('[runpod] Pod parado:', data.data?.podStop?.desiredStatus);
}

// Reset the idle stop timer on each completed request
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
      await axios.get(`${OLLAMA_BASE}/api/tags`, { timeout: 8000 });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 6000));
    }
  }
  return false;
}

async function ensureModels() {
  let installed;
  try {
    const r = await axios.get(`${OLLAMA_BASE}/api/tags`, { timeout: 10000 });
    installed = (r.data?.models || []).map(m => m.name);
  } catch { return; }

  for (const model of VISION_MODELS) {
    if (pulling.has(model)) continue;
    const base = model.split(':')[0];
    const found = installed.some(m => m === model || m.startsWith(base + ':'));
    if (!found) {
      pulling.add(model);
      console.log(`[runpod] Pulling ${model} em background...`);
      axios.post(`${OLLAMA_BASE}/api/pull`, { name: model, stream: false }, { timeout: 1800000 })
        .then(() => console.log(`[runpod] ${model} pronto`))
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
  if (!pod) throw new Error(`Pod ${POD_ID} não encontrado`);

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

module.exports = { ensurePodRunning, stopPod, scheduleIdleStop, getPodStatus, OLLAMA_BASE, VISION_MODELS };
