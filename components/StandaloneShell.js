'use client';

import { useState, useEffect, useCallback } from 'react';
import { ImageStudio, VideoStudio, LipSyncStudio, CinemaStudio } from 'studio';
import ApiKeyModal from './ApiKeyModal';

const TABS = [
  { id: 'image',   label: 'Image Studio' },
  { id: 'video',   label: 'Video Studio' },
  { id: 'lipsync', label: 'Lip Sync' },
  { id: 'cinema',  label: 'Cinema Studio' },
];

const STORAGE_KEY = 'muapi_key';
const APIMART_STORAGE_KEY = 'apimart_key';

export default function StandaloneShell() {
  const [apiKey, setApiKey] = useState(null);
  const [apimartKey, setApimartKey] = useState('');
  const [editingKeys, setEditingKeys] = useState(false);
  const [activeTab, setActiveTab] = useState('image');
  const [showSettings, setShowSettings] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY) || '';
    const storedApimart = localStorage.getItem(APIMART_STORAGE_KEY) || '';
    if (stored || storedApimart) setApiKey(stored);
    setApimartKey(storedApimart);
    if (!stored && storedApimart) setActiveTab('video');
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

  const handleKeyChange = useCallback(() => {
    setEditingKeys(true);
  }, []);

  if (!hasMounted) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <div className="animate-spin text-[#d9ff00] text-3xl">◌</div>
    </div>
  );

  if (apiKey === null || editingKeys) {
    return <ApiKeyModal onSave={handleKeySave} initialKeys={{ muapi: apiKey || '', apimart: apimartKey }} />;
  }

  const needsMuapi = !apiKey && activeTab !== 'video';

  return (
    <div className="h-screen bg-[#050505] flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 pt-4 pb-0 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="text-white font-black text-lg tracking-wider uppercase">
            Open Higgsfield AI
          </span>
        </div>

        {/* Tabs */}
        <nav className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#d9ff00] text-black'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          className="text-white/40 hover:text-white text-sm transition-colors"
        >
          ⚙ Settings
        </button>
      </header>

      {/* Studio Content */}
      <div className="flex-1">
        {needsMuapi ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
            <p className="text-white/60 text-sm max-w-sm">
              This studio runs on Muapi models. Add a Muapi key in Settings, or use Seedance 2.5 via APIMart in Video Studio.
            </p>
            <button
              onClick={() => setActiveTab('video')}
              className="px-4 py-2 rounded-lg bg-[#d9ff00] text-black text-sm font-bold"
            >
              Open Video Studio
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'image'   && <ImageStudio   apiKey={apiKey} />}
            {activeTab === 'video'   && <VideoStudio   apiKey={apiKey} apimartKey={apimartKey} />}
            {activeTab === 'lipsync' && <LipSyncStudio apiKey={apiKey} />}
            {activeTab === 'cinema'  && <CinemaStudio  apiKey={apiKey} />}
          </>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#111] border border-white/10 rounded-2xl p-8 w-full max-w-md">
            <h2 className="text-white font-bold text-xl mb-6">Settings</h2>
            <p className="text-white/50 text-sm mb-2">
              APIMart key: <span className="text-white/80 font-mono">{apimartKey ? `${apimartKey.slice(0, 6)}••••••••` : 'not set'}</span>
            </p>
            <p className="text-white/50 text-sm mb-4">
              Muapi key: <span className="text-white/80 font-mono">{apiKey ? `${apiKey.slice(0, 6)}••••••••` : 'not set'}</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleKeyChange}
                className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm transition-colors"
              >
                Change API Keys
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 py-2 rounded-lg bg-white/5 text-white hover:bg-white/10 text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
