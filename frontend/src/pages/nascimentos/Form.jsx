import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Upload, Sparkles, AlertTriangle, CheckCircle, ChevronLeft, Save, Loader2, FileText, X, BookOpen, Lock } from 'lucide-react';
import { nascimentosApi, processApi, livrosApi } from '../../api.js';

const EMPTY = {
  livro_id: '', nome_completo: '', nome_mae: '', nome_pai: '', data_nascimento: '',
  ano: '', livro: '', folha: '', numero_termo: '', municipio: '', estado: '', observacoes: ''
};

function Field({ label, name, value, onChange, confidence, error, type = 'text', textarea, required, className = '' }) {
  const conf = confidence?.[name];
  const isLow = conf === 'baixa';
  const isMed = conf === 'media';
  const base = 'w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors';
  const style = isLow
    ? `${base} field-low focus:ring-red-300`
    : isMed
      ? `${base} field-medium focus:ring-amber-300`
      : `${base} border-slate-300 focus:ring-blue-300 focus:border-blue-400`;

  const inputProps = { id: name, name, value: value ?? '', onChange, className: `${style} ${className}`, placeholder: ' ' };

  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium text-slate-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {textarea
        ? <textarea rows={3} {...inputProps} />
        : <input type={type} {...inputProps} />
      }
      {isLow && <p className="flex items-center gap-1 mt-1 text-xs text-red-600"><AlertTriangle className="w-3 h-3" /> Confiança baixa — verifique este campo</p>}
      {isMed && <p className="flex items-center gap-1 mt-1 text-xs text-amber-600"><AlertTriangle className="w-3 h-3" /> Confiança média — confirme o valor</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// Read-only field showing a value inherited from the book
function LockedField({ label, value, hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
        {label}
        <Lock className="w-3 h-3 text-slate-400" />
      </label>
      <div className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-700 flex items-center justify-between gap-2">
        <span>{value || '—'}</span>
        {hint && <span className="text-xs text-slate-400 flex-shrink-0">{hint}</span>}
      </div>
    </div>
  );
}

function DropZone({ file, onFile, onClear, uploading }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef();
  function handle(f) {
    if (!f) return;
    if (!/image\/(jpeg|png|webp|tiff)|application\/pdf/.test(f.type)) return alert('Formato não suportado. Use JPG, PNG, TIFF, WEBP ou PDF.');
    onFile(f);
  }
  const preview = file && !file.type.includes('pdf') ? URL.createObjectURL(file) : null;

  if (file) return (
    <div className="border-2 border-blue-300 bg-blue-50 rounded-xl p-4 flex items-center gap-4">
      {preview
        ? <img src={preview} alt="preview" className="h-20 w-20 object-cover rounded-lg border border-slate-200 flex-shrink-0" />
        : <div className="h-20 w-20 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0"><FileText className="w-8 h-8 text-slate-400" /></div>
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
        <p className="text-xs text-slate-500 mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
      </div>
      {!uploading && <button onClick={onClear} className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"><X className="w-5 h-5" /></button>}
    </div>
  );

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${drag ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}
    >
      <input ref={inputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => handle(e.target.files[0])} />
      <Upload className="w-8 h-8 text-slate-300 mx-auto mb-3" />
      <p className="text-sm font-medium text-slate-600">Arraste o documento aqui</p>
      <p className="text-xs text-slate-400 mt-1">ou clique para selecionar</p>
      <p className="text-xs text-slate-300 mt-2">JPG, PNG, TIFF, WEBP ou PDF — até 50 MB</p>
    </div>
  );
}

export default function NascimentosForm() {
  const { id }            = useParams();
  const [searchParams]    = useSearchParams();
  const navigate          = useNavigate();
  const isEdit            = Boolean(id);

  const [form,       setForm]       = useState({ ...EMPTY, livro_id: searchParams.get('livro_id') || '' });
  const [livros,     setLivros]     = useState([]);
  const [confidence, setConfidence] = useState({});
  const [file,       setFile]       = useState(null);
  const [fileUrl,    setFileUrl]    = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processMsg, setProcessMsg] = useState('');
  const [saving,     setSaving]     = useState(false);
  const [errors,     setErrors]     = useState({});
  const [toast,      setToast]      = useState(null);
  const [aiDone,     setAiDone]     = useState(false);

  // Derived: the book linked to this registro
  const selectedLivro = livros.find(l => String(l.id) === String(form.livro_id)) || null;

  // Book-derived year range for hints
  const bookYearStart = selectedLivro?.data_inicio ? new Date(selectedLivro.data_inicio).getFullYear() : null;
  const bookYearEnd   = selectedLivro?.data_fim    ? new Date(selectedLivro.data_fim).getFullYear()    : null;
  const bookYearHint  = bookYearStart || bookYearEnd
    ? `${bookYearStart ?? '?'}–${bookYearEnd ?? '?'}`
    : null;

  useEffect(() => { livrosApi.list().then(setLivros).catch(() => {}); }, []);

  // When livro_id changes, sync locked fields from the book
  useEffect(() => {
    if (!selectedLivro) return;
    setForm(f => ({
      ...f,
      livro:     selectedLivro.numero    || f.livro,
      municipio: selectedLivro.municipio || f.municipio,
      estado:    selectedLivro.estado    || f.estado,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.livro_id]);

  useEffect(() => {
    if (!isEdit) return;
    nascimentosApi.get(id).then(r => {
      setForm({
        livro_id:        r.livro_id        ? String(r.livro_id) : '',
        nome_completo:   r.nome_completo   || '',
        nome_mae:        r.nome_mae        || '',
        nome_pai:        r.nome_pai        || '',
        data_nascimento: r.data_nascimento || '',
        ano:             r.ano             ? String(r.ano) : '',
        livro:           r.livro           || '',
        folha:           r.folha           || '',
        numero_termo:    r.numero_termo    || '',
        municipio:       r.municipio       || '',
        estado:          r.estado          || '',
        observacoes:     r.observacoes     || ''
      });
      if (r.arquivo_url) setFileUrl(r.arquivo_url);
    }).catch(() => setToast({ msg: 'Erro ao carregar registro', type: 'error' }));
  }, [id]);

  function set(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setErrors(er => ({ ...er, [name]: '' }));
  }

  // Handle livro_id change — also resets confidence for locked fields
  function handleLivroChange(e) {
    const livroId = e.target.value;
    const livro = livros.find(l => String(l.id) === livroId) || null;
    setForm(f => ({
      ...f,
      livro_id:  livroId,
      livro:     livro?.numero    || f.livro,
      municipio: livro?.municipio || (livroId ? '' : f.municipio),
      estado:    livro?.estado    || (livroId ? '' : f.estado),
    }));
    setConfidence(c => ({ ...c, livro: undefined, municipio: undefined, estado: undefined }));
  }

  async function handleProcess() {
    if (!file) return;
    setProcessing(true);
    setAiDone(false);
    setProcessMsg('IA processando... (pode levar 40–90 s)');
    try {
      // Pass livro_id so backend injects book context into the prompt
      const data = await processApi.file(file, form.livro_id || null);
      const reg  = data.registros?.[0] || {};
      const conf = reg.confianca || 'baixa';
      const perField = {};
      const sensitiveFields = ['nome_completo', 'nome_mae', 'nome_pai', 'numero_termo'];
      for (const f of Object.keys(EMPTY)) {
        perField[f] = sensitiveFields.includes(f) ? conf : (conf === 'baixa' ? 'media' : 'alta');
      }
      const fillForm = {};
      for (const [k] of Object.entries(EMPTY)) {
        const val = reg[k] || '';
        fillForm[k] = val;
        if (!val || String(val).includes('ilegível') || String(val) === 'null') perField[k] = 'baixa';
      }
      fillForm.nome_completo = reg.nome_completo || reg.nome_nascido || '';
      fillForm.numero_termo  = reg.numero_termo  || '';
      fillForm.ano           = reg.ano           ? String(reg.ano) : '';
      // Always keep the livro_id the user selected
      fillForm.livro_id = form.livro_id;
      // Backend already applied book overrides; keep them regardless of confidence
      if (selectedLivro) {
        fillForm.livro     = reg.livro     || selectedLivro.numero    || '';
        fillForm.municipio = reg.municipio || selectedLivro.municipio || '';
        fillForm.estado    = reg.estado    || selectedLivro.estado    || '';
        perField.livro     = 'alta';
        perField.municipio = selectedLivro.municipio ? 'alta' : perField.municipio;
        perField.estado    = selectedLivro.estado    ? 'alta' : perField.estado;
      }

      setForm(prev => ({
        ...prev,
        ...Object.fromEntries(Object.entries(fillForm).map(([k, v]) => [k, v ?? ''])),
        _arquivo_path: data.arquivo_path,
        _arquivo_nome: data.arquivo_nome,
        _arquivo_tipo: data.arquivo_tipo,
        _arquivo_url:  data.arquivo_url,
      }));
      setConfidence(perField);
      setFileUrl(data.arquivo_url || null);
      setAiDone(true);
      setToast(data.ai_error
        ? { msg: 'IA retornou erro — preencha manualmente', type: 'error' }
        : { msg: 'Dados extraídos! Revise e salve.', type: 'success' }
      );
    } catch (e) {
      setToast({ msg: `Erro ao processar: ${e.message}`, type: 'error' });
    } finally {
      setProcessing(false);
      setProcessMsg('');
    }
  }

  function validate() {
    const e = {};
    if (!form.nome_completo?.trim()) e.nome_completo = 'Obrigatório';
    if (!form.ano?.trim()) e.ano = 'Obrigatório';
    return e;
  }

  async function handleSave(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        arquivo_path: form._arquivo_path || null,
        arquivo_nome: form._arquivo_nome || null,
        arquivo_tipo: form._arquivo_tipo || null,
      };
      delete payload._arquivo_path; delete payload._arquivo_nome;
      delete payload._arquivo_tipo; delete payload._arquivo_url;
      if (isEdit) await nascimentosApi.update(id, payload);
      else        await nascimentosApi.create(payload);

      const livroId = searchParams.get('livro_id');
      navigate(livroId ? `/nascimentos?livro_id=${livroId}` : '/nascimentos');
    } catch (err) {
      setToast({ msg: `Erro ao salvar: ${err.message}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const backUrl = searchParams.get('livro_id')
    ? `/nascimentos?livro_id=${searchParams.get('livro_id')}`
    : '/nascimentos';

  return (
    <div className="max-w-3xl mx-auto">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm ${
          toast.type === 'success' ? 'bg-green-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        }`}>
          {toast.msg}
          <button onClick={() => setToast(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(backUrl)} className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {isEdit ? 'Editar Registro' : 'Novo Registro de Nascimento'}
          </h1>
          <p className="text-sm text-slate-500">Registro Civil</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Vincular livro */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-slate-400" />
            Livro de Registro
          </h2>
          <select
            name="livro_id"
            value={form.livro_id}
            onChange={handleLivroChange}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-colors bg-white"
          >
            <option value="">— Sem vínculo com livro —</option>
            {livros.map(l => (
              <option key={l.id} value={l.id}>
                Livro {l.numero}{l.cartorio ? ` — ${l.cartorio.slice(0, 50)}` : ''}{l.municipio ? ` (${l.municipio}/${l.estado})` : ''}
              </option>
            ))}
          </select>
          {selectedLivro && (
            <p className="mt-2 text-xs text-blue-600 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              Livro, município, estado e ano serão validados pelo contexto deste livro
              {bookYearHint && ` (${bookYearHint})`}
            </p>
          )}
        </div>

        {/* File Upload */}
        {!isEdit && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Documento do Registro</h2>
            <DropZone file={file} onFile={setFile} onClear={() => { setFile(null); setAiDone(false); setConfidence({}); }} uploading={processing} />
            {file && !processing && (
              <button type="button" onClick={handleProcess}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors">
                <Sparkles className="w-4 h-4" />
                Transcrever com IA{selectedLivro ? ` (Livro ${selectedLivro.numero})` : ''}
              </button>
            )}
            {processing && (
              <div className="mt-3 flex items-center gap-3 py-3 px-4 bg-violet-50 rounded-lg border border-violet-200">
                <Loader2 className="w-5 h-5 text-violet-600 animate-spin flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-violet-800">{processMsg}</p>
                  <p className="text-xs text-violet-600 mt-0.5">Aguarde — 3 modelos de IA analisando o documento</p>
                </div>
              </div>
            )}
            {aiDone && !processing && (
              <div className="mt-3 flex items-center gap-2 py-2.5 px-4 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <p className="text-sm text-green-800 font-medium">Dados extraídos — revise os campos abaixo</p>
              </div>
            )}
          </div>
        )}

        {isEdit && fileUrl && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 mb-2">Documento anexado</p>
            <a href={fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm">
              <FileText className="w-4 h-4" /> Abrir documento
            </a>
          </div>
        )}

        {/* Form Fields */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-2">Dados do Registro</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <Field
                label="Ano"
                name="ano"
                value={form.ano}
                onChange={set}
                confidence={confidence}
                error={errors.ano}
                required
              />
              {bookYearHint && (
                <p className="text-xs text-slate-400 mt-1">Período do livro: {bookYearHint}</p>
              )}
            </div>

            {/* Livro: hidden when book is selected (auto-filled) */}
            {selectedLivro
              ? <LockedField label="Livro" value={form.livro} hint="do livro" />
              : <Field label="Livro" name="livro" value={form.livro} onChange={set} confidence={confidence} />
            }

            <Field label="Folha" name="folha" value={form.folha} onChange={set} confidence={confidence} />
            <Field label="Nº do Termo" name="numero_termo" value={form.numero_termo} onChange={set} confidence={confidence} />
          </div>

          <Field label="Nome Completo" name="nome_completo" value={form.nome_completo} onChange={set} confidence={confidence} error={errors.nome_completo} required />
          <Field label="Nome da Mãe" name="nome_mae" value={form.nome_mae} onChange={set} confidence={confidence} />
          <Field label="Nome do Pai" name="nome_pai" value={form.nome_pai} onChange={set} confidence={confidence} />

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Data de Nascimento" name="data_nascimento" value={form.data_nascimento} onChange={set} confidence={confidence} />

            {/* Município: locked if book provides it */}
            {selectedLivro?.municipio
              ? <LockedField label="Município" value={form.municipio} hint="do livro" />
              : <Field label="Município" name="municipio" value={form.municipio} onChange={set} confidence={confidence} />
            }

            {/* Estado: locked if book provides it */}
            {selectedLivro?.estado
              ? <LockedField label="Estado (UF)" value={form.estado} hint="do livro" />
              : <Field label="Estado (UF)" name="estado" value={form.estado} onChange={set} confidence={confidence} />
            }
          </div>

          <Field label="Observações" name="observacoes" value={form.observacoes} onChange={set} confidence={confidence} textarea />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 pb-6">
          <button type="button" onClick={() => navigate(backUrl)}
            className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Salvar Registro'}
          </button>
        </div>
      </form>
    </div>
  );
}
