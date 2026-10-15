'use client';

// Live APIMart balance in the top bar. Refreshes every minute while the tab
// is visible, when the tab regains focus, and whenever a generation is sent
// or finishes (BALANCE_REFRESH_EVENT).

import { useCallback, useEffect, useRef, useState } from 'react';
import { LuWallet, LuRefreshCw, LuExternalLink } from 'react-icons/lu';
import { getApimartBalance, BALANCE_REFRESH_EVENT } from '@/packages/studio/src/apimart';

const REFRESH_MS = 60_000;
const LOW_BALANCE_USD = 2;

const usd = (v) => `$${v.toFixed(2)}`;

export default function WalletBadge({ apimartKey, onNeedKey }) {
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!apimartKey) return;
    setLoading(true);
    try {
      setBalance(await getApimartBalance(apimartKey));
      setError(null);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apimartKey]);

  useEffect(() => {
    if (!apimartKey) { setBalance(null); return undefined; }
    refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, REFRESH_MS);
    const onFocus = () => refresh();
    const onEvent = () => setTimeout(refresh, 1500);
    window.addEventListener('focus', onFocus);
    window.addEventListener(BALANCE_REFRESH_EVENT, onEvent);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(BALANCE_REFRESH_EVENT, onEvent);
    };
  }, [apimartKey, refresh]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!apimartKey) {
    return (
      <button type="button" onClick={onNeedKey} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/10 text-[13px] text-white/70">
        <LuWallet size={14} />Conectar APIMart
      </button>
    );
  }

  const low = balance && !balance.unlimited && balance.remaining < LOW_BALANCE_USD;
  const label = error && !balance ? 'Saldo indisponível'
    : !balance ? '…'
    : balance.unlimited ? 'Ilimitado'
    : usd(balance.remaining);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="Saldo da APIMart"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold tabular-nums transition-colors ${low ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25' : 'bg-white/[0.06] text-white hover:bg-white/10'}`}
      >
        <LuWallet size={14} className={low ? '' : 'text-[#d9ff00]'} />
        {label}
        {loading && <LuRefreshCw size={11} className="animate-spin text-white/40" />}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 bg-[#18181b] border border-white/10 rounded-2xl p-4 shadow-2xl space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-white/60">Carteira APIMart</p>
            <button type="button" onClick={refresh} disabled={loading} aria-label="Atualizar saldo" className="text-white/50 hover:text-white disabled:opacity-40">
              <LuRefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          {balance ? (
            <>
              <div>
                <p className={`text-2xl font-black tabular-nums ${low ? 'text-red-300' : 'text-white'}`}>{balance.unlimited ? 'Ilimitado' : usd(balance.remaining)}</p>
                <p className="text-[11px] text-white/40">disponível{balance.scope === 'key' ? ' nesta chave' : ' na conta'}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-xl bg-white/[0.04] p-2">
                  <p className="text-white/40">Já usado</p>
                  <p className="text-white font-semibold tabular-nums">{usd(balance.used)}</p>
                </div>
                <div className="rounded-xl bg-white/[0.04] p-2">
                  <p className="text-white/40">Créditos</p>
                  <p className="text-white font-semibold tabular-nums">{balance.unlimited ? '∞' : Math.round(balance.remainingCredits).toLocaleString('pt-BR')}</p>
                </div>
              </div>
              {low && <p className="text-[11px] text-red-300">Saldo baixo. Recarregue para não interromper as gerações.</p>}
            </>
          ) : (
            <p className="text-sm text-white/60">{error || 'Carregando…'}</p>
          )}
          {error && balance && <p className="text-[11px] text-white/40">Última leitura falhou: {error}</p>}
          <a href="https://apimart.ai" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-[#d9ff00] text-black text-xs font-bold">
            Recarregar créditos <LuExternalLink size={12} />
          </a>
          {updatedAt && <p className="text-[10px] text-white/30 text-center">Atualizado às {updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · atualiza a cada minuto</p>}
        </div>
      )}
    </div>
  );
}
