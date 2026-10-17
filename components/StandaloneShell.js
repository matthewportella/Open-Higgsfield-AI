'use client';

// App frame: e-mail/password login, then the studios. Engine API keys live
// on the server (APIs area), and the creation history is shared by the team.

import { useState, useEffect, useCallback } from 'react';
import { ImageStudio, LipSyncStudio, CinemaStudio } from 'studio';
import {
  LuImage, LuVideo, LuMic, LuClapperboard, LuSparkles, LuKeyRound, LuLogOut, LuUser,
} from 'react-icons/lu';
import VideoWorkspace from './video/VideoWorkspace';
import WalletBadge from './WalletBadge';
import LoginScreen from './LoginScreen';
import StudioSettings from './StudioSettings';
import { supabaseBrowser, apiFetch, accessToken } from '@/lib/supabase/browser';

const TABS = [
  { id: 'video',   label: 'Vídeo',    icon: LuVideo,        engine: 'apimart' },
  { id: 'image',   label: 'Imagem',   icon: LuImage,        engine: 'muapi' },
  { id: 'cinema',  label: 'Cinema',   icon: LuClapperboard, engine: 'muapi' },
  { id: 'lipsync', label: 'Lip Sync', icon: LuMic,          engine: 'muapi' },
];

function Spinner() {
  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <div className="animate-spin text-[#d9ff00] text-3xl">◌</div>
    </div>
  );
}

function NewPasswordScreen({ onDone }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    if (password.length < 6) { setError('A senha precisa ter pelo menos 6 caracteres.'); return; }
    const { error: err } = await supabaseBrowser().auth.updateUser({ password });
    if (err) setError(err.message); else onDone();
  };
  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4">
      <form onSubmit={save} className="w-full max-w-sm space-y-3 bg-[#0c0c0e] border border-white/[0.08] rounded-3xl p-6">
        <h1 className="text-xl font-black text-white">Crie uma nova senha</h1>
        <label htmlFor="reset-password" className="sr-only">Nova senha</label>
        <input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nova senha (mín. 6)" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-[#d9ff00]/50" />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" className="w-full bg-[#d9ff00] text-black font-black py-3 rounded-xl">Salvar senha</button>
      </form>
    </div>
  );
}

function NotInvited({ email }) {
  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4 text-center">
      <div className="max-w-sm space-y-4">
        <h1 className="text-xl font-black text-white">Acesso não liberado</h1>
        <p className="text-sm text-white/60">O e-mail <b className="text-white">{email}</b> não faz parte da equipe deste estúdio. Peça ao dono para liberar seu acesso.</p>
        <button type="button" onClick={() => supabaseBrowser().auth.signOut()} className="px-4 py-2.5 rounded-xl bg-white/[0.08] text-white text-sm">Sair</button>
      </div>
    </div>
  );
}

