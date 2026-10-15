'use client';

import { useState, useEffect, useCallback } from 'react';
import { ImageStudio, LipSyncStudio, CinemaStudio } from 'studio';
import VideoWorkspace from './video/VideoWorkspace';
import {
  LuImage, LuVideo, LuMic, LuClapperboard, LuSettings, LuX, LuSparkles,
} from 'react-icons/lu';
import ApiKeyModal from './ApiKeyModal';
import WalletBadge from './WalletBadge';

const TABS = [
  { id: 'video',   label: 'Vídeo',    hint: 'Seedance 2.5 e mais', icon: LuVideo,        provider: 'both' },
  { id: 'image',   label: 'Imagem',   hint: 'Flux, Nano Banana…',  icon: LuImage,        provider: 'muapi' },
  { id: 'cinema',  label: 'Cinema',   hint: 'Câmera e lentes',      icon: LuClapperboard, provider: 'muapi' },
  { id: 'lipsync', label: 'Lip Sync', hint: 'Fala sincronizada',    icon: LuMic,          provider: 'muapi' },
];

const STORAGE_KEY = 'muapi_key';
const APIMART_STORAGE_KEY = 'apimart_key';

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
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY) || '';
    const storedApimart = localStorage.getItem(APIMART_STORAGE_KEY) || '';
    if (stored || storedApimart) setApiKey(stored);
    setApimartKey(storedApimart);
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
    <div className="h-screen bg-[#050505] flex flex-col overflow-hidden text-white">
      {/* Top navigation */}
      <header className="flex-shrink-0 h-12 flex items-center gap-4 px-3 sm:px-4 border-b border-white/[0.06] bg-[#050505]">
        <span className="w-7 h-7 rounded-lg bg-[#d9ff00] flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <LuSparkles className="text-black" size={14} />
        </span>
        <nav className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar" aria-label="Estúdios">
          {TABS.map((tab) => {
            const selected = tab.id === activeTab;
            const locked = tab.provider === 'muapi' && !apiKey;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={selected ? 'page' : undefined}
                title={locked ? 'Precisa da chave Muapi' : tab.hint}
                className={`px-2.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${selected ? 'text-[#d9ff00]' : locked ? 'text-white/30 hover:text-white/60' : 'text-white/55 hover:text-white'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
        <div className="flex items-center gap-1 flex-shrink-0">
          <WalletBadge apimartKey={apimartKey} onNeedKey={() => setEditingKeys(true)} />
          <button onClick={() => setShowSettings(true)} aria-label="Configurações" className="w-8 h-8 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/5">
            <LuSettings size={17} />
          </button>
        </div>
      </header>

      {/* Workspace */}
      <main className="flex-1 min-w-0 min-h-0 overflow-hidden relative">
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
        ) : activeTab === 'video' ? (
          <VideoWorkspace apimartKey={apimartKey} onNeedKey={() => setEditingKeys(true)} />
        ) : (
          <div className="h-full overflow-y-auto custom-scrollbar">
            {activeTab === 'image'   && <ImageStudio   apiKey={apiKey} />}
            {activeTab === 'lipsync' && <LipSyncStudio apiKey={apiKey} />}
            {activeTab === 'cinema'  && <CinemaStudio  apiKey={apiKey} />}
          </div>
        )}
      </main>

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
