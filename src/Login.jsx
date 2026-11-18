import { useEffect, useRef, useState } from 'react';
import { entrar, temServidor } from './auth.js';
import { act } from './store.js';
import { logoCompleta } from './theme.js';
import PantherStage from './components/PantherStage.jsx';
import { Icon } from './ui.jsx';

/* Cena de fundo: linhas de velocidade (como na logo) + uma rota de entrega com um ponto em movimento.
   O ritmo acelera quando você foca no formulário e dispara na hora de entrar. */
function Cena({ boost }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current, ctx = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0, vel = 1, quadro = 0, u = 0, ac = '#e1202c';
    const cor = () => getComputedStyle(document.documentElement).getPropertyValue('--ac').trim() || ac;
    const nova = (ini) => ({ x: ini ? Math.random() * w : -300 - Math.random() * 400, y: Math.random() * h, len: 90 + Math.random() * 360, v: 0.6 + Math.random() * 2.4, a: 0.07 + Math.random() * 0.38, t: 0.6 + Math.random() * 1.8 });
    const resize = () => { w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    const linhas = Array.from({ length: reduz ? 36 : 92 }, () => nova(true));
    const rota = [[0.06, 0.82], [0.2, 0.7], [0.34, 0.77], [0.5, 0.6], [0.64, 0.66], [0.78, 0.52]];
    const pt = (i) => [rota[i][0] * w * 0.62, rota[i][1] * h];

    function desenha(dt) {
      ctx.clearRect(0, 0, w, h);
      for (const s of linhas) {
        s.x += s.v * vel * dt * 3;
        if (s.x - s.len > w) Object.assign(s, nova(false));
        const g = ctx.createLinearGradient(s.x - s.len, 0, s.x, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, ac);
        ctx.globalAlpha = s.a; ctx.strokeStyle = g; ctx.lineWidth = s.t;
        ctx.beginPath(); ctx.moveTo(s.x - s.len, s.y + s.len * 0.035); ctx.lineTo(s.x, s.y); ctx.stroke();
      }
      ctx.globalAlpha = 0.5; ctx.strokeStyle = ac; ctx.lineWidth = 2; ctx.setLineDash([6, 10]); ctx.lineDashOffset = -u * 160;
      ctx.beginPath(); rota.forEach((_, i) => { const [x, y] = pt(i); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
      rota.forEach((_, i) => {
        const [x, y] = pt(i), p = 0.5 + 0.5 * Math.sin(u * 6 + i);
        ctx.globalAlpha = 0.25 + 0.25 * p; ctx.beginPath(); ctx.arc(x, y, 9 + 6 * p, 0, 7); ctx.fillStyle = ac; ctx.fill();
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
      });
      const seg = (((u % 1) + 1) % 1) * (rota.length - 1), i = Math.max(0, Math.min(Math.floor(seg), rota.length - 2)), f = seg - i;
      const [x0, y0] = pt(i), [x1, y1] = pt(i + 1);
      const x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
      ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.fillStyle = ac; ctx.fill();
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.globalAlpha = 1;
    }

    let t0 = performance.now();
    function frame(now) {
      const dt = Math.min(Math.max((now - t0) / 16.7, 0), 3); t0 = now;
      vel += (boost.current - vel) * 0.06;
      u += 0.0016 * vel * dt;
      if (++quadro % 90 === 0) ac = cor();
      desenha(dt);
      raf = requestAnimationFrame(frame);
    }
    ac = cor();
    if (reduz) desenha(1); else raf = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [boost]);
  return <canvas ref={ref} aria-hidden="true" />;
}

export default function Login({ tema, onEntrar }) {
  const boost = useRef(1);
  const logoRef = useRef(null);
  const pantera = useRef(null);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [saindo, setSaindo] = useState(false);

  const mover = (e) => {
    const l = logoRef.current; if (!l) return;
    const x = (e.clientX / window.innerWidth - 0.5) * 2, y = (e.clientY / window.innerHeight - 0.5) * 2;
    l.style.transform = `perspective(900px) rotateY(${x * 7}deg) rotateX(${-y * 5}deg) translate(${x * 8}px, ${y * 6}px)`;
  };
  /* Sucesso: a pantera corre para fora e só então entra no Painel. O 3D nunca trava o login:
     sem modelo, sem WebGL, com erro ou lento demais (teto de 2,4 s), entra pelo caminho antigo. */
  const lancar = async (sessao) => {
    boost.current = 40; setSaindo(true);
    let correu = false;
    try {
      correu = await Promise.race([pantera.current?.sair() ?? false, new Promise((r) => setTimeout(() => r(false), 2400))]);
    } catch { correu = false; }
    if (correu) return onEntrar(sessao);
    const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduz) setWipe(true);
    setTimeout(() => onEntrar(sessao), reduz ? 260 : 520);
  };

  async function enviar(e) {
    e.preventDefault();
    setErro(''); setBusy(true);
    try { lancar(await entrar(email.trim(), senha)); } catch (err) { setErro(err.message || 'Não foi possível entrar.'); setBusy(false); setSaindo(false); pantera.current?.reagir(); }
  }
  async function demo(papel, comDados) {
    setBusy(true);
    if (comDados) await act.carregarDemo();
    lancar({ papel, email: 'demonstração', motoristaId: papel === 'motorista' ? 'm1' : null });
  }
  const foco = { onFocus: () => (boost.current = 2.6), onBlur: () => (boost.current = 1) };

  return (
    <div className="login" onMouseMove={mover}>
      <Cena boost={boost} />
      <section className="l-hero" aria-hidden="true">
        <img ref={logoRef} className={`l-logo${tema === 'escuro' ? ' round' : ''}`} src={logoCompleta(tema)} alt="" draggable="false" />
        <PantherStage ref={pantera} tema={tema} />
        <span className="l-tag">Parceiro logístico <b>·</b> J&amp;T</span>
      </section>

      <section className="l-side">
        <form className={`l-card${saindo ? ' sai' : ''}`} onSubmit={enviar} noValidate>
          <h1>Casol <span>Express</span></h1>
          <p className="lead">Gestão de entregas, comissões e caixa em um só lugar.</p>

          {temServidor ? (
            <>
              <label className="f">E-mail
                <input className="inp" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} {...foco} />
              </label>
              <label className="f" style={{ position: 'relative' }}>Senha
                <input className="inp" type={ver ? 'text' : 'password'} autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} {...foco} />
                <button type="button" className="btn icon eye" style={{ position: 'absolute', right: 2, top: 22, width: 40, height: 40, background: 'none', border: 0 }} onClick={() => setVer(!ver)} aria-label={ver ? 'Esconder senha' : 'Mostrar senha'}><Icon n="eye" size={18} /></button>
              </label>
              {erro && <p className="l-err" role="alert">{erro}</p>}
              <button className="l-go" disabled={busy || !email || !senha}>{busy ? 'Entrando…' : 'Entrar'}</button>
            </>
          ) : (
            <>
              <button type="button" className="l-go" disabled={busy} onClick={() => demo('dono', true)}>Entrar com dados fictícios</button>
              <button type="button" className="btn l-alt" disabled={busy} onClick={() => demo('dono', false)}>Entrar com o sistema vazio</button>
              <button type="button" className="btn l-alt" disabled={busy} onClick={() => demo('motorista', true)}>Ver como motorista</button>
              <p className="l-note">Modo demonstração: sem senha e sem servidor. Os dados ficam só neste navegador.</p>
            </>
          )}
        </form>
      </section>
      <div className={`wipe${wipe ? ' go' : ''}`} />
    </div>
  );
}
