const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { v4: uuid } = require('uuid');
const { ensurePodRunning } = require('../utils/runpod');
const router = express.Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuid()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /image\/(jpeg|png|webp|tiff)|application\/pdf/.test(file.mimetype);
    cb(null, ok);
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) return res.status(500).json({ error: 'N8N_WEBHOOK_URL não configurado' });

  // Garante que o pod RunPod está acordado antes de chamar o n8n
  try {
    await ensurePodRunning();
  } catch (err) {
    console.warn('ensurePodRunning falhou (continuando mesmo assim):', err.message);
  }

  try {
    const form = new FormData();
    form.append('image', fs.createReadStream(req.file.path), {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    const response = await axios.post(webhookUrl, form, {
      headers: form.getHeaders(),
      timeout: 300000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    const data = response.data;

    // Normalize field names from n8n response
    const extracted = {
      nome_completo: data.nome_nascido || data.nome_completo || null,
      nome_mae:      data.nome_mae     || null,
      nome_pai:      data.nome_pai     || null,
      data_nascimento: data.data_nascimento || null,
      ano:           data.ano          || null,
      numero_termo:  data.numero_termo || null,
      municipio:     data.municipio    || null,
      estado:        data.estado       || null,
      confianca:     data.confianca    || 'baixa',
      observacoes:   data.observacoes  || null,
      arquivo_path:  req.file.path,
      arquivo_nome:  req.file.originalname,
      arquivo_tipo:  req.file.mimetype,
      arquivo_url:   `/files/${req.file.filename}`
    };

    res.json(extracted);
  } catch (err) {
    console.error('n8n error:', err.message);
    // File saved — return partial info even on AI error
    res.status(200).json({
      nome_completo: null, nome_mae: null, nome_pai: null,
      data_nascimento: null, ano: null, numero_termo: null,
      municipio: null, estado: null, confianca: 'baixa',
      observacoes: `Erro ao processar com IA: ${err.message}`,
      arquivo_path: req.file.path,
      arquivo_nome: req.file.originalname,
      arquivo_tipo: req.file.mimetype,
      arquivo_url: `/files/${req.file.filename}`,
      ai_error: true
    });
  }
});

module.exports = router;
