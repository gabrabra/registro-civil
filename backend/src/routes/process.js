const express = require('express');
const multer  = require('multer');
const axios   = require('axios');
const path    = require('path');
const fs      = require('fs');
const { v4: uuid } = require('uuid');
const { pool } = require('../db');
const { ensurePodRunning, stopPod, scheduleIdleStop, getPodStatus, getPodConfig, getOllamaBase, getActiveModel, getProvider, getExtConfig, loadConfigFromDb } = require('../utils/runpod');
const { detectRecordCount } = require('../utils/imageSegment');
const { parseResultFromText } = require('../utils/parseResult');
const { temPermissao, MODULOS_COM_REGISTRO } = require('../utils/permissoes');
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
}).any(); // accepts both 'file' (legacy) and 'files' (multi-page)

// Every prompt asks for the same two-part answer: the full page transcribed
// verbatim, then the structured records derived from that transcription.
const TRANSCRICAO_INSTRUCAO =
  'PASSO 1 — TRANSCRIÇÃO INTEGRAL: Transcreva TODO o texto visível na página, do começo ao fim, ' +
  'linha por linha, sem resumir, sem parafrasear e sem pular trechos. Inclua cabeçalhos, margens, ' +
  'anotações laterais, averbações, carimbos e assinaturas. Preserve a grafia original de nomes e ' +
  'palavras (não modernize a ortografia). Marque trechos que não conseguir ler como [ilegível].\n';

const FORMATO_RESPOSTA =
  'Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois, neste formato:\n\n' +
  '{\n' +
  '  "transcricao_completa": "todo o texto da página, usando \\\\n para quebras de linha",\n' +
  '  "registros": [ /* ver formato de cada registro abaixo */ ]\n' +
  '}\n\n' +
  'Regras do JSON: use \\\\n para quebras de linha e \\\\" para aspas dentro de ' +
  '"transcricao_completa" — nunca quebre a linha literalmente dentro de uma string.\n\n';

const TESTAMENTO_PROMPT =
  'Você é especialista em leitura de documentos manuscritos históricos de cartório brasileiro.\n\n' +
  'Analise esta imagem de registro de testamento (século XIX ou XX).\n' +
  'O texto pode ser manuscrito cursivo antigo, desbotado ou parcialmente ilegível — faça seu melhor esforço.\n\n' +
  TRANSCRICAO_INSTRUCAO +
  'PASSO 2 — EXTRAÇÃO: Com base na transcrição, extraia os dados de cada testamento encontrado.\n\n' +
  FORMATO_RESPOSTA +
  'Cada objeto dentro de "registros":\n\n' +
  '  {\n' +
  '    "testador": "nome completo do testador (quem fez o testamento) ou null",\n' +
  '    "data_testamento": "data no formato YYYY-MM-DD ou descrição textual ou null",\n' +
  '    "ano": ano como número inteiro ou null,\n' +
  '    "livro": "número/código do livro ou null",\n' +
  '    "folha": "número da folha ou null",\n' +
  '    "tabeliao": "nome do tabelião ou null",\n' +
  '    "testemunhas": "nomes das testemunhas separados por vírgula ou null",\n' +
  '    "municipio": "nome do município ou null",\n' +
  '    "estado": "sigla UF ex: PE ou null",\n' +
  '    "confianca": "alta | media | baixa",\n' +
  '    "observacoes": "dificuldades de leitura, informações sobre herdeiros, bens ou null"\n' +
  '  }\n\n' +
  'Se não houver registros de testamento visíveis, use "registros": [] — mas SEMPRE preencha "transcricao_completa".';

