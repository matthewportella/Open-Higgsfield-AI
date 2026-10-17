'use client';

// E-mail + password access. Only e-mails invited by the studio owner can
// create an account (enforced in the database).

import { useState } from 'react';
import { LuSparkles, LuMail, LuLock, LuArrowLeft } from 'react-icons/lu';
import { supabaseBrowser } from '@/lib/supabase/browser';

const MESSAGES = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  'User already registered': 'Esse e-mail já tem conta. Use Entrar.',
};

function translate(message = '') {
  if (message.includes('não foi convidado') || message.includes('Database error saving new user')) {
    return 'Esse e-mail não foi convidado. Peça ao dono do estúdio para liberar seu acesso.';
  }
  if (message.toLowerCase().includes('password should be')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (message.toLowerCase().includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  return MESSAGES[message] || message;
}

export default function LoginScreen() {
  const [mode, setMode] = useState('login'); // login | signup | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) { setError('Informe o e-mail.'); return; }
    setBusy(true);
    const auth = supabaseBrowser().auth;
    try {
      if (mode === 'login') {
        const { error: err } = await auth.signInWithPassword({ email: cleanEmail, password });
        if (err) throw err;
      } else if (mode === 'signup') {
        const { data, error: err } = await auth.signUp({ email: cleanEmail, password, options: { emailRedirectTo: `${window.location.origin}/studio` } });
        if (err) throw err;
        if (!data.session) {
          // Invited e-mails are confirmed by the database, so sign in right away.
          const { error: loginErr } = await auth.signInWithPassword({ email: cleanEmail, password });
          if (loginErr) {
            setInfo('Conta criada! Agora entre com seu e-mail e senha.');
            setMode('login');
          }
        }
      } else {
        const { error: err } = await auth.resetPasswordForEmail(cleanEmail, { redirectTo: `${window.location.origin}/studio?reset=1` });
        if (err) throw err;
        setInfo('Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.');
        setMode('login');
      }
    } catch (err) {
      setError(translate(err.message));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'login' ? 'Entrar no estúdio' : mode === 'signup' ? 'Criar conta' : 'Recuperar senha';
  const input = 'w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-[#d9ff00]/50 transition-colors';

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <span className="w-12 h-12 rounded-2xl bg-[#d9ff00] flex items-center justify-center mb-5"><LuSparkles className="text-black" size={22} /></span>
          <h1 className="text-2xl font-black text-white tracking-tight">{title}</h1>
          <p className="text-white/40 text-sm mt-2">
            {mode === 'signup' ? 'Use o e-mail que o dono do estúdio liberou para você.' : mode === 'reset' ? 'Enviaremos um link para você criar uma nova senha.' : 'Seu histórico e as APIs da equipe ficam salvos na sua conta.'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3 bg-[#0c0c0e] border border-white/[0.08] rounded-3xl p-6">
          <div className="relative">
            <LuMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" size={16} />
            <label htmlFor="login-email" className="sr-only">E-mail</label>
            <input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className={input} />
          </div>
          {mode !== 'reset' && (
            <div className="relative">
              <LuLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" size={16} />
              <label htmlFor="login-password" className="sr-only">Senha</label>
              <input id="login-password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Crie uma senha (mín. 6)' : 'Senha'} className={input} />
            </div>
          )}
          {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
          {info && <p className="text-sm text-[#d9ff00]" role="status">{info}</p>}
          <button type="submit" disabled={busy} className="w-full bg-[#d9ff00] text-black font-black py-3 rounded-xl hover:brightness-105 disabled:opacity-50">
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link'}
          </button>
          <div className="flex items-center justify-between pt-1 text-xs">
            {mode === 'login' ? (
              <>
                <button type="button" onClick={() => { setMode('signup'); setError(''); setInfo(''); }} className="text-white/60 hover:text-white">Primeiro acesso? Criar conta</button>
                <button type="button" onClick={() => { setMode('reset'); setError(''); setInfo(''); }} className="text-white/40 hover:text-white">Esqueci a senha</button>
              </>
            ) : (
              <button type="button" onClick={() => { setMode('login'); setError(''); setInfo(''); }} className="flex items-center gap-1 text-white/60 hover:text-white"><LuArrowLeft size={12} />Voltar para entrar</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
