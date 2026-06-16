import { useState, useEffect, useCallback } from 'react';
import { configApi } from '../api.js';
import {
  Settings, Save, Loader2,
  CheckCircle2, XCircle, AlertCircle, RefreshCw,
  Download, Package,
} from 'lucide-react';

function StatusBadge({ ok, label }) {
  if (ok === null || ok === undefined) return null;
  return ok
    ? <span className="inline-flex items-center gap-1 text-green-400 text-sm"><CheckCircle2 className="w-4 h-4" />{label}</span>
    : <span className="inline-flex items-center gap-1 text-red-400 text-sm"><XCircle className="w-4 h-4" />{label}</span>;
}

function ModelRow({ name, installed, pulling, onInstall, installing }) {
  const isPulling = pulling || installing;
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="font-mono text-sm text-slate-300">{name}</span>
      <div className="flex items-center gap-2">
        {installed
          ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="w-3.5 h-3.5" />instalado</span>
          : isPulling
            ? <span className="flex items-center gap-1 text-xs text-blue-400 animate-pulse"><Loader2 className="w-3.5 h-3.5 animate-spin" />instalando…</span>
            : <>
                <span className="flex items-center gap-1 text-xs text-yellow-400"><AlertCircle className="w-3.5 h-3.5" />não instalado</span>
                <button
                  onClick={() => onInstall(name)}
                  className="flex items-center gap-1 px-2 py-0.5 bg-blue-700 hover:bg-blue-600 rounded text-xs text-white transition-colors"
                >
                  <Download className="w-3 h-3" />Instalar
                </button>
              </>
        }
      </div>
    </div>
  );
}