const ESCRITURA_PROMPT =
  'Você é especialista em leitura de documentos manuscritos históricos de cartório brasileiro.\n\n' +
  'Analise esta imagem de escritura de compra e venda de imóvel (século XIX ou XX).\n' +
  'O texto pode ser manuscrito cursivo antigo, desbotado ou parcialmente ilegível — faça seu melhor esforço.\n\n' +
  TRANSCRICAO_INSTRUCAO +
  'PASSO 2 — EXTRAÇÃO: Com base na transcrição, extraia os dados de cada escritura de compra e venda.\n\n' +
  FORMATO_RESPOSTA +
  'Cada objeto dentro de "registros":\n\n' +
  '  {\n' +
  '    "vendedor": "nome completo do vendedor ou null",\n' +
  '    "cpf_vendedor": "CPF se visível ou null",\n' +
  '    "comprador": "nome completo do comprador ou null",\n' +
  '    "cpf_comprador": "CPF se visível ou null",\n' +
  '    "data_escritura": "data no formato YYYY-MM-DD ou descrição textual ou null",\n' +
  '    "ano": ano como número inteiro ou null,\n' +
  '    "livro": "número/código do livro ou null",\n' +
  '    "folha": "número da folha ou null",\n' +
  '    "descricao_imovel": "descrição do imóvel (tipo, metragem, características) ou null",\n' +
  '    "endereco_imovel": "endereço completo do imóvel ou null",\n' +
  '    "valor": "valor com moeda histórica (ex: 500 mil-réis, 1:200$000, R$ 50.000) ou null",\n' +
  '    "tabeliao": "nome do tabelião ou null",\n' +
  '    "cartorio": "nome do cartório ou null",\n' +
  '    "municipio": "nome do município ou null",\n' +
  '    "estado": "sigla UF ex: PE ou null",\n' +
  '    "confianca": "alta | media | baixa",\n' +
  '    "observacoes": "dificuldades de leitura ou informações adicionais ou null"\n' +
  '  }\n\n' +
  'Se não houver escrituras de compra e venda visíveis, use "registros": [] — mas SEMPRE preencha "transcricao_completa".';

const BASE_PROMPT =
  'Você é especialista em leitura de documentos manuscritos históricos de cartório brasileiro.\n\n' +
  'Analise esta imagem de página de livro de registro civil de nascimento (século XIX ou XX).\n' +
  'O texto pode ser manuscrito cursivo antigo, desbotado ou parcialmente ilegível — faça seu melhor esforço.\n\n' +
  TRANSCRICAO_INSTRUCAO +
  'PASSO 2 — EXTRAÇÃO: Com base na transcrição, extraia os dados de cada registro de nascimento.\n\n' +
  FORMATO_RESPOSTA +
  'Cada objeto dentro de "registros":\n\n' +
  '  {\n' +
  '    "nome_completo": "nome completo do registrado ou null",\n' +
  '    "nome_mae": "nome da mãe ou null",\n' +
  '    "nome_pai": "nome do pai ou null",\n' +
  '    "data_nascimento": "YYYY-MM-DD ou null",\n' +
  '    "ano": ano como número inteiro ou null,\n' +
  '    "numero_termo": número inteiro do termo ou null,\n' +
  '    "municipio": "nome do município ou null",\n' +
  '    "estado": "sigla UF ex: PE ou null",\n' +
  '    "confianca": "alta | media | baixa",\n' +
  '    "observacoes": "dificuldades de leitura ou informações adicionais ou null"\n' +
  '  }\n\n' +
  'Se não houver registros de nascimento visíveis, use "registros": [] — mas SEMPRE preencha "transcricao_completa".';

// Batch import feeds whole books page by page, so a page may be the cover
// rather than records. Classifying here costs nothing extra — same call.
const CAPA_INSTRUCAO =
  '\n\nATENÇÃO — ESTA PÁGINA PODE SER A CAPA (folha de rosto) DO LIVRO.\n' +
  'Antes de extrair registros, decida o que a página é:\n' +
  '- CAPA: identifica o livro como um todo (número/código do livro, cartório, CNPJ/CNS, ' +
  'intervalo de termos, período de datas, município). Não traz registros individuais de pessoas.\n' +
  '- PÁGINA DE REGISTROS: traz termos/assentos de nascimento de pessoas.\n\n' +
  'Se for CAPA, responda com "eh_capa": true, "registros": [] e preencha "dados_livro":\n' +
  '{\n' +
  '  "numero": "número/código do livro, ex: A-74",\n' +
  '  "cartorio": "nome completo do cartório ou null",\n' +
  '  "cnpj": "CNPJ se visível ou null",\n' +
  '  "cns": "CNS se visível ou null",\n' +
  '  "termo_inicio": número inteiro do primeiro termo ou null,\n' +
  '  "termo_fim": número inteiro do último termo ou null,\n' +
  '  "data_inicio": "YYYY-MM-DD ou null",\n' +
  '  "data_fim": "YYYY-MM-DD ou null",\n' +
  '  "municipio": "nome do município ou null",\n' +
  '  "estado": "sigla UF ou null"\n' +
  '}\n\n' +
  'Se for PÁGINA DE REGISTROS, responda com "eh_capa": false, "dados_livro": null e preencha "registros" normalmente.\n' +
  'Em qualquer um dos casos, SEMPRE preencha "transcricao_completa".\n' +
  'Na dúvida entre os dois, prefira "eh_capa": false.';

