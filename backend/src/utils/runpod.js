const axios = require('axios');

const API_KEY  = process.env.RUNPOD_API_KEY  || '';
const POD_ID   = process.env.RUNPOD_POD_ID   || '6y0yvpxgoqoth8';
const OLLAMA_BASE = process.env.RUNPOD_OLLAMA_URL ||
  `https://${POD_ID}-11434.proxy.runpod.net`;

const VISION_MODELS = ['qwen2.5vl:7b', 'minicpm-v', 'llama3.2-vision'];

// Track which models are currently being pulled to avoid duplicate pulls
const pulling = new Set();

async function gql(query) {
  const r = await axios.post(
    'https://api.runpod.io/graphql',
    { query },
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` }, timeout: 15000 }
  );
  return r.data;
}

async function getPodStatus() {
  const data = await gql(`{ pod(input: {podId: "${POD_ID}"}) { id desiredStatus runtime { uptimeInSeconds } } }`);
  return data.data?.pod ?? null;
}

async function startPod() {
  const data = await gql(`mutation { podResume(input: {podId: "${POD_ID}", gpuCount: 1}) { id desiredStatus } }`);
  return data.data?.podResume;
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

// Pull any missing models in the background (fire-and-forget)
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
      console.log(`[runpod] Pulling ${model} in background...`);
      axios.post(`${OLLAMA_BASE}/api/pull`, { name: model, stream: false }, { timeout: 1800000 })
        .then(() => console.log(`[runpod] ${model} pulled OK`))
        .catch(e => console.error(`[runpod] Pull ${model} failed:`, e.message))
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

  // Kick off model pulls without blocking the request
  ensureModels().catch(() => {});
}

module.exports = { ensurePodRunning, OLLAMA_BASE, VISION_MODELS };
