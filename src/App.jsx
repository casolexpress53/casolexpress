import { lazy, Suspense, useEffect, useState } from 'react';
import { demoBloqueado, sair, sessaoAtual, temServidor } from './auth.js';
import Login from './Login.jsx';
import { encerrarServidor, iniciarServidor, useStore } from './store.js';
import { aguardarGravacao, limparAviso, temPendencia, useAviso, useSyncStatus } from './sync.js';
import { logoRedonda, useTema } from './theme.js';
import { ids_ABAS } from './equipe.js';
import { Icon } from './ui.jsx';

const Painel = lazy(() => import('./views/Painel.jsx'));
const Romaneio = lazy(() => import('./views/Romaneio.jsx'));
const Entregas = lazy(() => import('./views/Entregas.jsx'));
const Motorista = lazy(() => import('./views/Motorista.jsx'));
const Comissao = lazy(() => import('./views/Comissao.jsx'));
const Caixa = lazy(() => import('./views/Caixa.jsx'));
const Rastreador = lazy(() => import('./views/Rastreador.jsx'));
const Ajustes = lazy(() => import('./views/Ajustes.jsx'));
const Sla = lazy(() => import('./views/Sla.jsx'));
const Notas = lazy(() => import('./views/Notas.jsx'));
const Funcionarios = lazy(() => import('./views/Funcionarios.jsx'));
const Ponto = lazy(() => import('./views/Ponto.jsx'));
const PontoColab = lazy(() => import('./views/PontoColab.jsx'));

const NAV = [
  ['painel', 'Painel', 'Como está a operação hoje', 'home', Painel],
  ['romaneio', 'Romaneio', 'Importe a lista da plataforma e agrupe por cliente', 'upload', Romaneio],
  ['entregas', 'Entregas', 'Todas as paradas e o que já foi baixado', 'box', Entregas],
  ['motorista', 'Motorista', 'Como o motorista vê e dá baixa no celular', 'truck', Motorista],
  ['sla', 'SLA', 'Metas acordadas dos motoristas e como cada um está', 'target', Sla],
  ['notas', 'Notas fiscais', 'Notas enviadas pelos motoristas: abrir e baixar', 'file', Notas],
  ['comissao', 'Comissão', 'Acerto quinzenal com descontos', 'percent', Comissao],
  ['caixa', 'Caixa', 'Entradas, saídas e previsão', 'wallet', Caixa],
  ['equipe', 'Funcionários', 'Cadastre quem opera e bate ponto: nome, função, local do ponto e acesso ao sistema', 'users', Funcionarios],
  ['ponto', 'Ponto', 'Registro de ponto por localização, folhas e ajustes', 'clock', Ponto],
  ['rastreador', 'Rastreador', 'Veículos e integração com rastreamento', 'pin', Rastreador],
  ['ajustes', 'Ajustes', 'Motoristas, valores e prazos', 'sliders', Ajustes],
];
const K_SESSAO = 'casol_sessao';
const K_ABA = 'casol_aba';
const K_MENU = 'casol_menu';

