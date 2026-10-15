'use client';

import { useState } from 'react';

export default function ApiKeyModal({ onSave, onCancel, initialKeys = {} }) {
  const [muapiKey, setMuapiKey] = useState(initialKeys.muapi || '');
  const [apimartKey, setApimartKey] = useState(initialKeys.apimart || '');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const keys = { muapi: muapiKey.trim(), apimart: apimartKey.trim() };
    if (!keys.muapi && !keys.apimart) { setError('Informe pelo menos uma chave'); return; }
    onSave(keys);
  };

  const inputClass = 'w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-[#d9ff00]/40 transition-colors';

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl p-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-[#d9ff00]/10 rounded-2xl flex items-center justify-center border border-[#d9ff00]/20 mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d9ff00" strokeWidth="1.5">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L12 17.25l-4.5-4.5L15.5 7.5z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white uppercase tracking-wider mb-2">
            Open Higgsfield AI
          </h1>
          <p className="text-white/40 text-sm">
            Cole a chave da <a href="https://apimart.ai/keys" target="_blank" rel="noreferrer" className="text-[#d9ff00] hover:underline">APIMart</a> para
            usar o Seedance 2.5, a da <a href="https://muapi.ai" target="_blank" rel="noreferrer" className="text-[#d9ff00] hover:underline">Muapi</a> para
            os demais modelos, ou as duas
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
              Chave APIMart <span className="normal-case tracking-normal font-medium text-white/30">· Seedance 2.5</span>
            </label>
            <input
              type="password"
              value={apimartKey}
              onChange={(e) => { setApimartKey(e.target.value); setError(''); }}
              placeholder="sk-..."
              className={inputClass}
              suppressHydrationWarning
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
              Chave Muapi <span className="normal-case tracking-normal font-medium text-white/30">· demais modelos</span>
            </label>
            <input
              type="password"
              value={muapiKey}
              onChange={(e) => { setMuapiKey(e.target.value); setError(''); }}
              placeholder="Cole sua chave..."
              className={inputClass}
              suppressHydrationWarning
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            className="w-full bg-[#d9ff00] text-black font-black py-3 rounded-xl hover:opacity-90 transition-opacity"
            suppressHydrationWarning
          >
            Abrir estúdio
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full py-3 rounded-xl bg-white/5 text-white/70 hover:bg-white/10 text-sm transition-colors"
            >
              Cancelar
            </button>
          )}

          <p className="text-center text-xs text-white/30">
            As chaves ficam salvas só neste navegador.
          </p>
        </form>
      </div>
    </div>
  );
}
