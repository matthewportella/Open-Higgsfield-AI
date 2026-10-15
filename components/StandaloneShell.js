'use client';

import { useState, useEffect, useCallback } from 'react';
import { ImageStudio, VideoStudio, LipSyncStudio, CinemaStudio } from 'studio';
import {
  LuImage, LuVideo, LuMic, LuClapperboard, LuSettings, LuPanelLeftClose,
  LuPanelLeftOpen, LuWallet, LuX, LuSparkles,
} from 'react-icons/lu';
import ApiKeyModal from './ApiKeyModal';

const TABS = [
  { id: 'video',   label: 'Vídeo',    hint: 'Seedance 2.5 e mais', icon: LuVideo,        provider: 'both' },
  { id: 'image',   label: 'Imagem',   hint: 'Flux, Nano Banana…',  icon: LuImage,        provider: 'muapi' },
  { id: 'cinema',  label: 'Cinema',   hint: 'Câmera e lentes',      icon: LuClapperboard, provider: 'muapi' },
  { id: 'lipsync', label: 'Lip Sync', hint: 'Fala sincronizada',    icon: LuMic,          provider: 'muapi' },
];

const STORAGE_KEY = 'muapi_key';
const APIMART_STORAGE_KEY = 'apimart_key';
const SIDEBAR_KEY = 'sidebar_collapsed';

function mask(key) {
  return key ? `${key.slice(0, 6)}••••••••` : 'não conectada';
}

