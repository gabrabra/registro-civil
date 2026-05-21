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
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (email, senha) => http.post('/auth/login', { email, senha }).then(r => r.data),
  me:    ()             => http.get('/auth/me').then(r => r.data),
};

export const livrosApi = {
  list:   ()      => http.get('/livros').then(r => r.data),
  get:    (id)    => http.get(`/livros/${id}`).then(r => r.data),
  create: (data)  => http.post('/livros', data).then(r => r.data),
  update: (id, d) => http.put(`/livros/${id}`, d).then(r => r.data),
  remove: (id)    => http.delete(`/livros/${id}`).then(r => r.data),
};

export const nascimentosApi = {
  list:   (params) => http.get('/nascimentos', { params }).then(r => r.data),
  get:    (id)     => http.get(`/nascimentos/${id}`).then(r => r.data),
  create: (data)   => http.post('/nascimentos', data).then(r => r.data),
  update: (id, d)  => http.put(`/nascimentos/${id}`, d).then(r => r.data),
  remove: (id)     => http.delete(`/nascimentos/${id}`).then(r => r.data),
};

export const processApi = {
  file: (file, livroId, onProgress) => {
    const form = new FormData();
    form.append('file', file);
    if (livroId) form.append('livro_id', livroId);
    return http.post('/process', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000, // 10 min: pod wake-up (up to 5 min) + inference
      onUploadProgress: onProgress
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

export default http;
