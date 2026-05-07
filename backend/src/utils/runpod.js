const axios = require('axios');

const API_KEY  = process.env.RUNPOD_API_KEY  || '';
const POD_ID   = process.env.RUNPOD_POD_ID   || '6y0yvpxgoqoth8';
const OLLAMA_BASE = process.env.RUNPOD_OLLAMA_URL ||
  `https://${POD_ID}-11434.proxy.runpod.net`;

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

async function ensurePodRunning() {
  if (!API_KEY) {
    // No API key — just verify Ollama is reachable
    const ready = await ollamaReady(30000);
    if (!ready) throw new Error('Ollama não está acessível e RUNPOD_API_KEY não está configurado');
    return;
  }

  const pod = await getPodStatus();
  if (!pod) throw new Error(`Pod ${POD_ID} não encontrado`);

  console.log(`Pod status: ${pod.desiredStatus}`);

  if (pod.desiredStatus !== 'RUNNING') {
    console.log('Pod hibernado — iniciando...');
    await startPod();
    // Give RunPod a moment to register the start
    await new Promise(r => setTimeout(r, 5000));
  }

  // Wait for Ollama to respond (covers both cold-start and model load time)
  console.log('Aguardando Ollama ficar pronto...');
  const ready = await ollamaReady(300000); // 5 min max
  if (!ready) throw new Error('Ollama não ficou pronto no tempo esperado');
  console.log('Ollama pronto.');
}

module.exports = { ensurePodRunning, OLLAMA_BASE };
