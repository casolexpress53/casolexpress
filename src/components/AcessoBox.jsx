import { useState } from 'react';
import { mensagemErro } from '../ponto-lib.js';
import { acesso, rpc } from '../sync.js';

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';   // sem 0/O/1/l/I (evita erro ao digitar)
/* senha forte de 12 caracteres, com letra e número */
export function gerarSenha() {
  const buf = new Uint32Array(12); crypto.getRandomValues(buf);
  const s = [...buf].map((n) => LETRAS[n % LETRAS.length]);
  s[0] = 'ABCDEFGHJKLMNPQRSTUVWXYZ'[buf[0] % 24]; s[11] = '23456789'[buf[11] % 8];
  return s.join('');
}

/* Acesso (login) de um motorista ou colaborador, criado aqui mesmo: sem Supabase e sem e-mail de confirmação.
   `tipo`: 'motorista' | 'colaborador'. `item`: { id, nome, vinculado }. `aoMudar`: recarrega os dados. */
export default function AcessoBox({ tipo, item, aoMudar }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState(null);
  const [feito, setFeito] = useState(null);       // { email, senha, redefinida }
  const [busy, setBusy] = useState(false);
  const [vinc, setVinc] = useState(false);        // vincular conta já existente
  const [emailV, setEmailV] = useState('');

  async function agir(acao) {
    setBusy(true); setMsg(null);
    try {
      const s = senha || gerarSenha();
      await acesso({ acao, tipo, id: item.id, email: email.trim(), senha: s });
      setFeito({ email: acao === 'criar' ? email.trim().toLowerCase() : null, senha: s, redefinida: acao !== 'criar' });
      setSenha(''); setEmail(''); await aoMudar?.();
    } catch (e) { setMsg({ ok: false, t: mensagemErro(e) }); }
    setBusy(false);
  }
  async function vincular() {
    setBusy(true); setMsg(null);
    try { await rpc(tipo === 'motorista' ? 'definir_acesso_motorista' : 'definir_acesso_colaborador', tipo === 'motorista' ? { p_motorista: item.id, p_email: emailV.trim() } : { p_colab: item.id, p_email: emailV.trim() }); setEmailV(''); setVinc(false); await aoMudar?.(); setMsg({ ok: true, t: 'Conta existente ligada.' }); }
    catch (e) { setMsg({ ok: false, t: mensagemErro(e) }); }
    setBusy(false);
  }
  const copiar = (t) => navigator.clipboard?.writeText(t).then(() => setMsg({ ok: true, t: 'Copiado.' })).catch(() => {});

  return (
    <div style={{ flex: '1 1 100%' }} className="stack">
      <div className="row">
        <span className={`tag ${item.vinculado ? 'ok' : ''}`}>{item.vinculado ? 'Com acesso ao sistema' : 'Sem acesso ao sistema'}</span>
        {item.vinculado && <button className="btn sm" disabled={busy} onClick={() => agir('redefinir_senha')}>Redefinir senha</button>}
      </div>

      {feito && (
        <div className="card" style={{ padding: 14, borderColor: 'var(--ok)' }} role="status">
          <b>{feito.redefinida ? 'Nova senha gerada' : 'Acesso criado'}</b>
          <p className="small muted">Anote e envie para a pessoa. <b>A senha não aparece de novo</b> (dá para redefinir quando quiser).</p>
          {feito.email && <p>E-mail: <b>{feito.email}</b></p>}
          <p>Senha: <b style={{ fontFamily: 'monospace', fontSize: 18 }}>{feito.senha}</b></p>
          <div className="row"><button className="btn sm" onClick={() => copiar(`${feito.email ? `E-mail: ${feito.email}\n` : ''}Senha: ${feito.senha}`)}>Copiar</button><button className="btn sm" onClick={() => setFeito(null)}>Ok, anotei</button></div>
        </div>
      )}

      {!item.vinculado && !feito && (
        <div className="form">
          <label className="f">E-mail de acesso<input className="inp" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@email.com" /></label>
          <label className="f">Senha (mín. 10)<input className="inp" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="deixe em branco para gerar" /></label>
          <button type="button" className="btn sm" onClick={() => setSenha(gerarSenha())}>Gerar senha</button>
          <button type="button" className="btn ac" disabled={busy || !email.trim()} onClick={() => agir('criar')}>Criar acesso</button>
        </div>
      )}
      {!item.vinculado && !feito && (
        <p className="small muted">Não precisa de e-mail de confirmação nem de liberar nada no Supabase.{' '}
          <button type="button" className="btn sm" style={{ border: 0, background: 'none', textDecoration: 'underline', padding: 0 }} onClick={() => setVinc(!vinc)}>Já tem conta? Ligar uma conta existente</button></p>
      )}
      {vinc && !item.vinculado && (
        <div className="row"><input className="inp" style={{ flex: '1 1 220px' }} type="email" aria-label="E-mail da conta existente" placeholder="e-mail da conta existente" value={emailV} onChange={(e) => setEmailV(e.target.value)} /><button className="btn sm" disabled={busy || !emailV.trim()} onClick={vincular}>Ligar</button></div>
      )}
      {msg && <p role="status" className={`small ${msg.ok ? 'muted' : 'l-err'}`}>{msg.t}</p>}
    </div>
  );
}