export default function StandaloneShell() {
  const supabase = supabaseBrowser();
  const [session, setSession] = useState(undefined); // undefined = loading
  const [member, setMember] = useState(undefined);
  const [recovering, setRecovering] = useState(false);
  const [activeTab, setActiveTab] = useState('video');
  const [settingsSection, setSettingsSection] = useState('engines');
  const [engines, setEngines] = useState(null);
  const [muapiKey, setMuapiKey] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  // auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  const email = session?.user?.email?.toLowerCase() || '';

  // membership (invite list)
  useEffect(() => {
    if (!session) { setMember(undefined); return; }
    let cancelled = false;
    supabase.from('members').select('email, role').eq('email', email).maybeSingle()
      .then(({ data }) => { if (!cancelled) setMember(data || null); });
    return () => { cancelled = true; };
  }, [session, email, supabase]);

  const reloadEngines = useCallback(async () => {
    try { setEngines(await apiFetch('/api/engines')); } catch { setEngines({ role: member?.role, engines: [] }); }
  }, [member?.role]);

  useEffect(() => { if (member) reloadEngines(); }, [member, reloadEngines]);

  const engineOn = (id) => Boolean(engines?.engines?.find((e) => e.id === id && e.enabled && e.configured));

  // The Muapi studios call Muapi from the browser, so fetch the team key while logged in.
  useEffect(() => {
    if (!member || !engineOn('muapi')) { setMuapiKey(''); return; }
    apiFetch('/api/engines/muapi/key').then((r) => setMuapiKey(r.key || '')).catch(() => setMuapiKey(''));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member, engines]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = () => setMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpen]);

  if (session === undefined) return <Spinner />;
  if (recovering && session) return <NewPasswordScreen onDone={() => setRecovering(false)} />;
  if (!session) return <LoginScreen />;
  if (member === undefined) return <Spinner />;
  if (member === null) return <NotInvited email={email} />;

  const openSettings = (section) => { setSettingsSection(section); setActiveTab('settings'); setMenuOpen(false); };
  const active = TABS.find((t) => t.id === activeTab);
  const needsEngine = active && engines && !engineOn(active.engine);

  return (
    <div className="h-screen bg-[#050505] flex flex-col overflow-hidden text-white">
      <header className="flex-shrink-0 h-12 flex items-center gap-4 px-3 sm:px-4 border-b border-white/[0.06] bg-[#050505]">
        <span className="w-7 h-7 rounded-lg bg-[#d9ff00] flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <LuSparkles className="text-black" size={14} />
        </span>
        <nav className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar" aria-label="Estúdios">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-current={tab.id === activeTab ? 'page' : undefined}
              className={`px-2.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${tab.id === activeTab ? 'text-[#d9ff00]' : engines && !engineOn(tab.engine) ? 'text-white/30 hover:text-white/60' : 'text-white/55 hover:text-white'}`}
            >
              {tab.label}
            </button>
          ))}
          <span className="w-px h-4 bg-white/10 mx-1" aria-hidden="true" />
          <button
            onClick={() => openSettings('engines')}
            aria-current={activeTab === 'settings' ? 'page' : undefined}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap ${activeTab === 'settings' ? 'text-[#d9ff00]' : 'text-white/55 hover:text-white'}`}
          >
            <LuKeyRound size={13} />APIs
          </button>
        </nav>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <WalletBadge apimartKey={engineOn('apimart') ? accessToken : null} onNeedKey={() => openSettings('engines')} />
          <div className="relative">
            <button type="button" onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }} aria-label="Conta" aria-expanded={menuOpen} className="w-8 h-8 rounded-full bg-white/[0.08] hover:bg-white/[0.14] flex items-center justify-center text-[12px] font-bold uppercase">
              {email.slice(0, 1) || <LuUser size={14} />}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 z-50 w-56 bg-[#18181b] border border-white/10 rounded-xl p-1 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="px-3 py-2 border-b border-white/[0.06] mb-1">
                  <p className="text-xs text-white truncate">{email}</p>
                  <p className="text-[11px] text-white/40">{member.role === 'owner' ? 'Dono' : 'Membro'}</p>
                </div>
                {[['engines', 'APIs'], ['team', 'Equipe'], ['codex', 'Conectar Codex'], ['account', 'Conta']].map(([id, label]) => (
                  <button key={id} type="button" onClick={() => openSettings(id)} className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/80 hover:bg-white/5">{label}</button>
                ))}
                <button type="button" onClick={() => supabase.auth.signOut()} className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm text-red-300 hover:bg-white/5"><LuLogOut size={14} />Sair</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 min-w-0 min-h-0 overflow-hidden relative">
        {activeTab === 'settings' ? (
          <StudioSettings email={email} role={member.role} initialSection={settingsSection} enginesData={engines} reloadEngines={reloadEngines} />
        ) : needsEngine ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
            <span className="w-14 h-14 rounded-2xl bg-white/[0.05] flex items-center justify-center"><active.icon size={24} className="text-white/60" /></span>
            <p className="text-white/60 text-sm max-w-sm">
              O estúdio de {active.label} usa o motor {active.engine === 'apimart' ? 'APIMart' : 'Muapi'}, que ainda não está ativo.
              {member.role === 'owner' ? ' Adicione a chave em APIs.' : ' Peça ao dono do estúdio para ativar em APIs.'}
            </p>
            <button onClick={() => openSettings('engines')} className="px-4 py-2 rounded-xl bg-[#d9ff00] text-black text-sm font-bold">Abrir APIs</button>
          </div>
        ) : activeTab === 'video' ? (
          <VideoWorkspace email={email} />
        ) : (
          <div className="h-full overflow-y-auto custom-scrollbar">
            {activeTab === 'image'   && <ImageStudio   apiKey={muapiKey} />}
            {activeTab === 'lipsync' && <LipSyncStudio apiKey={muapiKey} />}
            {activeTab === 'cinema'  && <CinemaStudio  apiKey={muapiKey} />}
          </div>
        )}
      </main>
    </div>
  );
}