export default function Config() {
  const [podId,   setPodId]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  const [validating,    setValidating]    = useState(false);
  const [validation,    setValidation]    = useState(null);
  const [installing,    setInstalling]    = useState({}); // model -> true

  const [catalog,       setCatalog]       = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [installMsg,    setInstallMsg]    = useState(null);

  useEffect(() => {
    configApi.get().then(d => setPodId(d.pod_id || '')).catch(() => {});
    configApi.catalog().then(d => {
      setCatalog(d.models || []);
      setSelectedModel(d.models?.[0]?.name || '');
    }).catch(() => {});
  }, []);

  const handleValidate = useCallback(async () => {
    setValidating(true);
    try {
      const r = await configApi.validate();
      setValidation(r);
    } catch (err) {
      setValidation({ error: err.message });
    } finally {
      setValidating(false);
    }
  }, []);

  // Auto-refresh validation every 15s if any model is pulling
  useEffect(() => {
    if (!validation) return;
    const anyPulling = (validation.models_pulling?.length > 0) || Object.values(installing).some(Boolean);
    if (!anyPulling) return;
    const id = setInterval(handleValidate, 15000);
    return () => clearInterval(id);
  }, [validation, installing, handleValidate]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await configApi.save(podId.trim());
      setSaveMsg({ ok: true, text: `Salvo! URL Ollama: ${r.ollama_url}` });
      setValidation(null);
    } catch (err) {
      setSaveMsg({ ok: false, text: err?.response?.data?.error || err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleInstall(modelName) {
    setInstalling(p => ({ ...p, [modelName]: true }));
    setInstallMsg(null);
    try {
      await configApi.installModel(modelName);
      setInstallMsg({ ok: true, text: `Instalação de "${modelName}" iniciada. Pode levar 10–30 min dependendo do tamanho.` });
      // Refresh validation to show pulling state
      setTimeout(handleValidate, 2000);
    } catch (err) {
      setInstallMsg({ ok: false, text: err?.response?.data?.error || err.message });
      setInstalling(p => ({ ...p, [modelName]: false }));
    }
  }

  async function handleInstallFromCatalog() {
    if (!selectedModel) return;
    await handleInstall(selectedModel);
  }

  const podStatusLabel = { RUNNING: 'Ligado', EXITED: 'Desligado', UNKNOWN: 'Desconhecido', ERROR: 'Erro ao consultar' };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Settings className="w-6 h-6 text-blue-400" />
        <h1 className="text-xl font-semibold text-white">Configurações</h1>
      </div>

      {/* Pod ID */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">RunPod</h2>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">ID do Pod</label>
            <input
              type="text"
              value={podId}
              onChange={e => { setPodId(e.target.value); setSaveMsg(null); }}
              placeholder="ex: k0vwks9huazlyg"
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white
                         font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              URL gerada: https://<span className="text-slate-400">{podId || '…'}</span>-11434.proxy.runpod.net
            </p>
          </div>
          {saveMsg && (
            <div className={`flex items-start gap-2 text-sm px-3 py-2 rounded-lg ${
              saveMsg.ok ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'
            }`}>
              {saveMsg.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              <span>{saveMsg.text}</span>
            </div>
          )}
          <button type="submit" disabled={saving || !podId.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                       rounded-lg text-sm font-medium text-white transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </form>
      </div>

      {/* Validate */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Validação</h2>
          <button onClick={handleValidate} disabled={validating}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50
                       rounded-lg text-sm text-white transition-colors">
            {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {validating ? 'Verificando…' : 'Verificar agora'}
          </button>
        </div>

        {!validation && !validating && (
          <p className="text-sm text-slate-500">Clique em "Verificar agora" para checar o status do pod, Ollama e os modelos de IA.</p>
        )}

        {validation?.error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <XCircle className="w-4 h-4" /><span>{validation.error}</span>
          </div>
        )}

        {validation && !validation.error && (
          <div className="space-y-4">
            {/* Overall */}
            <div className={`flex items-center gap-3 p-3 rounded-lg ${
              validation.ok ? 'bg-green-900/20 border border-green-700/30' : 'bg-yellow-900/20 border border-yellow-700/30'
            }`}>
              {validation.ok
                ? <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                : <AlertCircle  className="w-5 h-5 text-yellow-400 flex-shrink-0" />}
              <span className={`font-medium ${validation.ok ? 'text-green-300' : 'text-yellow-300'}`}>
                {validation.ok ? 'Tudo certo! Sistema pronto para processar.' : 'Atenção: alguns itens precisam de ajuste.'}
              </span>
            </div>

            {/* Pod */}
            <div className="space-y-1">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Pod RunPod</p>
              <div className="flex items-center gap-2">
                <StatusBadge ok={validation.pod_status === 'RUNNING'} label={podStatusLabel[validation.pod_status] ?? validation.pod_status} />
                {validation.pod_error && <span className="text-xs text-slate-500">({validation.pod_error})</span>}
              </div>
            </div>

            {/* Ollama */}
            <div className="space-y-1">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Ollama</p>
              <StatusBadge ok={validation.ollama_ok} label={validation.ollama_ok ? 'Acessível' : 'Inacessível'} />
              <p className="text-xs text-slate-500 font-mono mt-0.5">{validation.ollama_url}</p>
              {validation.ollama_error && <p className="text-xs text-red-400 mt-0.5">{validation.ollama_error}</p>}
            </div>

            {/* Required models */}
            <div className="space-y-1">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Modelos necessários</p>
              <div className="bg-black/20 rounded-lg px-3 py-1">
                {validation.models_required.map(m => (
                  <ModelRow
                    key={m}
                    name={m}
                    installed={!validation.models_missing.includes(m)}
                    pulling={validation.models_pulling?.includes(m)}
                    installing={installing[m]}
                    onInstall={handleInstall}
                  />
                ))}
              </div>
              {(validation.models_pulling?.length > 0) && (
                <p className="text-xs text-blue-400 flex items-center gap-1 mt-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Instalação em andamento — verificando a cada 15s automaticamente
                </p>
              )}
            </div>

            {/* All installed models */}
            {validation.models_installed.length > 0 && (
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer hover:text-slate-300 transition-colors">
                  Ver todos os modelos instalados ({validation.models_installed.length})
                </summary>
                <div className="mt-2 font-mono space-y-0.5 pl-2">
                  {validation.models_installed.map(m => <div key={m}>{m}</div>)}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Install additional models */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Instalar modelo de IA</h2>
        </div>

        {installMsg && (
          <div className={`flex items-start gap-2 text-sm px-3 py-2 rounded-lg ${
            installMsg.ok ? 'bg-blue-900/30 text-blue-300' : 'bg-red-900/30 text-red-300'
          }`}>
            {installMsg.ok ? <Download className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <span>{installMsg.text}</span>
          </div>
        )}

        <div className="space-y-3">
          {catalog.map(m => {
            const isPulling = validation?.models_pulling?.includes(m.name);
            const isInstalled = validation?.models_installed?.some(a => a === m.name || a.startsWith(m.name.split(':')[0] + ':'));
            const isInstalling = installing[m.name];

            return (
              <div key={m.name} className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 font-medium">{m.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>
                  <p className="text-xs text-slate-600 font-mono mt-0.5">{m.name}</p>
                </div>
                <div className="flex-shrink-0">
                  {isInstalled
                    ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="w-3.5 h-3.5" />instalado</span>
                    : (isPulling || isInstalling)
                      ? <span className="flex items-center gap-1 text-xs text-blue-400 animate-pulse"><Loader2 className="w-3.5 h-3.5 animate-spin" />instalando…</span>
                      : <button onClick={() => handleInstall(m.name)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded-lg text-xs text-white font-medium transition-colors">
                          <Download className="w-3.5 h-3.5" />Instalar
                        </button>
                  }
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-slate-600">
          A instalação ocorre em segundo plano no pod RunPod. Clique em "Verificar agora" para acompanhar o progresso.
        </p>
      </div>

      {/* About */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Sobre</h2>
        <div className="space-y-1 text-sm text-slate-400">
          <div className="flex justify-between">
            <span>Versão</span><span className="text-slate-300">1.1</span>
          </div>
          <div className="flex justify-between">
            <span>Modelos padrão</span>
            <span className="text-slate-300 font-mono text-xs">qwen2.5vl:7b · minicpm-v · llama3.2-vision</span>
          </div>
        </div>
      </div>
    </div>
  );
}