function StatusDot({ on }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${on ? 'bg-[#d9ff00] shadow-[0_0_8px_#d9ff00]' : 'bg-white/20'}`} />;
}

export default function StandaloneShell() {
  const [apiKey, setApiKey] = useState(null);
  const [apimartKey, setApimartKey] = useState('');
  const [editingKeys, setEditingKeys] = useState(false);
  const [activeTab, setActiveTab] = useState('video');
  const [showSettings, setShowSettings] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY) || '';
    const storedApimart = localStorage.getItem(APIMART_STORAGE_KEY) || '';
    if (stored || storedApimart) setApiKey(stored);
    setApimartKey(storedApimart);
    setCollapsed(localStorage.getItem(SIDEBAR_KEY) === '1');
  }, []);

  const handleKeySave = useCallback(({ muapi, apimart }) => {
    if (muapi) localStorage.setItem(STORAGE_KEY, muapi); else localStorage.removeItem(STORAGE_KEY);
    if (apimart) localStorage.setItem(APIMART_STORAGE_KEY, apimart); else localStorage.removeItem(APIMART_STORAGE_KEY);
    setApiKey(muapi);
    setApimartKey(apimart);
    setEditingKeys(false);
    setShowSettings(false);
    if (!muapi) setActiveTab('video');
  }, []);

  const toggleSidebar = useCallback(() => {
    setCollapsed((current) => {
      localStorage.setItem(SIDEBAR_KEY, current ? '0' : '1');
      return !current;
    });
  }, []);

  if (!hasMounted) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <div className="animate-spin text-[#d9ff00] text-3xl">◌</div>
    </div>
  );

  if (apiKey === null || editingKeys) {
    return (
      <ApiKeyModal
        onSave={handleKeySave}
        onCancel={apiKey === null ? undefined : () => setEditingKeys(false)}
        initialKeys={{ muapi: apiKey || '', apimart: apimartKey }}
      />
    );
  }

  const needsMuapi = !apiKey && activeTab !== 'video';
  const active = TABS.find((tab) => tab.id === activeTab);

  return (
    <div className="h-screen bg-[#050505] flex flex-col md:flex-row overflow-hidden text-white">
      {/* Sidebar (desktop) */}
      <aside
        className={`hidden md:flex flex-col flex-shrink-0 m-2 mr-0 rounded-2xl bg-[#0c0c0e] border border-white/[0.06] transition-[width] duration-200 ${collapsed ? 'w-[68px]' : 'w-[240px]'}`}
      >
        <div className={`flex items-center h-14 px-3 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-lg bg-[#d9ff00] flex items-center justify-center flex-shrink-0">
                <LuSparkles className="text-black" size={16} />
              </span>
              <span className="font-black text-[13px] tracking-wide uppercase truncate">Open Higgsfield</span>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          >
            {collapsed ? <LuPanelLeftOpen size={18} /> : <LuPanelLeftClose size={18} />}
          </button>
        </div>

        <nav className="flex-1 px-2 pt-2 space-y-1 overflow-y-auto custom-scrollbar" aria-label="Estúdios">
          {!collapsed && <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">Criar</p>}
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = tab.id === activeTab;
            const locked = tab.provider === 'muapi' && !apiKey;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                title={collapsed ? tab.label : undefined}
                aria-current={selected ? 'page' : undefined}
                className={`w-full flex items-center gap-3 rounded-xl transition-colors ${collapsed ? 'justify-center h-11' : 'px-3 py-2.5'} ${selected ? 'bg-white/[0.08] text-white' : 'text-white/55 hover:text-white hover:bg-white/[0.04]'}`}
              >
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${selected ? 'bg-[#d9ff00] text-black' : 'bg-white/[0.05]'}`}>
                  <Icon size={16} />
                </span>
                {!collapsed && (
                  <span className="flex-1 min-w-0 text-left">
                    <span className="block text-sm font-semibold leading-tight">{tab.label}</span>
                    <span className="block text-[11px] text-white/35 truncate">{locked ? 'Precisa da chave Muapi' : tab.hint}</span>
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-2 space-y-1 border-t border-white/[0.06]">
          {!collapsed && (
            <div className="px-3 py-2 space-y-1.5 text-[12px]">
              <div className="flex items-center justify-between text-white/50"><span>APIMart</span><StatusDot on={Boolean(apimartKey)} /></div>
              <div className="flex items-center justify-between text-white/50"><span>Muapi</span><StatusDot on={Boolean(apiKey)} /></div>
            </div>
          )}
          <a
            href="https://apimart.ai"
            target="_blank"
            rel="noreferrer"
            title={collapsed ? 'Recarregar créditos' : undefined}
            className={`flex items-center gap-3 rounded-xl text-white/55 hover:text-white hover:bg-white/[0.04] transition-colors ${collapsed ? 'justify-center h-11' : 'px-3 py-2.5'}`}
          >
            <LuWallet size={18} />
            {!collapsed && <span className="text-sm font-medium">Recarregar créditos</span>}
          </a>
          <button
            onClick={() => setShowSettings(true)}
            title={collapsed ? 'Configurações' : undefined}
            className={`w-full flex items-center gap-3 rounded-xl text-white/55 hover:text-white hover:bg-white/[0.04] transition-colors ${collapsed ? 'justify-center h-11' : 'px-3 py-2.5'}`}
          >
            <LuSettings size={18} />
            {!collapsed && <span className="text-sm font-medium">Configurações</span>}
          </button>
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-[#d9ff00] flex items-center justify-center"><LuSparkles className="text-black" size={14} /></span>
          <span className="font-black text-xs tracking-wide uppercase">{active?.label}</span>
        </div>
        <button onClick={() => setShowSettings(true)} aria-label="Configurações" className="w-9 h-9 rounded-lg flex items-center justify-center text-white/60 hover:bg-white/5">
          <LuSettings size={18} />
        </button>
      </header>

      {/* Workspace */}
      <main className="flex-1 min-w-0 min-h-0 md:m-2 md:rounded-2xl md:border md:border-white/[0.06] bg-[#050505] overflow-hidden relative">
        {needsMuapi ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
            <span className="w-14 h-14 rounded-2xl bg-white/[0.05] flex items-center justify-center">
              {active && <active.icon size={24} className="text-white/60" />}
            </span>
            <p className="text-white/60 text-sm max-w-sm">
              O estúdio de {active?.label} usa modelos da Muapi. Adicione uma chave da Muapi em Configurações, ou use o Seedance 2.5 pela APIMart no estúdio de Vídeo.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setActiveTab('video')} className="px-4 py-2 rounded-xl bg-[#d9ff00] text-black text-sm font-bold">Ir para Vídeo</button>
              <button onClick={() => setEditingKeys(true)} className="px-4 py-2 rounded-xl bg-white/[0.06] text-white text-sm font-semibold hover:bg-white/10">Adicionar chave</button>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto custom-scrollbar">
            {activeTab === 'image'   && <ImageStudio   apiKey={apiKey} />}
            {activeTab === 'video'   && <VideoStudio   apiKey={apiKey} apimartKey={apimartKey} />}
            {activeTab === 'lipsync' && <LipSyncStudio apiKey={apiKey} />}
            {activeTab === 'cinema'  && <CinemaStudio  apiKey={apiKey} />}
          </div>
        )}
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="md:hidden flex-shrink-0 grid grid-cols-4 border-t border-white/[0.06] bg-[#0c0c0e]" aria-label="Estúdios">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = tab.id === activeTab;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${selected ? 'text-[#d9ff00]' : 'text-white/45'}`}>
              <Icon size={18} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Settings */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={() => setShowSettings(false)}>
          <div className="bg-[#0c0c0e] border border-white/10 rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg">Configurações</h2>
              <button onClick={() => setShowSettings(false)} aria-label="Fechar" className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:bg-white/5"><LuX size={18} /></button>
            </div>
            <div className="space-y-2 mb-5">
              <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">APIMart</p>
                  <p className="text-xs text-white/40">Seedance 2.5</p>
                </div>
                <span className="text-xs font-mono text-white/70 flex items-center gap-2"><StatusDot on={Boolean(apimartKey)} />{mask(apimartKey)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">Muapi</p>
                  <p className="text-xs text-white/40">Demais modelos</p>
                </div>
                <span className="text-xs font-mono text-white/70 flex items-center gap-2"><StatusDot on={Boolean(apiKey)} />{mask(apiKey)}</span>
              </div>
            </div>
            <button
              onClick={() => { setShowSettings(false); setEditingKeys(true); }}
              className="w-full py-2.5 rounded-xl bg-[#d9ff00] text-black font-bold text-sm hover:opacity-90"
            >
              Alterar chaves
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
