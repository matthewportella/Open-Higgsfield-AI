'use client';

// "APIs" area: engines (one API key per generator, saved encrypted on the
// server), team invitations, Codex access tokens and account.

import { useCallback, useEffect, useState } from 'react';
import {
  LuKeyRound, LuUsers, LuTerminal, LuUser, LuCheck, LuExternalLink, LuCopy, LuTrash2, LuPlus, LuShieldCheck, LuPower,
} from 'react-icons/lu';
import { apiFetch, supabaseBrowser } from '@/lib/supabase/browser';

const SECTIONS = [
  { id: 'engines', label: 'APIs', icon: LuKeyRound },
  { id: 'team', label: 'Equipe', icon: LuUsers },
  { id: 'codex', label: 'Codex', icon: LuTerminal },
  { id: 'account', label: 'Conta', icon: LuUser },
];

function formatDate(ts) {
  return ts ? new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

function Card({ children, className = '' }) {
  return <div className={`rounded-2xl bg-[#0c0c0e] border border-white/[0.08] p-5 ${className}`}>{children}</div>;
}

/* ─────────────────────────────── engines ─────────────────────────────── */

function EngineCard({ engine, isOwner, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (body) => {
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/engines', { method: 'PUT', body: JSON.stringify({ id: engine.id, ...body }) });
      setEditing(false);
      setKey('');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const status = !engine.configured ? { text: 'Sem chave', tone: 'text-white/40 bg-white/[0.06]' }
    : engine.enabled ? { text: 'Ativo', tone: 'text-black bg-[#d9ff00]' }
    : { text: 'Desativado', tone: 'text-white/60 bg-white/[0.08]' };

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">{engine.name}</h3>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${status.tone}`}>{status.text}</span>
          </div>
          <p className="text-sm text-white/50 mt-1">{engine.description}</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {engine.powers.map((p) => <span key={p} className="px-2 py-0.5 rounded-md bg-white/[0.05] text-[11px] text-white/60">{p}</span>)}
          </div>
          {engine.configured && (
            <p className="text-[11px] text-white/35 mt-3">Chave {engine.keyHint} · atualizada por {engine.updatedBy || '—'} em {formatDate(engine.updatedAt)}</p>
          )}
        </div>
        {isOwner && engine.configured && (
          <button type="button" onClick={() => save({ enabled: !engine.enabled })} disabled={busy} title={engine.enabled ? 'Desativar' : 'Ativar'} className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${engine.enabled ? 'bg-[#d9ff00]/15 text-[#d9ff00]' : 'bg-white/[0.06] text-white/50'} hover:brightness-125 disabled:opacity-40`}>
            <LuPower size={16} />
          </button>
        )}
      </div>

      {isOwner && (
        editing ? (
          <form className="mt-4 space-y-2" onSubmit={(e) => { e.preventDefault(); if (key.trim()) save({ key }); }}>
            <label htmlFor={`key-${engine.id}`} className="block text-xs text-white/50">Chave da API {engine.name}</label>
            <input id={`key-${engine.id}`} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={engine.keyPlaceholder} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#d9ff00]/50" />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={busy || !key.trim()} className="px-4 py-2 rounded-xl bg-[#d9ff00] text-black text-sm font-bold disabled:opacity-40">{busy ? 'Validando…' : 'Salvar e ativar'}</button>
              <button type="button" onClick={() => { setEditing(false); setKey(''); setError(''); }} className="px-4 py-2 rounded-xl bg-white/[0.06] text-white text-sm">Cancelar</button>
              <a href={engine.keyUrl} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-xs text-white/50 hover:text-white">Pegar chave <LuExternalLink size={12} /></a>
            </div>
            <p className="text-[11px] text-white/35 flex items-center gap-1"><LuShieldCheck size={12} />A chave é testada, criptografada e guardada no servidor. Ninguém da equipe vê o valor.</p>
          </form>
        ) : (
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white text-sm font-semibold">{engine.configured ? 'Trocar chave' : 'Adicionar chave'}</button>
            {engine.configured && (
              <button type="button" onClick={() => { if (confirm(`Remover a chave da ${engine.name}? O motor fica desativado.`)) save({ key: '' }); }} disabled={busy} className="px-4 py-2 rounded-xl text-red-400 hover:bg-red-500/10 text-sm">Remover</button>
            )}
            {error && <p className="text-xs text-red-400 self-center">{error}</p>}
          </div>
        )
      )}
      {!isOwner && !engine.configured && <p className="text-xs text-white/40 mt-4">Peça ao dono do estúdio para adicionar a chave.</p>}
    </Card>
  );
}

function EnginesSection({ data, reload }) {
  if (!data) return <p className="text-white/50 text-sm">Carregando…</p>;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-white">APIs dos motores</h2>
        <p className="text-sm text-white/50 mt-1">Cada motor gerador usa a própria chave. Ela fica salva aqui para toda a equipe, e quem entra no estúdio já usa sem precisar colar nada.</p>
      </div>
      {data.engines.map((engine) => <EngineCard key={engine.id} engine={engine} isOwner={data.role === 'owner'} onSaved={reload} />)}
      <p className="text-xs text-white/35">Para adicionar um motor novo (outra API de vídeo ou imagem), ele entra nesta lista com a chave dele.</p>
    </div>
  );
}

/* ──────────────────────────────── team ───────────────────────────────── */

function TeamSection({ email, isOwner }) {
  const [members, setMembers] = useState([]);
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const supabase = supabaseBrowser();

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('members').select('email, role, user_id, created_at').order('created_at');
    if (err) setError(err.message); else setMembers(data || []);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setError('');
    const clean = invite.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) { setError('E-mail inválido.'); return; }
    const { error: err } = await supabase.from('members').insert({ email: clean, role: 'member' });
    if (err) { setError(err.code === '23505' ? 'Esse e-mail já está na equipe.' : err.message); return; }
    setInvite('');
    load();
  };

  const remove = async (target) => {
    if (!confirm(`Remover ${target} da equipe? A pessoa perde o acesso ao estúdio.`)) return;
    const { error: err } = await supabase.from('members').delete().eq('email', target);
    if (err) setError(err.message); else load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-white">Equipe</h2>
        <p className="text-sm text-white/50 mt-1">Só e-mails desta lista conseguem criar conta e entrar. Todos compartilham as APIs e o histórico de criações.</p>
      </div>
      {isOwner && (
        <Card>
          <form onSubmit={add} className="flex gap-2">
            <label htmlFor="invite-email" className="sr-only">E-mail para convidar</label>
            <input id="invite-email" type="email" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="email@da-pessoa.com" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#d9ff00]/50" />
            <button type="submit" className="flex items-center gap-1.5 px-4 rounded-xl bg-[#d9ff00] text-black text-sm font-bold"><LuPlus size={14} />Liberar</button>
          </form>
          <p className="text-[11px] text-white/35 mt-2">Depois de liberar, a pessoa abre o estúdio, toca em “Primeiro acesso? Criar conta” e cria a senha dela.</p>
        </Card>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Card className="!p-0 divide-y divide-white/[0.06]">
        {members.map((m) => (
          <div key={m.email} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm text-white truncate">{m.email}{m.email === email && <span className="text-white/40"> (você)</span>}</p>
              <p className="text-[11px] text-white/40">{m.role === 'owner' ? 'Dono' : 'Membro'} · {m.user_id ? 'conta criada' : 'aguardando primeiro acesso'}</p>
            </div>
            {isOwner && m.role !== 'owner' && (
              <button type="button" onClick={() => remove(m.email)} aria-label={`Remover ${m.email}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-white/5"><LuTrash2 size={14} /></button>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ──────────────────────────────── codex ──────────────────────────────── */

function CodexSection() {
  const [tokens, setTokens] = useState([]);
  const [label, setLabel] = useState('Codex');
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const load = useCallback(async () => {
    try { setTokens((await apiFetch('/api/tokens')).tokens); } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiFetch('/api/tokens', { method: 'POST', body: JSON.stringify({ label }) });
      setCreated(res.token);
      load();
    } catch (err) { setError(err.message); }
  };

  const revoke = async (id) => {
    if (!confirm('Revogar este token? O Codex que usa ele para de funcionar.')) return;
    try { await apiFetch(`/api/tokens?id=${id}`, { method: 'DELETE' }); load(); } catch (err) { setError(err.message); }
  };

  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 2000); } catch { /* ignore */ }
  };

  const configBlock = `[mcp_servers.open-higgsfield-video]
url = "${origin}/api/mcp"
tool_timeout_sec = 90

[mcp_servers.open-higgsfield-video.http_headers]
Authorization = "Bearer ${created || 'SEU_TOKEN_ohf_...'}"`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-white">Conectar o Codex</h2>
        <p className="text-sm text-white/50 mt-1">Gere um token e cole no Codex. Ele cria, estende e edita vídeos usando as APIs do estúdio, e cada vídeo aparece no histórico da equipe.</p>
      </div>

      <Card>
        <form onSubmit={create} className="flex gap-2">
          <label htmlFor="token-label" className="sr-only">Nome do token</label>
          <input id="token-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Codex do notebook" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#d9ff00]/50" />
          <button type="submit" className="px-4 rounded-xl bg-[#d9ff00] text-black text-sm font-bold">Gerar token</button>
        </form>
        {created && (
          <div className="mt-4 rounded-xl bg-[#d9ff00]/10 border border-[#d9ff00]/30 p-3 space-y-2">
            <p className="text-xs text-[#d9ff00] font-semibold">Copie agora: este token aparece só uma vez.</p>
            <div className="flex gap-2">
              <code className="flex-1 min-w-0 truncate text-xs text-white bg-black/40 rounded-lg px-3 py-2">{created}</code>
              <button type="button" onClick={() => copy(created, 'token')} className="px-3 rounded-lg bg-white/10 text-white text-xs flex items-center gap-1">{copied === 'token' ? <LuCheck size={12} /> : <LuCopy size={12} />}Copiar</button>
            </div>
          </div>
        )}
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </Card>

      <Card>
        <h3 className="text-sm font-bold text-white mb-2">Como colar no Codex</h3>
        <ol className="text-sm text-white/60 space-y-1.5 list-decimal pl-5">
          <li>Abra o arquivo <code className="text-white">~/.codex/config.toml</code> (no app do Codex: Configurações → MCP → editar config).</li>
          <li>Cole o bloco abaixo no final{created ? ' (já com o seu token)' : ', trocando SEU_TOKEN pelo token gerado'}.</li>
          <li>Feche e abra o Codex e peça: “crie um vídeo vertical de 5 segundos de…”.</li>
        </ol>
        <div className="relative mt-3">
          <pre className="text-[11px] leading-relaxed text-white/80 bg-black/50 rounded-xl p-3 overflow-x-auto">{configBlock}</pre>
          <button type="button" onClick={() => copy(configBlock, 'config')} className="absolute top-2 right-2 px-2 py-1 rounded-md bg-white/10 text-white text-[11px] flex items-center gap-1">{copied === 'config' ? <LuCheck size={11} /> : <LuCopy size={11} />}Copiar</button>
        </div>
      </Card>

      <Card className="!p-0 divide-y divide-white/[0.06]">
        {tokens.length === 0 ? <p className="px-5 py-4 text-sm text-white/40">Nenhum token ainda.</p> : tokens.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm text-white">{t.label} <span className="text-white/35 font-mono text-xs">{t.token_hint}</span></p>
              <p className="text-[11px] text-white/40">Criado {formatDate(t.created_at)} · último uso {formatDate(t.last_used_at)}</p>
            </div>
            <button type="button" onClick={() => revoke(t.id)} className="px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10">Revogar</button>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ─────────────────────────────── account ─────────────────────────────── */

function AccountSection({ email, role }) {
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const change = async (e) => {
    e.preventDefault();
    if (password.length < 6) { setMsg('A senha precisa ter pelo menos 6 caracteres.'); return; }
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    setMsg(error ? error.message : 'Senha alterada.');
    if (!error) setPassword('');
  };
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-black text-white">Conta</h2>
      <Card>
        <p className="text-sm text-white">{email}</p>
        <p className="text-xs text-white/40 mt-1">{role === 'owner' ? 'Dono do estúdio' : 'Membro da equipe'}</p>
      </Card>
      <Card>
        <form onSubmit={change} className="space-y-2">
          <label htmlFor="new-password" className="block text-xs text-white/50">Nova senha</label>
          <div className="flex gap-2">
            <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#d9ff00]/50" />
            <button type="submit" className="px-4 rounded-xl bg-white/[0.08] text-white text-sm font-semibold">Alterar</button>
          </div>
          {msg && <p className="text-xs text-white/60">{msg}</p>}
        </form>
      </Card>
      <button type="button" onClick={() => supabaseBrowser().auth.signOut()} className="px-4 py-2.5 rounded-xl bg-red-500/10 text-red-300 text-sm font-semibold hover:bg-red-500/20">Sair da conta</button>
    </div>
  );
}

export default function StudioSettings({ email, role, initialSection = 'engines', enginesData, reloadEngines }) {
  const [section, setSection] = useState(initialSection);
  useEffect(() => setSection(initialSection), [initialSection]);
  const isOwner = role === 'owner';
  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">
        <nav className="md:w-44 flex md:flex-col gap-1 overflow-x-auto no-scrollbar" aria-label="Seções">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setSection(id)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm whitespace-nowrap ${section === id ? 'bg-white/[0.08] text-white' : 'text-white/50 hover:text-white'}`}>
              <Icon size={15} />{label}
            </button>
          ))}
        </nav>
        <div className="flex-1 min-w-0">
          {section === 'engines' && <EnginesSection data={enginesData} reload={reloadEngines} />}
          {section === 'team' && <TeamSection email={email} isOwner={isOwner} />}
          {section === 'codex' && <CodexSection />}
          {section === 'account' && <AccountSection email={email} role={role} />}
        </div>
      </div>
    </div>
  );
}

