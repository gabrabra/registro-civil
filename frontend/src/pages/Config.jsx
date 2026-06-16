import { useState, useEffect, useCallback } from 'react';
import { configApi } from '../api.js';
import {
  Settings, Save, Loader2,
  CheckCircle2, XCircle, AlertCircle, RefreshCw,
  Download, Package, Cpu,
} from 'lucide-react';

function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-6 ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">{children}</h2>;
}

function StatusBadge({ ok, label }) {
  if (ok === null || ok === undefined) return null;
  return ok
    ? <span className="inline-flex items-center gap-1.5 text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full text-xs font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />{label}
      </span>
    : <span className="inline-flex items-center gap-1.5 text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full text-xs font-medium">
        <XCircle className="w-3.5 h-3.5" />{label}
      </span>;
}

function ModelRow({ name, installed, pulling, onInstall, installing }) {
  const isPulling = pulling || installing;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <span className="font-mono text-sm text-slate-700">{name}</span>
      <div className="flex items-center gap-2">
        {installed
          ? <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
              <CheckCircle2 className="w-3 h-3" />instalado
            </span>
          : isPulling
            ? <span className="flex items-center gap-1 text-xs text-blue-700 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />instalando…
              </span>
            : <>
                <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  <AlertCircle className="w-3 h-3" />não instalado
                </span>
                <button
                  onClick={() => onInstall(name)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs text-white font-medium transition-colors"
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

  const [activeModel,    setActiveModel]    = useState('');
  const [savingModel,    setSavingModel]    = useState(false);
  const [saveModelMsg,   setSaveModelMsg]   = useState(null);

  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState(null);
  const [installing, setInstalling] = useState({});

  const [catalog,    setCatalog]    = useState([]);
  const [installMsg, setInstallMsg] = useState(null);

  useEffect(() => {
    configApi.get().then(d => {
      setPodId(d.pod_id || '');
      setActiveModel(d.active_model || 'qwen2.5vl:7b');
    }).catch(() => {});
    configApi.catalog().then(d => setCatalog(d.models || [])).catch(() => {});
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
      setSaveMsg({ ok: true, text: `Salvo! URL: ${r.ollama_url}` });
      setValidation(null);
    } catch (err) {
      setSaveMsg({ ok: false, text: err?.response?.data?.error || err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveModel(modelName) {
    setSavingModel(true);
    setSaveModelMsg(null);
    try {
      await configApi.saveModel(modelName);
      setActiveModel(modelName);
      setSaveModelMsg({ ok: true, text: `Modelo "${modelName}" definido para processamento.` });
    } catch (err) {
      setSaveModelMsg({ ok: false, text: err?.response?.data?.error || err.message });
    } finally {
      setSavingModel(false);
    }
  }

  async function handleInstall(modelName) {
    setInstalling(p => ({ ...p, [modelName]: true }));
    setInstallMsg(null);
    try {
      await configApi.installModel(modelName);
      setInstallMsg({ ok: true, text: `Instalação de "${modelName}" iniciada. Pode levar 10–30 min.` });
      setTimeout(handleValidate, 2000);
    } catch (err) {
      setInstallMsg({ ok: false, text: err?.response?.data?.error || err.message });
      setInstalling(p => ({ ...p, [modelName]: false }));
    }
  }

  const podStatusLabel = {
    RUNNING: 'Ligado', EXITED: 'Desligado', UNKNOWN: 'Desconhecido', ERROR: 'Erro',
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page title */}
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-blue-600" />
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Configurações</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gerencie o pod RunPod e os modelos de IA</p>
        </div>
      </div>

      {/* Pod ID */}
      <Card>
        <SectionTitle>RunPod</SectionTitle>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">ID do Pod</label>
            <input
              type="text"
              value={podId}
              onChange={e => { setPodId(e.target.value); setSaveMsg(null); }}
              placeholder="ex: k0vwks9huazlyg"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900
                         font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 bg-white"
            />
            <p className="text-xs text-slate-400 mt-1.5">
              URL Ollama: https://<span className="text-slate-600 font-mono">{podId || '…'}</span>-11434.proxy.runpod.net
            </p>
          </div>

          {saveMsg && (
            <div className={`flex items-start gap-2 text-sm px-3 py-2.5 rounded-lg border ${
              saveMsg.ok
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              {saveMsg.ok
                ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                : <XCircle      className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              <span>{saveMsg.text}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !podId.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50
                       rounded-lg text-sm font-medium text-white transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </form>
      </Card>

      {/* Validate */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>Validação do sistema</SectionTitle>
          <button
            onClick={handleValidate}
            disabled={validating}
            className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 hover:border-slate-400 hover:bg-slate-50
                       disabled:opacity-50 rounded-lg text-sm text-slate-700 font-medium transition-colors"
          >
            {validating ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <RefreshCw className="w-4 h-4" />}
            {validating ? 'Verificando…' : 'Verificar agora'}
          </button>
        </div>

        {!validation && !validating && (
          <p className="text-sm text-slate-500">
            Clique em "Verificar agora" para checar o status do pod, Ollama e os modelos de IA.
          </p>
        )}

        {validation?.error && (
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2.5 rounded-lg">
            <XCircle className="w-4 h-4 flex-shrink-0" />{validation.error}
          </div>
        )}

        {validation && !validation.error && (
          <div className="space-y-5">
            {/* Overall status */}
            <div className={`flex items-center gap-3 p-3.5 rounded-lg border ${
              validation.ok
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              {validation.ok
                ? <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-green-600" />
                : <AlertCircle  className="w-5 h-5 flex-shrink-0 text-amber-600" />}
              <span className="font-medium text-sm">
                {validation.ok ? 'Tudo certo! Sistema pronto para processar.' : 'Atenção: alguns itens precisam de ajuste.'}
              </span>
            </div>

            {/* Pod */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pod RunPod</p>
              <div className="flex items-center gap-2">
                <StatusBadge ok={validation.pod_status === 'RUNNING'} label={podStatusLabel[validation.pod_status] ?? validation.pod_status} />
                {validation.pod_error && <span className="text-xs text-slate-400">({validation.pod_error})</span>}
              </div>
            </div>

            {/* Ollama */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ollama</p>
              <div className="space-y-1">
                <StatusBadge ok={validation.ollama_ok} label={validation.ollama_ok ? 'Acessível' : 'Inacessível'} />
                <p className="text-xs text-slate-400 font-mono">{validation.ollama_url}</p>
                {validation.ollama_error && <p className="text-xs text-red-600">{validation.ollama_error}</p>}
              </div>
            </div>

            {/* Required models */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Modelos necessários</p>
              <div className="border border-slate-200 rounded-lg px-4 py-1 bg-slate-50">
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
                <p className="text-xs text-blue-600 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Instalação em andamento — verificando a cada 15s automaticamente
                </p>
              )}
            </div>

            {/* All installed */}
            {validation.models_installed.length > 0 && (
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer hover:text-slate-700 transition-colors font-medium">
                  Ver todos os modelos instalados ({validation.models_installed.length})
                </summary>
                <div className="mt-2 font-mono space-y-0.5 pl-3 text-slate-600">
                  {validation.models_installed.map(m => <div key={m}>{m}</div>)}
                </div>
              </details>
            )}
          </div>
        )}
      </Card>

      {/* Active model selector */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="w-4 h-4 text-slate-500" />
          <SectionTitle>Modelo de processamento</SectionTitle>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Escolha qual modelo de IA será usado ao processar registros. Apenas modelos instalados podem ser selecionados.
        </p>

        {saveModelMsg && (
          <div className={`flex items-start gap-2 text-sm px-3 py-2.5 rounded-lg border mb-4 ${
            saveModelMsg.ok
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {saveModelMsg.ok
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              : <XCircle      className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <span>{saveModelMsg.text}</span>
          </div>
        )}

        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
          {catalog.map(m => {
            const isInstalled = validation?.models_installed?.some(
              a => a === m.name || a.startsWith(m.name.split(':')[0] + ':')
            );
            const isActive = activeModel === m.name ||
              (!activeModel && m.name === 'qwen2.5vl:7b');

            return (
              <label
                key={m.name}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                  isInstalled ? 'hover:bg-slate-50' : 'opacity-50 cursor-not-allowed'
                } ${isActive ? 'bg-blue-50' : ''}`}
              >
                <input
                  type="radio"
                  name="active_model"
                  value={m.name}
                  checked={isActive}
                  disabled={!isInstalled || savingModel}
                  onChange={() => handleSaveModel(m.name)}
                  className="accent-blue-600"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{m.label}</span>
                    {isActive && (
                      <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-medium">ativo</span>
                    )}
                    {!isInstalled && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">não instalado</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{m.name}</p>
                </div>
              </label>
            );
          })}
        </div>

        {!validation && (
          <p className="text-xs text-slate-400 mt-3">
            Clique em "Verificar agora" na seção de validação para ver quais modelos estão instalados.
          </p>
        )}
        {savingModel && (
          <p className="text-xs text-blue-600 flex items-center gap-1 mt-3">
            <Loader2 className="w-3 h-3 animate-spin" />Salvando modelo…
          </p>
        )}
      </Card>

      {/* Install additional models */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-4 h-4 text-slate-500" />
          <SectionTitle>Instalar modelos adicionais</SectionTitle>
        </div>

        {installMsg && (
          <div className={`flex items-start gap-2 text-sm px-3 py-2.5 rounded-lg border mb-4 ${
            installMsg.ok
              ? 'bg-blue-50 border-blue-200 text-blue-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {installMsg.ok
              ? <Download className="w-4 h-4 mt-0.5 flex-shrink-0" />
              : <XCircle  className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <span>{installMsg.text}</span>
          </div>
        )}

        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
          {catalog.map(m => {
            const isPulling   = validation?.models_pulling?.includes(m.name);
            const isInstalled = validation?.models_installed?.some(
              a => a === m.name || a.startsWith(m.name.split(':')[0] + ':')
            );
            const isInstalling = installing[m.name];

            return (
              <div key={m.name} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{m.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{m.name}</p>
                </div>
                <div className="flex-shrink-0">
                  {isInstalled
                    ? <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2.5 py-1 rounded-full border border-green-200 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />instalado
                      </span>
                    : (isPulling || isInstalling)
                      ? <span className="flex items-center gap-1 text-xs text-blue-600 animate-pulse">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />instalando…
                        </span>
                      : <button
                          onClick={() => handleInstall(m.name)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs text-white font-medium transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />Instalar
                        </button>
                  }
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-slate-400 mt-3">
          A instalação ocorre no pod RunPod em segundo plano. Clique em "Verificar agora" para acompanhar.
        </p>
      </Card>

      {/* About */}
      <Card>
        <SectionTitle>Sobre</SectionTitle>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Versão</span>
            <span className="text-slate-800 font-medium">1.1</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Modelo ativo</span>
            <span className="text-slate-800 font-mono text-xs">{activeModel || 'qwen2.5vl:7b'}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
