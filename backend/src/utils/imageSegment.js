const sharp = require('sharp');
const axios = require('axios');

const COUNT_PROMPT =
  'Quantos registros de nascimento separados e COMPLETOS existem nesta imagem?\n' +
  'Cada registro possui seu próprio cabeçalho começando com "Ao [número]... neste Cartório" e termina com assinaturas.\n' +
  'Uma página pode ter 1 ou 2 registros. Uma imagem de livro aberto (duas páginas) pode ter 2 ou 4 registros.\n' +
  'Responda SOMENTE com um único dígito: 1, 2, 3 ou 4.';

async function detectRecordCount(imageBuffer, modelName, ollamaBase) {
  try {
    const small = await sharp(imageBuffer)
      .resize(900, 900, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();

    const resp = await axios.post(`${ollamaBase}/api/chat`, {
      model: modelName,
      stream: false,
      options: { temperature: 0, num_predict: 5 },
      messages: [{ role: 'user', content: COUNT_PROMPT, images: [small.toString('base64')] }]
    }, { timeout: 35000 });

    const text = (resp.data?.message?.content || '').trim();
    const m = text.match(/[1-4]/);
    if (m) {
      const n = parseInt(m[0]);
      console.log(`[segment] Detectados ${n} registro(s) na página`);
      return n;
    }
  } catch (e) {
    console.warn('[segment] Detecção de layout falhou, assumindo 1 registro:', e.message);
  }
  return 1;
}

async function splitImage(imageBuffer, count) {
  if (count <= 1) return [imageBuffer];

  const { width: w, height: h } = await sharp(imageBuffer).metadata();

  let rows, cols;
  if (count >= 4)     { rows = 2; cols = 2; }
  else if (count === 3) { rows = (w > h) ? 1 : 3; cols = (w > h) ? 3 : 1; }
  else                  { rows = (w > h) ? 1 : 2; cols = (w > h) ? 2 : 1; }

  console.log(`[segment] Grid ${rows}x${cols} para ${count} registro(s) (imagem ${w}x${h})`);

  const segW = Math.floor(w / cols);
  const segH = Math.floor(h / rows);
  const segments = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const left   = c * segW;
      const top    = r * segH;
      const width  = c === cols - 1 ? w - left : segW;
      const height = r === rows - 1 ? h - top  : segH;

      const buf = await sharp(imageBuffer)
        .extract({ left, top, width, height })
        .toBuffer();
      segments.push(buf);
    }
  }

  return segments;
}

module.exports = { detectRecordCount, splitImage };