function buildPrompt(livro, recordCountHint, detectarCapa) {
  const capa = detectarCapa ? CAPA_INSTRUCAO : '';
  if (!livro && !recordCountHint) return BASE_PROMPT + capa;

  const yearStart = livro?.data_inicio ? new Date(livro.data_inicio).getFullYear() : null;
  const yearEnd   = livro?.data_fim    ? new Date(livro.data_fim).getFullYear()    : null;
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

  // A count hint would contradict the cover branch, so only apply it when the
  // page is known to hold records
  if (recordCountHint && recordCountHint > 1 && !detectarCapa) {
    ctx += `\n\nIMPORTANTE: Esta imagem contém EXATAMENTE ${recordCountHint} registros de nascimento.`;
    ctx += ` Você DEVE retornar um array com EXATAMENTE ${recordCountHint} objetos — um por registro. Não retorne array vazio.`;
  }

  return BASE_PROMPT + ctx + capa;
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


// A full handwritten page transcribed verbatim plus the structured records
// needs far more room than field extraction alone did. On models where thinking
// is on by default this budget also covers the thinking tokens.
const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS) || 16000;

// Claude accepts these image types; TIFF is not among them.
const ANTHROPIC_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Builds one content block per uploaded file. PDFs go as `document`, images as
// `image` with their real media_type — sending a PNG labelled as JPEG fails.
function buildAnthropicBlocks(base64s, mimetypes) {
  return base64s.map((data, i) => {
    const mime = mimetypes?.[i] || 'image/jpeg';

    if (mime === 'application/pdf') {
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
    }
    if (!ANTHROPIC_IMAGE_TYPES.includes(mime)) {
      throw new Error(`Formato "${mime}" não é aceito pela API Anthropic. Converta para JPG ou PNG antes de enviar.`);
    }
    return { type: 'image', source: { type: 'base64', media_type: mime, data } };
  });
}

// Thinking blocks come before text blocks, so content[0] is not reliably the
// answer — collect every text block instead.
function extractAnthropicText(content) {
  return (content || [])
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('\n')
    .trim();
}

async function callModelAnthropic(base64s, prompt, mimetypes) {
  const { key, model, resolvedUrl } = getExtConfig();
  if (!key || !model) throw new Error('API Anthropic não configurada (preencha chave e modelo nas Configurações)');

  const mediaBlocks = buildAnthropicBlocks(base64s, mimetypes);

  let resp;
  try {
    resp = await axios.post(`${resolvedUrl}/messages`, {
      model,
      max_tokens: MAX_TOKENS,
      messages: [{
        role: 'user',
        content: [...mediaBlocks, { type: 'text', text: prompt }]
      }]
    }, {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      timeout: 300000
    });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.response?.data?.error || JSON.stringify(err.response?.data) || err.message;
    console.error(`[callModelAnthropic] ERRO ${err.response?.status}: ${detail}`);
    throw new Error(`API Anthropic (${model}): ${detail}`);
  }

  if (resp.data?.stop_reason === 'refusal') {
    throw new Error(`API Anthropic (${model}): a solicitação foi recusada pelos filtros de segurança do modelo`);
  }
  if (resp.data?.stop_reason === 'max_tokens') {
    console.warn(`[callModelAnthropic] Resposta truncada em max_tokens (${MAX_TOKENS}) — aumente AI_MAX_TOKENS`);
  }

  const rawContent = extractAnthropicText(resp.data?.content);
  console.log(`[callModelAnthropic] ${model}: ${rawContent.length} chars — "${rawContent.slice(0, 200).replace(/\n/g, '\\n')}"`);
  return parseResultFromText(rawContent);
}