export default function App() {
  const [tema, alternar] = useTema();
  const S = useStore();
  const sy = useSyncStatus();
  const aviso = useAviso();
  const [erroCarga, setErroCarga] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [sessao, setSessao] = useState(undefined);
  const [menu, setMenu] = useState(() => { try { return localStorage.getItem(K_MENU) === '1'; } catch { return false; } });
  const alternarMenu = () => setMenu((m) => { try { localStorage.setItem(K_MENU, m ? '0' : '1'); } catch { /* sem storage */ } return !m; });
  const [aba, setAba] = useState(() => { try { return localStorage.getItem(K_ABA) || 'painel'; } catch { return 'painel'; } });

  useEffect(() => {
    (async () => {
      if (temServidor) return setSessao(await sessaoAtual());
      try { setSessao(JSON.parse(sessionStorage.getItem(K_SESSAO)) || null); } catch { setSessao(null); }
    })();
  }, []);
  useEffect(() => { document.querySelector('.rail button.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [aba, menu]);
  useEffect(() => { try { localStorage.setItem(K_ABA, aba); } catch { /* sem storage */ } }, [aba]);

  /* modo servidor: ao entrar, carrega do Supabase o que este papel pode ver */
  useEffect(() => {
    if (!temServidor || !sessao) return undefined;
    let vivo = true; setErroCarga('');
    iniciarServidor(sessao.papel)
      .then((r) => { if (vivo && r.motoristaId) setSessao((s) => (s && s.papel === 'motorista' ? { ...s, motoristaId: r.motoristaId } : s)); })
      .catch((e) => { if (vivo) setErroCarga(e.message || 'Não foi possível carregar os dados.'); });
    return () => { vivo = false; };
  }, [sessao?.papel, sessao?.email, tentativa]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* brilho que segue o mouse nos cartões */
  useEffect(() => {
    const f = (e) => {
      const c = e.target.closest?.('.card'); if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`); c.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointermove', f, { passive: true });
    return () => document.removeEventListener('pointermove', f);
  }, []);

  const entrou = (s) => { if (!temServidor) sessionStorage.setItem(K_SESSAO, JSON.stringify(s)); setSessao(s); };
  const saiu = async () => {
    if (temServidor && temPendencia()) {
      const ok = await aguardarGravacao();
      if (!ok && !window.confirm('Há alterações que ainda não foram salvas na nuvem. Sair mesmo assim e perder essas alterações?')) return;
    }
    await sair(); encerrarServidor(); sessionStorage.removeItem(K_SESSAO); setSessao(null);
  };

  if (demoBloqueado) return <main className="main" style={{ marginLeft: 0 }}><div className="card"><div className="empty"><b>Sistema não configurado</b><p>O acesso por senha (Supabase) não está configurado neste ambiente, então o sistema não abre. Fale com o administrador.</p></div></div></main>;
  if (sessao === undefined) return null;
  if (!sessao) return <Login tema={tema} onEntrar={entrou} />;
  if (temServidor && !S.carregado) {
    return (
      <main className="main" style={{ marginLeft: 0 }}><div className="card"><div className="empty">
        {erroCarga ? (<><b>Não foi possível carregar</b><p>{erroCarga}</p><div className="row" style={{ justifyContent: 'center' }}><button className="btn ac" onClick={() => setTentativa((t) => t + 1)}>Tentar de novo</button><button className="btn" onClick={saiu}>Sair</button></div></>) : 'Carregando dados…'}
      </div></div></main>
    );
  }

  const Toggle = (
    <button className="btn icon" onClick={alternar} aria-label={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'} title="Tema">
      <Icon n={tema === 'escuro' ? 'sun' : 'moon'} size={20} />
    </button>
  );
  const Status = temServidor
    ? <span className="pill" role="status" aria-live="polite"><b style={sy.estado === 'erro' ? { background: 'var(--bad)', boxShadow: 'none' } : undefined} />{sy.estado === 'erro' ? `Erro ao salvar (${sy.pendentes} pendente${sy.pendentes === 1 ? '' : 's'}). Tentando de novo…` : sy.estado === 'salvando' ? 'Salvando…' : 'Salvo na nuvem'}</span>
    : <span className="pill"><b />Demonstração · salvo neste navegador</span>;
  const Carregando = <div className="empty">Carregando…</div>;
  const Aviso = aviso && (
    <div className={`aviso ${aviso.tipo}`} role="alert"><span>{aviso.texto}</span><button className="btn sm" onClick={limparAviso}>Entendi</button></div>
  );

  /* motorista: só a tela do celular */
  if (sessao.papel === 'motorista') {
    return (
      <main className="main" style={{ marginLeft: 0 }}>
        {Aviso}
        <div className="row between" style={{ marginBottom: 16 }}>
          <img src={logoRedonda(tema)} alt="Casol Express" width="52" height="52" style={{ borderRadius: '50%' }} />
          <div className="row">{Toggle}<button className="btn icon" onClick={saiu} aria-label="Sair"><Icon n="logout" size={20} /></button></div>
        </div>
        <Suspense fallback={Carregando}><Motorista modo="motorista" motoristaId={sessao.motoristaId} /></Suspense>
      </main>
    );
  }

  /* colaborador: só a tela de ponto do celular */
  if (sessao.papel === 'colaborador') {
    return (
      <main className="main" style={{ marginLeft: 0 }}>
        {Aviso}
        <div className="row between" style={{ marginBottom: 16 }}>
          <img src={logoRedonda(tema)} alt="Casol Express" width="52" height="52" style={{ borderRadius: '50%' }} />
          <div className="row">{Toggle}<button className="btn icon" onClick={saiu} aria-label="Sair"><Icon n="logout" size={20} /></button></div>
        </div>
        <Suspense fallback={Carregando}><PontoColab /></Suspense>
      </main>
    );
  }

  /* quem só opera vê as abas liberadas pelo dono, mais o próprio ponto */
  const nav = sessao.papel === 'operador'
    ? [...NAV.filter((n) => ids_ABAS.includes(n[0]) && (sessao.abas || []).includes(n[0])), ['meuponto', 'Meu ponto', 'Bata o seu ponto e veja o seu mês', 'clock', PontoColab]]
    : NAV;
  const [, titulo, sub, , Tela] = nav.find((n) => n[0] === aba) || nav[0];
  return (
    <>
      {Aviso}
      <nav className={`rail${menu ? ' aberto' : ''}`} aria-label="Menu principal">
        <img className="logo" src={logoRedonda(tema)} alt="Casol Express" />
        <button onClick={alternarMenu} title={menu ? 'Fechar o menu' : 'Abrir o menu com os nomes'} aria-label={menu ? 'Fechar o menu' : 'Abrir o menu com os nomes'} aria-expanded={menu}>
          <Icon n={menu ? 'x' : 'menu'} />{menu && <span className="rt"><b>Fechar menu</b></span>}
        </button>
        {nav.map(([id, nome, legenda, icone]) => (
          <button key={id} className={(nav.find((n) => n[0] === aba) || nav[0])[0] === id ? 'on' : ''} onClick={() => setAba(id)} title={`${nome} — ${legenda}`} aria-label={nome} aria-current={(nav.find((n) => n[0] === aba) || nav[0])[0] === id ? 'page' : undefined}>
            <Icon n={icone} />{menu && <span className="rt"><b>{nome}</b><small>{legenda}</small></span>}
          </button>
        ))}
        <span className="sp" />
        <button onClick={saiu} title="Sair" aria-label="Sair"><Icon n="logout" />{menu && <span className="rt"><b>Sair</b></span>}</button>
      </nav>
      <main className={`main${menu ? ' menu-aberto' : ''}`}>
        {S.demo && <div className="demo-strip">DADOS FICTÍCIOS DE DEMONSTRAÇÃO · NADA AQUI É OPERAÇÃO REAL</div>}
        <header className="head">
          <div><h1>{titulo}</h1><p>{sub}</p></div>
          <div className="tools">{Status}{Toggle}</div>
        </header>
        <Suspense fallback={Carregando}><Tela ir={setAba} /></Suspense>
      </main>
    </>
  );
}
