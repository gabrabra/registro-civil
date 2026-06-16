const axios = require('axios');
const fs    = require('fs');

const FIELD_CONFIG = [
  { key: 'nome_completo',   label: 'Nome completo',   color: '#3b82f6' },
  { key: 'nome_mae',        label: 'Nome da mãe',     color: '#22c55e' },
  { key: 'nome_pai',        label: 'Nome do pai',     color: '#a855f7' },
  { key: 'data_nascimento', label: 'Data nascimento', color: '#f59e0b' },
  { key: 'numero_termo',    label: 'Nº do termo',     color: '#ef4444' },
  { key: 'ano',             label: 'Ano',             color: '#06b6d4' },
  { key: 'livro',           label: 'Livro',           color: '#6366f1' },
];

const FIELD_COLORS = Object.fromEntries(FIELD_CONFIG.map(f => [f.key, f.color]));
const FIELD_LABELS = Object.fromEntries(FIELD_CONFIG.map(f => [f.key, f.label]));

async function locateFields(arquivoPath, record, ollamaBase, modelName = 'qwen2.5vl:7b') {
  let imageBuffer;
  try {
    imageBuffer = fs.readFileSync(arquivoPath);
  } catch (e) {
    console.warn('[localize] Não foi possível ler arquivo:', e.message);
    return null;
  }

  const fields = FIELD_CONFIG
    .filter(f => record[f.key] != null && String(record[f.key]).trim() !== '')
    .map(f => ({ key: f.key, label: f.label, value: String(record[f.key]) }));

  if (!fields.length) return null;

  const prompt =
    'Esta é uma imagem de um documento de cartório brasileiro. ' +
    'Localize exatamente onde cada campo abaixo aparece escrito na imagem.\n\n' +
    'Retorne as coordenadas do bounding box de cada texto encontrado, ' +
    'normalizadas de 0 a 1000 (0 = borda esquerda/topo, 1000 = borda direita/inferior).\n\n' +
    'Campos a localizar:\n' +
    fields.map(f => `- ${f.key}: "${f.value}"`).join('\n') +
    '\n\nResponda SOMENTE com JSON válido:\n' +
    '{\n' + fields.map(f => `  "${f.key}": [x1, y1, x2, y2]`).join(',\n') + '\n}\n\n' +
    'Omita campos não visíveis. Coordenadas como números inteiros. ' +
    'x1 < x2, y1 < y2, todos entre 0 e 1000.';

  try {
    const resp = await axios.post(`${ollamaBase}/api/chat`, {
      model: modelName,
      stream: false,
      keep_alive: -1,
      options: { temperature: 0 },
      messages: [{ role: 'user', content: prompt, images: [imageBuffer.toString('base64')] }]
    }, { timeout: 60000 });

    const content = (resp.data?.message?.content || '').replace(/```json\n?|\n?```/g, '').trim();
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn('[localize] Resposta sem JSON:', content.slice(0, 300));
      return null;
    }

    const raw = JSON.parse(match[0]);
    const bbox = {};

    for (const [key, coords] of Object.entries(raw)) {
      if (
        Array.isArray(coords) && coords.length === 4 &&
        coords.every(n => typeof n === 'number' && isFinite(n)) &&
        coords[0] >= 0 && coords[1] >= 0 &&
        coords[2] <= 1000 && coords[3] <= 1000 &&
        coords[2] > coords[0] && coords[3] > coords[1]
      ) {
        bbox[key] = coords.map(Math.round);
      }
    }

    const found = Object.keys(bbox);
    console.log(`[localize] Modelo=${modelName} Campos encontrados: ${found.join(', ') || 'nenhum'}`);
    return found.length ? bbox : null;
  } catch (e) {
    console.warn('[localize] Falhou:', e.message);
    return null;
  }
}

module.exports = { locateFields, FIELD_COLORS, FIELD_LABELS, FIELD_CONFIG };
