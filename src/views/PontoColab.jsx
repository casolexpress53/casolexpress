import { useEffect, useMemo, useState } from 'react';
import { dataBR, MESES, parse } from '../lib.js';
import { fmtHoraSeg, folhaMes, hhmm, hojeBR, mensagemErro, proximos, resumoDia, ROTULO, fmtMin, TIPOS } from '../ponto-lib.js';
import { usePontoColab } from '../ponto.js';
import { Chips, Vazio } from '../ui.jsx';
import { Rec } from '../components/Recolher.jsx';
import PontoFolha, { NavMes } from './PontoFolha.jsx';

const mesDe = (d) => `${d.slice(0, 8)}01`;
const ORIGEM = { ajuste: 'ajustado', dono: 'ajustado pelo gestor' };
const STATUS = { pendente: ['warn', 'Aguardando'], aprovado: ['ok', 'Aprovado'], recusado: ['bad', 'Recusado'] };

function Relogio() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  const [hm, ss] = [fmtHoraSeg.format(t).slice(0, 5), fmtHoraSeg.format(t).slice(5)];   // relógio no horário de Brasília
  const dia = parse(hojeBR());
  return (
    <div style={{ textAlign: 'center', margin: '18px 0 6px' }}>
      <div className="relogio" aria-hidden="true">{hm}<small>{ss}</small></div>
      <p className="muted small">{['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][dia.getDay()]}, {dia.getDate()} de {MESES[dia.getMonth()].toLowerCase()}</p>
    </div>
  );
}

/* Visão do celular do colaborador: bater ponto, ver o mês e pedir ajuste.
   Usada pelo colaborador (login) e, na demonstração, pelo dono em "Ver como". */
export default function PontoColab({ colaboradorId }) {
  const hojeI = hojeBR();
  const mesAtual = mesDe(hojeI);
  const [aba, setAba] = useState('hoje');
  const [mes, setMes] = useState(mesAtual);
  const H = usePontoColab({ colaboradorId, mes: mesAtual });   // sempre o mês atual (tela de hoje)
  const M = usePontoColab({ colaboradorId, mes });             // mês escolhido na folha
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);                        // { ok, texto }
  const [aj, setAj] = useState({ data: '', tipo: 'entrada', hora: '', motivo: '' });
  const [ajMsg, setAjMsg] = useState(null);

  useEffect(() => { if (aba === 'mes') M.recarregar(); }, [aba]); // eslint-disable-line react-hooks/exhaustive-deps

  const colab = H.colab;
  const proximas = proximos(H.hojeBatidas || []);
  const resumoHoje = resumoDia(H.hojeBatidas || [], true);
  const folha = useMemo(() => folhaMes(M.batidas, mes, colab?.cargaMin, hojeI), [M.batidas, mes, colab?.cargaMin, hojeI]);

  async function bater(tipo) {
    setBusy(true); setMsg({ ok: null, texto: 'Verificando sua localização…' });
    try {
      const r = await H.bater(tipo);
      setMsg({ ok: true, texto: `${ROTULO[tipo]} registrada${r?.dist != null ? ` (a ${r.dist} m do local)` : ''}.` });
    } catch (e) { setMsg({ ok: false, texto: mensagemErro(e) }); }
    setBusy(false);
  }
  async function pedir(e) {
    e.preventDefault(); setBusy(true); setAjMsg(null);
    try { await H.pedirAjuste(aj); setAj({ data: '', tipo: 'entrada', hora: '', motivo: '' }); setAjMsg({ ok: true, texto: 'Pedido enviado. O gestor vai analisar.' }); }
    catch (er) { setAjMsg({ ok: false, texto: mensagemErro(er) }); }
    setBusy(false);
  }

  if (H.carregando) return <div className="card"><div className="empty">Carregando…</div></div>;
  if (!colab) return <div className="card"><Vazio titulo="Colaborador não encontrado" texto={H.erro || 'Peça ao administrador para conferir o seu cadastro.'} /></div>;

  if (colab.batePonto === false) return <div className="card"><Vazio titulo="Sem registro de ponto" texto="O seu cadastro não usa registro de ponto. Se isso estiver errado, fale com o administrador." /></div>;

  return (
    <div className="phone">
      <p className="k-l">Olá,</p>
      <b style={{ font: 'italic 800 22px var(--f1)', textTransform: 'uppercase' }}>{colab.nome}</b>{colab.funcao && <span className="muted small"> · {colab.funcao}</span>}
      <div style={{ margin: '14px 0' }}><Chips valor={aba} onChange={setAba} opcoes={[['hoje', 'Hoje'], ['mes', 'Meu mês'], ['ajuste', 'Ajustes', H.pedidos.filter((p) => p.status === 'pendente').length || undefined]]} /></div>

      {aba === 'hoje' && (<>
        <Relogio />
        {!colab.temLocal ? (
          <p className="l-err" role="alert" style={{ textAlign: 'center' }}>O seu local de trabalho ainda não foi cadastrado. Fale com o administrador.</p>
        ) : proximas.length === 0 ? (
          <p style={{ textAlign: 'center' }}><span className="tag ok">Expediente encerrado</span><br /><span className="muted small">Total de hoje: {fmtMin(resumoHoje.min)}. Esqueceu algo? Peça um ajuste.</span></p>
        ) : (
          <div className="stack" style={{ margin: '8px 0 14px' }}>
            {proximas.map((t, i) => <button key={t} className={`bater${i === 0 ? ' ac' : ''}`} disabled={busy} onClick={() => bater(t)}>{ROTULO[t]}</button>)}
          </div>
        )}
        <p role="status" aria-live="polite" className={`small ${msg?.ok === false ? 'l-err' : 'muted'}`} style={{ textAlign: 'center', minHeight: 20, margin: '6px 0 12px' }}>{msg?.texto}</p>
        <div className="list">
          {(H.hojeBatidas || []).slice().sort((a, b) => a.em.localeCompare(b.em)).map((b) => (
            <div className="item" key={b.id}><span>{ROTULO[b.tipo]}</span><span><b>{hhmm(b.em)}</b>{ORIGEM[b.origem] && <span className="tag" style={{ marginLeft: 8 }}>{ORIGEM[b.origem]}</span>}</span></div>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 14 }}>A sua localização é lida só na hora de bater o ponto. Ela não é acompanhada durante o dia.</p>
      </>)}

      {aba === 'mes' && (<>
        <div style={{ margin: '0 0 12px' }}><NavMes mes={mes} onChange={setMes} max={mesAtual} /></div>
        {M.carregando ? <div className="empty">Carregando…</div> : <PontoFolha nome={colab.nome} funcao={colab.funcao} mes={mes} folha={folha} cargaMin={colab.cargaMin} />}
      </>)}

      {aba === 'ajuste' && (<>
        <p className="small muted">Esqueceu de bater ou bateu errado? Peça o ajuste e explique o motivo. O gestor aprova ou recusa.</p>
        <form className="stack" onSubmit={pedir} style={{ marginTop: 10 }}>
          <label className="f">Dia<input className="inp" type="date" required max={hojeI} value={aj.data} onChange={(e) => setAj({ ...aj, data: e.target.value })} /></label>
          <label className="f">Batida<select className="sel" value={aj.tipo} onChange={(e) => setAj({ ...aj, tipo: e.target.value })}>{TIPOS.map((t) => <option key={t} value={t}>{ROTULO[t]}</option>)}</select></label>
          <label className="f">Horário certo<input className="inp" type="time" required value={aj.hora} onChange={(e) => setAj({ ...aj, hora: e.target.value })} /></label>
          <label className="f">Motivo<input className="inp" required maxLength={200} value={aj.motivo} onChange={(e) => setAj({ ...aj, motivo: e.target.value })} placeholder="Ex.: esqueci de bater na saída" /></label>
          <button className="btn ac" disabled={busy || !aj.data || !aj.hora || !aj.motivo.trim()}>Enviar pedido</button>
          <p role="status" aria-live="polite" className={`small ${ajMsg?.ok === false ? 'l-err' : 'muted'}`}>{ajMsg?.texto}</p>
        </form>
        <Rec id="meus-pedidos" titulo={<b>Meus pedidos</b>}>
          {H.pedidos.length === 0 ? <p className="small muted">Nenhum pedido ainda.</p> : (
            <div className="list">
              {H.pedidos.slice(0, 12).map((p) => (
                <div className="item" key={p.id}>
                  <div><b>{dataBR(p.data)}</b> · {ROTULO[p.tipo]} · {p.hora}<div className="small muted">{p.motivo}{p.resposta && <> — resposta: {p.resposta}</>}</div></div>
                  <span className={`tag ${STATUS[p.status][0]}`}>{STATUS[p.status][1]}</span>
                </div>
              ))}
            </div>
          )}
        </Rec>
      </>)}
    </div>
  );
}