async function callModelMistralOCR(base64s, prompt, mimetypes) {
  const { key, model, resolvedUrl } = getExtConfig();
  const baseUrl    = (resolvedUrl || 'https://api.mistral.ai/v1').replace(/\/$/, '');
  const chatModel  = model || 'mistral-small-latest';

  // Step 1: OCR each file with mistral-ocr-latest
  const ocrPages = [];
  for (let i = 0; i < base64s.length; i++) {
    const b64  = base64s[i];
    const mime = (mimetypes && mimetypes[i]) ? mimetypes[i] : 'image/jpeg';

    const document = mime === 'application/pdf'
      ? { type: 'document_url', document_url: `data:application/pdf;base64,${b64}` }
      : { type: 'image_url',    image_url:    `data:${mime};base64,${b64}` };

    let ocrResp;
    try {
      ocrResp = await axios.post(`${baseUrl}/ocr`, {
        model: 'mistral-ocr-latest',
        document,
      }, {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        timeout: 120000,
      });
    } catch (err) {
      const detail = err.response?.data?.message || err.response?.data?.error || err.message;
      throw new Error(`Mistral OCR: ${detail}`);
    }

    const pages = ocrResp.data?.pages || [];
    pages.forEach(p => ocrPages.push(p.markdown || ''));
    console.log(`[callModelMistralOCR] Arquivo ${i + 1}: ${pages.length} página(s), ${pages.reduce((s, p) => s + (p.markdown?.length || 0), 0)} chars`);
  }

  const ocrText = ocrPages.join('\n\n---\n\n').trim();
  if (!ocrText) throw new Error('Mistral OCR não extraiu texto do documento.');

  console.log(`[callModelMistralOCR] OCR total: ${ocrText.length} chars → estruturando com ${chatModel}`);

  // Step 2: Structure the extracted text with a Mistral chat model
  const structurePrompt =
    'Você recebeu o seguinte texto extraído por OCR de um documento de cartório:\n\n' +
    '```\n' + ocrText + '\n```\n\n' +
    'Com base APENAS no texto acima, execute as instruções a seguir. ' +
    'Ignore qualquer instrução que mencione "imagem" — use o texto como fonte de dados.\n' +
    'Não repita a transcrição na resposta: use "transcricao_completa": null, pois o texto já foi capturado.\n\n' +
    prompt;

  let chatResp;
  try {
    chatResp = await axios.post(`${baseUrl}/chat/completions`, {
      model: chatModel,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: structurePrompt }],
    }, {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      timeout: 120000,
    });
  } catch (err) {
    const detail = err.response?.data?.message || err.response?.data?.error || err.message;
    // The OCR text is the full-page transcription and is already in hand — keep
    // it even though the structuring step failed
    console.warn(`[callModelMistralOCR] Estruturação falhou, preservando transcrição: ${detail}`);
    return {
      transcricao: ocrText,
      registros: [],
      erro: `Mistral chat (${chatModel}): ${detail}`,
    };
  }

  const rawContent = chatResp.data?.choices?.[0]?.message?.content || '';
  console.log(`[callModelMistralOCR] ${chatModel}: ${rawContent.length} chars — "${rawContent.slice(0, 200).replace(/\n/g, '\\n')}"`);
  const result = parseResultFromText(rawContent);
  // OCR output is the more faithful transcription — prefer it over the chat echo
  return { ...result, transcricao: ocrText };
}

