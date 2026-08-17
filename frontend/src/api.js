import axios from 'axios';

const http = axios.create({ baseURL: '/api' });

http.interceptors.request.use(config => {
  const token = localStorage.getItem('rc_token') || sessionStorage.getItem('rc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('rc_token');
      sessionStorage.removeItem('rc_token');
      window.location.href = '/login';
    }
    // Surface the API's message (permission denied, quota reached) instead of
    // the generic "Request failed with status code 403"
    const detalhe = err.response?.data?.error;
    if (detalhe) err.message = detalhe;
    return Promise.reject(err);
  }
);

export const authApi = {
  login:  (email, senha) => http.post('/auth/login', { email, senha }).then(r => r.data),
  me:     ()             => http.get('/auth/me').then(r => r.data),
  // Best-effort: the token is dropped client-side regardless, this records the event
  logout: ()             => http.post('/auth/logout').then(r => r.data).catch(() => null),
};

export const auditoriaApi = {
  list:     (params) => http.get('/auditoria', { params }).then(r => r.data),
  resumo:   (dias)   => http.get('/auditoria/resumo', { params: { dias } }).then(r => r.data),
  catalogo: ()       => http.get('/auditoria/catalogo').then(r => r.data),
};

export const usuariosApi = {
  list:   ()      => http.get('/usuarios').then(r => r.data),
  get:    (id)    => http.get(`/usuarios/${id}`).then(r => r.data),
  create: (data)  => http.post('/usuarios', data).then(r => r.data),
  update: (id, d) => http.put(`/usuarios/${id}`, d).then(r => r.data),
  remove: (id)    => http.delete(`/usuarios/${id}`).then(r => r.data),
};

export const perfisApi = {
  list:     ()      => http.get('/perfis').then(r => r.data),
  get:      (id)    => http.get(`/perfis/${id}`).then(r => r.data),
  create:   (data)  => http.post('/perfis', data).then(r => r.data),
  update:   (id, d) => http.put(`/perfis/${id}`, d).then(r => r.data),
  remove:   (id)    => http.delete(`/perfis/${id}`).then(r => r.data),
  catalogo: ()      => http.get('/perfis/catalogo').then(r => r.data),
};

export const livrosApi = {
  list:   ()      => http.get('/livros').then(r => r.data),
  get:    (id)    => http.get(`/livros/${id}`).then(r => r.data),
  create: (data)  => http.post('/livros', data).then(r => r.data),
  update: (id, d) => http.put(`/livros/${id}`, d).then(r => r.data),
  remove: (id)    => http.delete(`/livros/${id}`).then(r => r.data),
};

export const nascimentosApi = {
  list:      (params) => http.get('/nascimentos', { params }).then(r => r.data),
  get:       (id)     => http.get(`/nascimentos/${id}`).then(r => r.data),
  create:    (data)   => http.post('/nascimentos', data).then(r => r.data),
  update:    (id, d)  => http.put(`/nascimentos/${id}`, d).then(r => r.data),
  remove:    (id)     => http.delete(`/nascimentos/${id}`).then(r => r.data),
  localizar: (id)     => http.post(`/nascimentos/${id}/localizar`).then(r => r.data),
};

export const testamentosApi = {
  list:   (params) => http.get('/testamentos', { params }).then(r => r.data),
  get:    (id)     => http.get(`/testamentos/${id}`).then(r => r.data),
  create: (data)   => http.post('/testamentos', data).then(r => r.data),
  update: (id, d)  => http.put(`/testamentos/${id}`, d).then(r => r.data),
  remove: (id)     => http.delete(`/testamentos/${id}`).then(r => r.data),
};

export const escriturasApi = {
  list:   (params) => http.get('/escrituras', { params }).then(r => r.data),
  get:    (id)     => http.get(`/escrituras/${id}`).then(r => r.data),
  create: (data)   => http.post('/escrituras', data).then(r => r.data),
  update: (id, d)  => http.put(`/escrituras/${id}`, d).then(r => r.data),
  remove: (id)     => http.delete(`/escrituras/${id}`).then(r => r.data),
};

export const processApi = {
  // files: single File or array of Files; tipoOrProgress: string tipo OR onProgress function
  // opts.detectarCapa asks the backend to classify the page as cover vs records
  file: (files, livroId, tipoOrProgress, onProgress, opts = {}) => {
    const tipo       = typeof tipoOrProgress === 'string' ? tipoOrProgress : null;
    const progressFn = typeof tipoOrProgress === 'function' ? tipoOrProgress : onProgress;
    const form = new FormData();
    const fileArray = Array.isArray(files) ? files : [files];
    fileArray.forEach(f => form.append('files', f));
    if (livroId) form.append('livro_id', livroId);
    if (tipo) form.append('tipo', tipo);
    if (opts.detectarCapa) form.append('detectar_capa', '1');
    return http.post('/process', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000,
      onUploadProgress: progressFn
    }).then(r => r.data);
  }
};

export const processLivroApi = {
  cover: (file) => {
    const form = new FormData();
    form.append('file', file);
    return http.post('/process/livro-capa', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000
    }).then(r => r.data);
  }
};

export const podApi = {
  status: () => http.get('/process/pod/status').then(r => r.data),
  stop:   () => http.post('/process/pod/stop').then(r => r.data),
  start:  () => http.post('/process/pod/start').then(r => r.data),
};

export const configApi = {
  get:          ()             => http.get('/config').then(r => r.data),
  save:         (pod_id)       => http.put('/config', { pod_id }).then(r => r.data),
  saveModel:    (active_model) => http.put('/config', { active_model }).then(r => r.data),
  saveProvider: (data)         => http.put('/config', data).then(r => r.data),
  validate:     ()             => http.get('/config/validate').then(r => r.data),
  catalog:      ()             => http.get('/config/catalog').then(r => r.data),
  installModel: (model)        => http.post('/config/install-model', { model }).then(r => r.data),
};

export default http;
