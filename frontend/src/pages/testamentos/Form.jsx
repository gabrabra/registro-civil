import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Upload, Sparkles, AlertTriangle, CheckCircle, ChevronLeft, Save, Loader2, FileText, X, BookOpen, Plus } from 'lucide-react';
import { testamentosApi, processApi, livrosApi } from '../../api.js';

const EMPTY = {
  livro_id: '', testador: '', data_testamento: '', ano: '', livro: '', folha: '',
  tabeliao: '', testemunhas: '', municipio: '', estado: '', observacoes: ''
};

function Field({ label, name, value, onChange, confidence, error, textarea, required, className = '' }) {
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
      {textarea ? <textarea rows={3} {...inputProps} /> : <input type="text" {...inputProps} />}
      {isLow && <p className="flex items-center gap-1 mt-1 text-xs text-red-600"><AlertTriangle className="w-3 h-3" /> Confiança baixa — verifique este campo</p>}
      {isMed && <p className="flex items-center gap-1 mt-1 text-xs text-amber-600"><AlertTriangle className="w-3 h-3" /> Confiança média — confirme o valor</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function MultiDropZone({ files, onAddFiles, onRemove, uploading }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef();

  function handle(fileList) {
    const valid = Array.from(fileList).filter(f =>
      /image\/(jpeg|png|webp|tiff)|application\/pdf/.test(f.type)
    );
    if (!valid.length) { alert('Formato não suportado. Use JPG, PNG, TIFF, WEBP ou PDF.'); return; }
    onAddFiles(valid);
  }

  return (
    <div className="space-y-2">
      {files.map((f, i) => {
        const preview = !f.type.includes('pdf') ? URL.createObjectURL(f) : null;
        return (
          <div key={i} className="border border-blue-200 bg-blue-50 rounded-xl p-3 flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400 w-5 text-center flex-shrink-0">p{i + 1}</span>
            {preview
              ? <img src={preview} alt={`pg ${i + 1}`} className="h-14 w-14 object-cover rounded-lg border border-slate-200 flex-shrink-0" />
              : <div className="h-14 w-14 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0"><FileText className="w-6 h-6 text-slate-400" /></div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{f.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{(f.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            {!uploading && (
              <button type="button" onClick={() => onRemove(i)} className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      })}

      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl text-center transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${drag ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'} ${files.length ? 'p-4' : 'p-8'}`}
      >
        <input ref={inputRef} type="file" accept="image/*,.pdf" multiple className="hidden" onChange={e => handle(e.target.files)} />
        {files.length === 0 ? (
          <>
            <Upload className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">Arraste as páginas do documento aqui</p>
            <p className="text-xs text-slate-400 mt-1">ou clique para selecionar (pode selecionar múltiplos arquivos)</p>
            <p className="text-xs text-slate-300 mt-2">JPG, PNG, TIFF, WEBP ou PDF — até 50 MB por arquivo</p>
          </>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <Plus className="w-4 h-4" />
            Adicionar mais páginas
          </div>
        )}
      </div>

      {files.length > 1 && (
        <p className="text-xs text-blue-600 flex items-center gap-1.5">
          <CheckCircle className="w-3 h-3" />
          {files.length} páginas selecionadas — a IA analisará todas como um único documento
        </p>
      )}
    </div>
  );
}

export default function TestamentosForm() {
  const { id }         = useParams();
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const isEdit         = Boolean(id);

  const [form,       setForm]       = useState({ ...EMPTY, livro_id: searchParams.get('livro_id') || '' });
  const [livros,     setLivros]     = useState([]);
  const [confidence, setConfidence] = useState({});
  const [files,      setFiles]      = useState([]);
  const [fileUrls,   setFileUrls]   = useState([]);
  const [processing, setProcessing] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [errors,     setErrors]     = useState({});
  const [toast,      setToast]      = useState(null);
  const [aiDone,     setAiDone]     = useState(false);

  useEffect(() => { livrosApi.list().then(setLivros).catch(() => {}); }, []);

  useEffect(() => {
    if (!isEdit) return;
    testamentosApi.get(id).then(r => {
      setForm({
        livro_id:        r.livro_id        ? String(r.livro_id) : '',
        testador:        r.testador        || '',
        data_testamento: r.data_testamento || '',
        ano:             r.ano             ? String(r.ano) : '',
        livro:           r.livro           || '',
        folha:           r.folha           || '',
        tabeliao:        r.tabeliao        || '',
        testemunhas:     r.testemunhas     || '',
        municipio:       r.municipio       || '',
        estado:          r.estado          || '',
        observacoes:     r.observacoes     || '',
      });
      const urls = r.arquivos_urls || (r.arquivo_url ? [r.arquivo_url] : []);
      setFileUrls(urls);
    }).catch(() => setToast({ msg: 'Erro ao carregar registro', type: 'error' }));
  }, [id]);

  function set(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setErrors(er => ({ ...er, [name]: '' }));
  }

  function addFiles(newFiles) {
    setFiles(prev => [...prev, ...newFiles]);
    setAiDone(false);
    setConfidence({});
  }

  function removeFile(index) {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setAiDone(false);
  }

  async function handleProcess() {
    if (!files.length) return;
    setProcessing(true);
    setAiDone(false);
    try {
      const data = await processApi.file(files, form.livro_id || null, 'testamento');
      const reg  = data.registros?.[0] || {};
      const conf = reg.confianca || 'baixa';
      const perField = {};
      for (const k of Object.keys(EMPTY)) perField[k] = conf;

      setForm(prev => ({
        ...prev,
        testador:        reg.testador        || '',
        data_testamento: reg.data_testamento || '',
        ano:             reg.ano             ? String(reg.ano) : '',
        livro:           reg.livro           || '',
        folha:           reg.folha           || '',
        tabeliao:        reg.tabeliao        || '',
        testemunhas:     reg.testemunhas     || '',
        municipio:       reg.municipio       || '',
        estado:          reg.estado          || '',
        observacoes:     reg.observacoes     || '',
        _arquivo_path:  data.arquivo_path,
        _arquivo_nome:  data.arquivo_nome,
        _arquivo_tipo:  data.arquivo_tipo,
        _arquivo_url:   data.arquivo_url,
        _arquivos_urls: data.arquivos_urls,
      }));
      setConfidence(perField);
      setFileUrls(data.arquivos_urls || (data.arquivo_url ? [data.arquivo_url] : []));
      setAiDone(true);
      setToast(data.ai_error
        ? { msg: `IA indisponível: ${data.ai_error_detail || 'Modelos falharam'} — preencha manualmente`, type: 'error' }
        : { msg: `Dados extraídos de ${files.length} página(s)! Revise e salve.`, type: 'success' }
      );
    } catch (e) {
      setToast({ msg: `Erro ao processar: ${e.message}`, type: 'error' });
    } finally {
      setProcessing(false);
    }
  }

  function validate() {
    const e = {};
    if (!form.testador?.trim()) e.testador = 'Obrigatório';
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
        arquivo_path:  form._arquivo_path  || null,
        arquivo_nome:  form._arquivo_nome  || null,
        arquivo_tipo:  form._arquivo_tipo  || null,
        arquivos_urls: form._arquivos_urls || null,
      };
      delete payload._arquivo_path; delete payload._arquivo_nome;
      delete payload._arquivo_tipo; delete payload._arquivo_url;
      delete payload._arquivos_urls;
      if (isEdit) await testamentosApi.update(id, payload);
      else        await testamentosApi.create(payload);
      const livroId = searchParams.get('livro_id');
      navigate(livroId ? `/testamentos?livro_id=${livroId}` : '/testamentos');
    } catch (err) {
      setToast({ msg: `Erro ao salvar: ${err.message}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const backUrl = searchParams.get('livro_id')
    ? `/testamentos?livro_id=${searchParams.get('livro_id')}`
    : '/testamentos';

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
            {isEdit ? 'Editar Testamento' : 'Novo Registro de Testamento'}
          </h1>
          <p className="text-sm text-slate-500">Registro Civil</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Livro */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-slate-400" />
            Livro de Registro
          </h2>
          <select name="livro_id" value={form.livro_id} onChange={set}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
            <option value="">— Sem vínculo com livro —</option>
            {livros.map(l => (
              <option key={l.id} value={l.id}>
                Livro {l.numero}{l.cartorio ? ` — ${l.cartorio.slice(0, 50)}` : ''}{l.municipio ? ` (${l.municipio}/${l.estado})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Upload */}
        {!isEdit && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Páginas do Documento</h2>
            <MultiDropZone files={files} onAddFiles={addFiles} onRemove={removeFile} uploading={processing} />
            {files.length > 0 && !processing && (
              <button type="button" onClick={handleProcess}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors">
                <Sparkles className="w-4 h-4" />
                Transcrever com IA{files.length > 1 ? ` (${files.length} páginas)` : ''}
              </button>
            )}
            {processing && (
              <div className="mt-3 flex items-center gap-3 py-3 px-4 bg-violet-50 rounded-lg border border-violet-200">
                <Loader2 className="w-5 h-5 text-violet-600 animate-spin flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-violet-800">IA processando {files.length} página(s)... (pode levar 40–90 s)</p>
                  <p className="text-xs text-violet-600 mt-0.5">Aguarde — IA analisando o documento completo</p>
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

        {isEdit && fileUrls.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 mb-2">
              {fileUrls.length > 1 ? `${fileUrls.length} páginas anexadas` : 'Documento anexado'}
            </p>
            <div className="space-y-1">
              {fileUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm">
                  <FileText className="w-4 h-4" /> {fileUrls.length > 1 ? `Página ${i + 1}` : 'Abrir documento'}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Fields */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-2">Dados do Testamento</h2>

          <Field label="Testador (Nome do Testador)" name="testador" value={form.testador} onChange={set} confidence={confidence} error={errors.testador} required />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Data do Testamento" name="data_testamento" value={form.data_testamento} onChange={set} confidence={confidence} className="col-span-2" />
            <Field label="Ano" name="ano" value={form.ano} onChange={set} confidence={confidence} />
            <div />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Livro" name="livro" value={form.livro} onChange={set} confidence={confidence} />
            <Field label="Folha" name="folha" value={form.folha} onChange={set} confidence={confidence} />
            <Field label="Município" name="municipio" value={form.municipio} onChange={set} confidence={confidence} />
            <Field label="Estado (UF)" name="estado" value={form.estado} onChange={set} confidence={confidence} />
          </div>

          <Field label="Tabelião" name="tabeliao" value={form.tabeliao} onChange={set} confidence={confidence} />
          <Field label="Testemunhas" name="testemunhas" value={form.testemunhas} onChange={set} confidence={confidence} textarea />
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