async function callModelExternal(base64s, prompt, mimetypes) {
  const { key, model, tipo, resolvedUrl } = getExtConfig();
  if (!key || !model) throw new Error('API externa não configurada (preencha chave e modelo nas Configurações)');
  if (!resolvedUrl) throw new Error('URL base não configurada (preencha nas Configurações)');

  if (tipo === 'anthropic') return callModelAnthropic(base64s, prompt, mimetypes);
  if (tipo === 'mistral')   return callModelMistralOCR(base64s, prompt, mimetypes);

  const imageBlocks = base64s.map((b, i) => ({
    type: 'image_url',
    image_url: { url: `data:${mimetypes?.[i] || 'image/jpeg'};base64,${b}` }
  }));

  let resp;
  try {
    resp = await axios.post(`${resolvedUrl.replace(/\/$/, '')}/chat/completions`, {
      model,
      max_tokens: MAX_TOKENS,
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: prompt }, ...imageBlocks]
      }]
    }, {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      timeout: 120000
    });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.response?.data?.error || JSON.stringify(err.response?.data) || err.message;
    const detailStr = typeof detail === 'string' ? detail : JSON.stringify(detail);
    console.error(`[callModelExt] ERRO ${err.response?.status}: ${detailStr}`);
    if (detailStr.includes('image_url') || detailStr.includes('image') && detailStr.includes('unknown variant')) {
      throw new Error(`O modelo "${model}" não suporta imagens. Use um modelo com visão: deepseek-vl2 (DeepSeek), gpt-4o (OpenAI) ou claude-sonnet-4-6 (Anthropic).`);
    }
    throw new Error(`API externa (${model}): ${detailStr}`);
  }

  const rawContent = resp.data?.choices?.[0]?.message?.content || '';
  console.log(`[callModelExt] ${model}: ${rawContent.length} chars — "${rawContent.slice(0, 200).replace(/\n/g, '\\n')}"`);
  return parseResultFromText(rawContent);
}

async function callModel(modelName, base64s, prompt) {
  let resp;
  try {
    resp = await axios.post(`${getOllamaBase()}/api/chat`, {
      model: modelName,
      stream: false,
      keep_alive: -1,
      options: { temperature: 0.2, num_predict: MAX_TOKENS },
      messages: [{ role: 'user', content: prompt, images: base64s }]
    }, { timeout: 600000 });
  } catch (err) {
    throw new Error(`${modelName}: ${err.message}`);
  }

  const rawContent = resp.data?.message?.content || '';
  console.log(`[callModel] ${modelName}: ${rawContent.length} chars — "${rawContent.slice(0, 200).replace(/\n/g, '\\n')}"`);
  return parseResultFromText(rawContent);
}

