import { useState, useEffect, useCallback } from 'react';
import { configApi } from '../api.js';
import {
  Settings, Save, Loader2,
  CheckCircle2, XCircle, AlertCircle, RefreshCw,
  Download, Package, Cpu, Globe,
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

  // External API provider
  const [provider,    setProvider]    = useState('ollama');
  const [extTipo,     setExtTipo]     = useState('generico');
  const [extUrl,      setExtUrl]      = useState('');
  const [extModel,    setExtModel]    = useState('');
  const [extKey,      setExtKey]      = useState('');
  const [extKeySet,   setExtKeySet]   = useState(false);
  const [savingExt,   setSavingExt]   = useState(false);
  const [saveExtMsg,  setSaveExtMsg]  = useState(null);

  const MODELOS_POR_TIPO = {
    openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    anthropic: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
    deepseek:  ['deepseek-chat', 'deepseek-reasoner', 'deepseek-vl2'],
    generico:  [],
  };
  const TIPO_HINTS = {
    openai:    { endpoint: 'https://api.openai.com/v1', link: 'https://platform.openai.com/api-keys', linkLabel: 'platform.openai.com' },
    anthropic: { endpoint: 'https://api.anthropic.com/v1', link: 'https://console.anthropic.com', linkLabel: 'console.anthropic.com' },
    deepseek:  { endpoint: 'https://api.deepseek.com/v1', link: 'https://platform.deepseek.com', linkLabel: 'platform.deepseek.com' },
    generico:  null,
  };
  const modeloIsCustom = MODELOS_POR_TIPO[extTipo]?.length > 0 && !MODELOS_POR_TIPO[extTipo].includes(extModel);

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
    configApi.get().then(d => {
      setPodId(d.pod_id || '');
      setActiveModel(d.active_model || 'qwen2.5vl:7b');
      setProvider(d.provider || 'ollama');
      setExtTipo(d.ext_tipo || 'generico');
      setExtUrl(d.ext_url || '');
      setExtModel(d.ext_model || '');
      setExtKeySet(d.ext_key_set || false);
    }).catch(() => {});
    configApi.catalog().then(d => setCatalog(d.models || [])).catch(() => {});
    handleValidate(); // auto-valida ao abrir a página
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleSwitchProvider(p) {
    setProvider(p);
    setSaveExtMsg(null);
    try {
      await configApi.saveProvider({ ai_provider: p });
      setValidation(null);
      setTimeout(handleValidate, 300);
    } catch (e) {
      console.error('Erro ao salvar provider:', e.message);
    }
  }

  async function handleSaveExtConfig(e) {
    e.preventDefault();
    setSavingExt(true);
    setSaveExtMsg(null);
    try {
      const payload = {
        ai_provider:       'openai',
        ai_external_tipo:  extTipo,
        ai_external_url:   extUrl.trim(),
        ai_external_model: extModel.trim(),
      };
      if (extKey.trim()) payload.ai_external_key = extKey.trim();
      await configApi.saveProvider(payload);
      setSaveExtMsg({ ok: true, text: 'Configuração salva com sucesso.' });
      setExtKeySet(true);
      setExtKey('');
      setValidation(null);
      setTimeout(handleValidate, 300);
    } catch (err) {
      setSaveExtMsg({ ok: false, text: err?.response?.data?.error || err.message });
    } finally {
      setSavingExt(false);
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

      {/* AI Provider */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-slate-500" />
          <SectionTitle>Provedor de IA</SectionTitle>
        </div>

        <div className="space-y-2 mb-4">
          {[
            { value: 'ollama', label: 'Ollama (RunPod)', desc: 'Modelos rodando no seu pod RunPod — sem custo por chamada' },
            { value: 'openai', label: 'API Externa',     desc: 'DeepSeek, OpenAI, Together AI — qualquer API compatível com OpenAI' },
          ].map(opt => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                provider === opt.value ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="provider"
                value={opt.value}
                checked={provider === opt.value}
                onChange={() => handleSwitchProvider(opt.value)}
                className="accent-blue-600 mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-slate-800">{opt.label}</p>
                <p className="text-xs text-slate-500">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {provider === 'openai' && (
          <form onSubmit={handleSaveExtConfig} className="space-y-3 border-t border-slate-200 pt-4">

            {/* Tipo do provedor */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Provedor</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'openai',    label: 'OpenAI' },
                  { value: 'anthropic', label: 'Anthropic' },
                  { value: 'deepseek',  label: 'DeepSeek' },
                  { value: 'generico',  label: 'Genérico (OpenAI-compatível)' },
                ].map(opt => (
                  <label key={opt.value}
                    className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer text-sm transition-colors ${
                      extTipo === opt.value ? 'border-blue-400 bg-blue-50 text-blue-800' : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input type="radio" name="extTipo" value={opt.value} checked={extTipo === opt.value}
                      onChange={() => { setExtTipo(opt.value); setExtModel(MODELOS_POR_TIPO[opt.value]?.[0] || ''); setExtKeySet(false); }}
                      className="accent-blue-600" />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Hint para provedores conhecidos */}
            {TIPO_HINTS[extTipo] && (
              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 space-y-0.5">
                <p>Endpoint: <code className="bg-white border border-slate-200 px-1 rounded font-mono">{TIPO_HINTS[extTipo].endpoint}</code></p>
                <p>Gere sua chave em <a href={TIPO_HINTS[extTipo].link} target="_blank" rel="noopener noreferrer"
                  className="underline text-blue-600 hover:text-blue-800">{TIPO_HINTS[extTipo].linkLabel}</a></p>
              </div>
            )}

            {/* URL base — só para Genérico */}
            {extTipo === 'generico' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">URL Base</label>
                <input type="text" value={extUrl} onChange={e => setExtUrl(e.target.value)}
                  placeholder="https://api.meu-provedor.com/v1"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono placeholder-slate-400
                             focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 bg-white" />
              </div>
            )}

            {/* Modelo */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Modelo</label>
              {MODELOS_POR_TIPO[extTipo]?.length > 0 ? (
                <>
                  <select
                    value={modeloIsCustom ? '__custom__' : extModel}
                    onChange={e => {
                      if (e.target.value === '__custom__') setExtModel('');
                      else setExtModel(e.target.value);
                    }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                  >
                    {MODELOS_POR_TIPO[extTipo].map(m => <option key={m} value={m}>{m}</option>)}
                    <option value="__custom__">Personalizado...</option>
                  </select>
                  {modeloIsCustom && (
                    <input autoFocus type="text" value={extModel} onChange={e => setExtModel(e.target.value)}
                      placeholder="nome-do-modelo"
                      className="mt-1.5 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono placeholder-slate-400
                                 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white" />
                  )}
                </>
              ) : (
                <input type="text" value={extModel} onChange={e => setExtModel(e.target.value)}
                  placeholder="nome-do-modelo"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono placeholder-slate-400
                             focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 bg-white" />
              )}
            </div>

            {/* Chave API */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Chave API</label>
              <input type="password" value={extKey} onChange={e => setExtKey(e.target.value)}
                placeholder={extKeySet ? '(chave já salva — deixe em branco para manter)' : 'sk-…'}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono placeholder-slate-400
                           focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 bg-white" />
              {extKeySet && !extKey && (
                <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />Chave configurada
                </p>
              )}
            </div>

            {saveExtMsg && (
              <div className={`flex items-start gap-2 text-sm px-3 py-2.5 rounded-lg border ${
                saveExtMsg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                {saveExtMsg.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                <span>{saveExtMsg.text}</span>
              </div>
            )}

            <button type="submit"
              disabled={savingExt || !extModel.trim() || (extTipo === 'generico' && !extUrl.trim())}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50
                         rounded-lg text-sm font-medium text-white transition-colors"
            >
              {savingExt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </button>
          </form>
        )}
      </Card>

      {/* Pod ID */}
      <Card className={provider === 'openai' ? 'opacity-50 pointer-events-none' : ''}>
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

            {/* Pod — only for Ollama */}
            {validation.provider !== 'openai' && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pod RunPod</p>
                <div className="flex items-center gap-2">
                  <StatusBadge ok={validation.pod_status === 'RUNNING'} label={podStatusLabel[validation.pod_status] ?? validation.pod_status} />
                  {validation.pod_error && <span className="text-xs text-slate-400">({validation.pod_error})</span>}
                </div>
              </div>
            )}

            {/* Ollama / External API */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {validation.provider === 'openai' ? 'API Externa' : 'Ollama'}
              </p>
              <div className="space-y-1">
                <StatusBadge ok={validation.ollama_ok} label={validation.ollama_ok ? 'Acessível' : 'Inacessível'} />
                <p className="text-xs text-slate-400 font-mono">{validation.ollama_url}</p>
                {validation.ollama_error && <p className="text-xs text-red-600">{validation.ollama_error}</p>}
              </div>
            </div>

            {/* Required models — only for Ollama */}
            {validation.provider !== 'openai' && (
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
            )}

            {/* All installed — only for Ollama */}
            {validation.provider !== 'openai' && validation.models_installed.length > 0 && (
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

      {/* Active model selector — only for Ollama */}
      {provider === 'ollama' && <Card>
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

        {validating && !validation && (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />Verificando modelos instalados…
          </div>
        )}

        {(validation || !validating) && (
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
            {catalog.map(m => {
              const isInstalled = validation?.models_installed?.some(
                a => a === m.name || a.startsWith(m.name.split(':')[0] + ':')
              );
              const isPulling  = validation?.models_pulling?.includes(m.name) || installing[m.name];
              const pullError  = validation?.pull_errors?.[m.name];
              const isActive   = activeModel === m.name || (!activeModel && m.name === 'qwen2.5vl:7b');
              const canSelect  = isInstalled && !savingModel && !!validation;

              return (
                <label
                  key={m.name}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                    canSelect ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed'
                  } ${isActive && isInstalled ? 'bg-blue-50' : ''}`}
                >
                  <input
                    type="radio"
                    name="active_model"
                    value={m.name}
                    checked={isActive}
                    disabled={!canSelect}
                    onChange={() => handleSaveModel(m.name)}
                    className="accent-blue-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-medium ${isInstalled ? 'text-slate-800' : 'text-slate-400'}`}>{m.label}</span>
                      {isActive && isInstalled && (
                        <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-medium">ativo</span>
                      )}
                      {isInstalled && !isActive && (
                        <span className="text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full border border-green-200">instalado</span>
                      )}
                      {isPulling && (
                        <span className="text-xs text-blue-600 flex items-center gap-1 animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" />instalando…
                        </span>
                      )}
                      {!isInstalled && !isPulling && validation && (
                        <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">não instalado</span>
                      )}
                      {pullError && (
                        <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200" title={pullError}>falha na instalação</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{m.name}</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {savingModel && (
          <p className="text-xs text-blue-600 flex items-center gap-1 mt-3">
            <Loader2 className="w-3 h-3 animate-spin" />Salvando modelo…
          </p>
        )}
      </Card>}

      {/* Install additional models — only for Ollama */}
      {provider === 'ollama' && <Card>
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
            const isPulling    = validation?.models_pulling?.includes(m.name);
            const isInstalled  = validation?.models_installed?.some(
              a => a === m.name || a.startsWith(m.name.split(':')[0] + ':')
            );
            const isInstalling = installing[m.name];
            const pullError    = validation?.pull_errors?.[m.name];

            return (
              <div key={m.name} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{m.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{m.name}</p>
                  {pullError && (
                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                      <XCircle className="w-3 h-3 flex-shrink-0" />
                      Erro: {pullError.length > 80 ? pullError.slice(0, 80) + '…' : pullError}
                    </p>
                  )}
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
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white font-medium transition-colors ${
                            pullError
                              ? 'bg-amber-600 hover:bg-amber-700'
                              : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          <Download className="w-3.5 h-3.5" />{pullError ? 'Tentar novamente' : 'Instalar'}
                        </button>
                  }
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-slate-400 mt-3">
          A instalação ocorre no pod RunPod em segundo plano (pode levar 10–30 min dependendo do modelo).
        </p>
      </Card>}

      {/* About */}
      <Card>
        <SectionTitle>Sobre</SectionTitle>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Versão</span>
            <span className="text-slate-800 font-medium">1.1</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Provedor</span>
            <span className="text-slate-800 font-medium">{provider === 'openai' ? 'API Externa' : 'Ollama (RunPod)'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Modelo ativo</span>
            <span className="text-slate-800 font-mono text-xs">
              {provider === 'openai' ? (extModel || '—') : (activeModel || 'qwen2.5vl:7b')}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
