import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Save, Loader2, X, Sparkles, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { livrosApi, processLivroApi } from '../../api.js';

const EMPTY = {
  numero: '', cartorio: '', cnpj: '', cns: '',
  termo_inicio: '', termo_fim: '',
  data_inicio: '', data_fim: '',
  municipio: '', estado: '', descricao: ''
};

function Field({ label, name, value, onChange, placeholder = '', required, type = 'text', hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type} name={name} value={value ?? ''} onChange={onChange}
        required={required} placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-colors"
      />
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function CoverReader({ onExtracted }) {
  const [file,       setFile]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [status,     setStatus]     = useState(null); // 'ok' | 'error'
  const [drag,       setDrag]       = useState(false);
  const inputRef = useRef();

  function handleFile(f) {
    if (!f || !/image\/(jpeg|png|webp|tiff)/.test(f.type)) {
      return alert('Use JPG, PNG, TIFF ou WEBP para a capa.');
    }
    setFile(f);
    setStatus(null);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setStatus(null);
    try {
      const data = await processLivroApi.cover(file);
      if (data.erro) {
        setStatus('error');
      } else {
        onExtracted(data);
        setStatus('ok');
      }
    } catch {
      setStatus('error');
    } finally {
      setLoading(false);
    }
  }

  const preview = file ? URL.createObjectURL(file) : null;

  return (
    <div className="space-y-3">
      {/* Dropzone */}
      {!file ? (
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            drag ? 'border-violet-500 bg-violet-50' : 'border-slate-300 hover:border-violet-400 hover:bg-slate-50'
          }`}
        >
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          <Upload className="w-7 h-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Arraste a foto da capa aqui</p>
          <p className="text-xs text-slate-400 mt-0.5">ou clique para selecionar (JPG, PNG, TIFF)</p>
        </div>
      ) : (
        <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
          <img src={preview} alt="capa" className="h-20 w-14 object-cover rounded-lg border border-slate-200 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
            <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
          {!loading && (
            <button onClick={() => { setFile(null); setStatus(null); }} className="text-slate-400 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Analyze button */}
      {file && (
        <button
          type="button"
          onClick={analyze}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-medium transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? 'Lendo capa com IA...' : 'Ler Dados da Capa com IA'}
        </button>
      )}

      {status === 'ok' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200 text-green-700 text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          Campos preenchidos! Revise e ajuste se necessário.
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Não foi possível ler os dados. Tente outra imagem ou preencha manualmente.
        </div>
      )}
    </div>
  );
}

export default function LivrosForm() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const isEdit   = Boolean(id);

  const [form,        setForm]        = useState(EMPTY);
  const [saving,      setSaving]      = useState(false);
  const [toast,       setToast]       = useState(null);
  const [showReader,  setShowReader]  = useState(!isEdit);

  useEffect(() => {
    if (!isEdit) return;
    livrosApi.get(id).then(r => {
      setForm({
        numero:       r.numero       || '',
        cartorio:     r.cartorio     || '',
        cnpj:         r.cnpj         || '',
        cns:          r.cns          || '',
        termo_inicio: r.termo_inicio != null ? String(r.termo_inicio) : '',
        termo_fim:    r.termo_fim    != null ? String(r.termo_fim)    : '',
        data_inicio:  r.data_inicio  ? r.data_inicio.slice(0, 10) : '',
        data_fim:     r.data_fim     ? r.data_fim.slice(0, 10)    : '',
        municipio:    r.municipio    || '',
        estado:       r.estado       || '',
        descricao:    r.descricao    || '',
      });
    }).catch(() => setToast({ msg: 'Erro ao carregar livro', type: 'error' }));
  }, [id]);

  function set(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  function handleExtracted(data) {
    setForm(prev => ({
      ...prev,
      numero:       data.numero       || prev.numero,
      cartorio:     data.cartorio     || prev.cartorio,
      cnpj:         data.cnpj         || prev.cnpj,
      cns:          data.cns          || prev.cns,
      termo_inicio: data.termo_inicio != null ? String(data.termo_inicio) : prev.termo_inicio,
      termo_fim:    data.termo_fim    != null ? String(data.termo_fim)    : prev.termo_fim,
      data_inicio:  data.data_inicio  || prev.data_inicio,
      data_fim:     data.data_fim     || prev.data_fim,
      municipio:    data.municipio    || prev.municipio,
      estado:       data.estado       || prev.estado,
    }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) await livrosApi.update(id, form);
      else        await livrosApi.create(form);
      navigate('/livros');
    } catch (err) {
      setToast({ msg: `Erro ao salvar: ${err.response?.data?.error || err.message}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {toast.msg}
          <button onClick={() => setToast(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/livros')} className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{isEdit ? 'Editar Livro' : 'Novo Livro'}</h1>
          <p className="text-sm text-slate-500">Acervo de Registro Civil</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">

        {/* Leitura de capa por IA */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowReader(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              <span className="text-sm font-semibold text-slate-700">Ler Capa do Livro com IA</span>
              <span className="text-xs text-slate-400 font-normal">— preenche os campos automaticamente</span>
            </div>
            <span className="text-xs text-slate-400">{showReader ? '▲ fechar' : '▼ abrir'}</span>
          </button>
          {showReader && (
            <div className="px-5 pb-5 border-t border-slate-100 pt-4">
              <CoverReader onExtracted={handleExtracted} />
            </div>
          )}
        </div>

        {/* Identificação */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-2">Identificação</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Número do Livro" name="numero" value={form.numero} onChange={set} required placeholder="ex: A-74" hint="Número ou código do livro" />
            <Field label="CNS" name="cns" value={form.cns} onChange={set} placeholder="ex: 07410-4" />
          </div>
          <Field label="Nome do Cartório" name="cartorio" value={form.cartorio} onChange={set}
            placeholder="ex: Cartório de Registro Civil das Pessoas Naturais de Paulista" />
          <Field label="CNPJ" name="cnpj" value={form.cnpj} onChange={set} placeholder="ex: 29.138.710.0001-64" />
        </div>

        {/* Termos e Datas */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-2">Termos e Período</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Termo Inicial" name="termo_inicio" value={form.termo_inicio} onChange={set} type="number" placeholder="ex: 30921" />
            <Field label="Termo Final"   name="termo_fim"    value={form.termo_fim}    onChange={set} type="number" placeholder="ex: 34118" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Data Inicial" name="data_inicio" value={form.data_inicio} onChange={set} type="date" />
            <Field label="Data Final"   name="data_fim"    value={form.data_fim}    onChange={set} type="date" />
          </div>
        </div>

        {/* Localização */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-2">Localização</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Field label="Município" name="municipio" value={form.municipio} onChange={set} placeholder="ex: Paulista" />
            </div>
            <Field label="Estado (UF)" name="estado" value={form.estado} onChange={set} placeholder="ex: PE" />
          </div>
        </div>

        {/* Observações */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-2 mb-4">Observações</h2>
          <textarea name="descricao" value={form.descricao} onChange={set} rows={3}
            placeholder="Informações adicionais sobre o livro..."
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-colors" />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 pb-6">
          <button type="button" onClick={() => navigate('/livros')}
            className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Salvar Livro'}
          </button>
        </div>
      </form>
    </div>
  );
}