router.post('/', upload, async (req, res) => {
  const uploadedFiles = req.files || [];
  if (!uploadedFiles.length) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  const primaryFile = uploadedFiles[0];
  const livroId     = req.body.livro_id || null;
  const tipo        = req.body.tipo || 'nascimento';

  // Reading a document is the first half of creating a record of that type,
  // so it is gated by the same permission. The quota is only charged when the
  // record is actually saved.
  if (!MODULOS_COM_REGISTRO.includes(tipo)) {
    return res.status(400).json({ error: `Tipo de documento inválido: ${tipo}` });
  }
  if (!temPermissao(req.contexto?.perfil, tipo, 'criar')) {
    return res.status(403).json({
      error: `Seu perfil (${req.contexto?.perfil?.nome || 'sem perfil'}) não tem permissão para criar registros de ${tipo}.`,
    });
  }
  const isImage     = /image\/(jpeg|png|webp|tiff)/.test(primaryFile.mimetype);
  // Batch import feeds whole books, so a page may be the cover
  const detectarCapa = tipo === 'nascimento' && /^(1|true)$/i.test(String(req.body.detectar_capa || ''));

  console.log(`[process] Nova requisição — tipo=${tipo} páginas=${uploadedFiles.length} arquivo=${primaryFile.originalname} livro_id=${livroId}`);

  // Always reload config from DB to pick up any changes saved after startup
  await loadConfigFromDb(pool).catch(() => {});

  const provider = getProvider();
  const livro    = tipo === 'nascimento' ? await getLivro(livroId) : null;
  const model    = getActiveModel();

  const arquivoInfo = {
    arquivo_path:  primaryFile.path,
    arquivo_nome:  primaryFile.originalname,
    arquivo_tipo:  primaryFile.mimetype,
    arquivo_url:   `/files/${primaryFile.filename}`,
    arquivos_urls: uploadedFiles.map(f => `/files/${f.filename}`),
  };

  let allRegistros = [];
  let transcricao  = null;
  let ehCapa       = false;
  let dadosLivro   = null;
  let podError     = null;

  const base64s  = uploadedFiles.map(f => fs.readFileSync(f.path).toString('base64'));
  const mimetypes = uploadedFiles.map(f => f.mimetype);

  // Select prompt based on document type; add multi-page context when needed
  let prompt;
  if (tipo === 'testamento') prompt = TESTAMENTO_PROMPT;
  else if (tipo === 'escritura') prompt = ESCRITURA_PROMPT;
  else prompt = buildPrompt(livro, null, detectarCapa); // nascimento — count hint added below

  if (uploadedFiles.length > 1 && tipo !== 'nascimento') {
    prompt = `Este documento tem ${uploadedFiles.length} páginas. Analise TODAS as páginas em sequência como partes de UM ÚNICO DOCUMENTO.\n` +
      `Em "transcricao_completa", transcreva as ${uploadedFiles.length} páginas na ordem, separando cada uma com uma linha "--- Página N ---".\n` +
      `Em "registros", retorne apenas UM objeto consolidado com os dados completos do documento.\n\n` + prompt;
  }

  if (provider === 'openai') {
    console.log(`[process] API externa: ${getExtConfig().model}`);
    try {
      const result = await callModelExternal(base64s, prompt, mimetypes);
      allRegistros = result.registros;
      transcricao  = result.transcricao;
      ehCapa       = result.ehCapa;
      dadosLivro   = result.dadosLivro;
      if (result.erro) podError = result.erro;
      console.log(`[process] API externa: ${allRegistros.length} registro(s), transcrição ${transcricao?.length || 0} chars`);
    } catch (e) {
      console.warn('[process] API externa falhou:', e.message);
      podError = e.message;
    }
  } else {
    // --- Ollama / RunPod ---
    try { await ensurePodRunning(); } catch (err) {
      podError = err.message;
      console.warn('[process] ensurePodRunning falhou:', err.message);
    }

    console.log(`[process] Modelo ativo: ${model}`);

    // Record count detection only for nascimentos (multiple records per page)
    let finalPrompt = prompt;
    if (tipo === 'nascimento') {
      const recordCount = isImage
        ? await detectRecordCount(fs.readFileSync(primaryFile.path), model, getOllamaBase())
        : 1;
      finalPrompt = buildPrompt(livro, recordCount > 1 ? recordCount : null, detectarCapa);
      console.log(`[process] Processando imagem completa (${recordCount} registro(s) detectados) → ${model}`);
    }

    try {
      const result = await callModel(model, base64s, finalPrompt);
      console.log(`[process] ${model}: ${result.registros.length} registro(s), transcrição ${result.transcricao?.length || 0} chars`);
      allRegistros = result.registros;
      transcricao  = result.transcricao;
      ehCapa       = result.ehCapa;
      dadosLivro   = result.dadosLivro;
    } catch (e) {
      console.warn(`[process] ${model} falhou:`, e.message);
      const fallback = 'qwen2.5vl:7b';
      if (model !== fallback) {
        console.log(`[process] Tentando modelo padrão como fallback: ${fallback}`);
        try {
          const result = await callModel(fallback, base64s, finalPrompt);
          console.log(`[process] ${fallback} (fallback): ${result.registros.length} registro(s)`);
          allRegistros = result.registros;
          transcricao  = result.transcricao;
          ehCapa       = result.ehCapa;
          dadosLivro   = result.dadosLivro;
          podError = `Modelo "${model}" indisponível — processado com "${fallback}"`;
        } catch (e2) {
          console.warn(`[process] ${fallback} também falhou:`, e2.message);
          podError = e.message;
        }
      } else {
        podError = e.message;
      }
    }
  }

  // Apply book constraints only for nascimentos
  const registros = tipo === 'nascimento' ? applyBookConstraints(allRegistros, livro) : allRegistros;
  console.log(`[process] Resultado final: ${registros.length} registro(s), transcrição ${transcricao?.length || 0} chars`);

  // A cover legitimately carries no records — it must not be reported as a failure
  const noRecords = registros.length === 0 && !ehCapa;
  if (ehCapa) console.log(`[process] Página identificada como CAPA — livro "${dadosLivro?.numero || '?'}"`);

  scheduleIdleStop();
  res.json({
    registros,
    transcricao_completa: transcricao || null,
    ...(detectarCapa ? { eh_capa: ehCapa, dados_livro: dadosLivro } : {}),
    ...arquivoInfo,
    ...(noRecords ? {
      ai_error: true,
      ai_error_detail: podError
        || (transcricao ? 'Página transcrita, mas nenhum registro estruturado foi extraído' : 'Nenhum registro extraído'),
    } : {}),
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
