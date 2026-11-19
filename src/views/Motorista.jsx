import { useMemo, useState } from 'react';
import { acertoQuinzena, brl, dataBR, diaLocal, hoje, num, OCORRENCIAS, quinzena, quinzenaAnterior, STATUS } from '../lib.js';
import { act, useStore } from '../store.js';
import { temServidor } from '../auth.js';
import { avaliarSla, STATUS_SLA } from '../sla.js';
import { Chips, Icon, Modal, Vazio } from '../ui.jsx';
import { Rec } from '../components/Recolher.jsx';
import { CelulaSla } from './Sla.jsx';
import FiltroPeriodo, { useFiltroPeriodo } from '../components/FiltroPeriodo.jsx';
import { horaBR, reporteHxH } from '../hxh.js';

function posicao() {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { timeout: 4000, maximumAge: 60000 });
  });
}

/* Visão do celular. Usada pelo motorista (modo "motorista") e pelo dono em "Ver como". */
/* O mesmo reporte hora a hora que o gestor vê, só com os números do próprio motorista */
function MeuReporte({ m, S }) {
  const per = useFiltroPeriodo('hoje', { tudo: false });
  const r = useMemo(() => reporteHxH(S, per.P.ini, per.P.fim).linhas.find((l) => l.motoristaId === m.id), [S, per.P.ini, per.P.fim, m.id]);
  const pctTxt = (v) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
  const Cel = ({ rot, v, cor }) => <div className="card" style={{ padding: 14 }}><div className="k-l">{rot}</div><div className="k-v" style={{ fontSize: 28, ...(cor ? { color: cor } : {}) }}>{v}</div></div>;
  return (
    <div className="stack">
      <p className="small muted">O seu desempenho de entrega, igual ao controle da empresa: carregados, entregues e o que vence ou já passou do prazo.</p>
      <FiltroPeriodo f={per} />
      {!r ? <p className="muted">Nenhum pacote carregado para você neste período.</p> : (<>
        <div className="grid g2" style={{ gap: 10 }}>
          <Cel rot="Performance" v={pctTxt(r.performance)} cor={r.performance >= 0.9 ? 'var(--ok)' : r.performance >= 0.7 ? undefined : 'var(--bad)'} />
          <Cel rot="Carregados" v={num(r.carregados)} />
          <Cel rot="✅ Entregue" v={num(r.ent)} />
          <Cel rot="⚠️ Vence hoje" v={num(r.vence)} />
          <Cel rot="🕒 No prazo" v={num(r.prazo)} />
          <Cel rot="🚨 Fora do prazo" v={num(r.fora)} cor={r.fora ? 'var(--bad)' : undefined} />
        </div>
        <p className="small muted">{r.carga ? `Carregamento ${horaBR(r.carga)} (${r.turno}) · ` : ''}1ª entrega {r.primeira ? horaBR(r.primeira) : 'não iniciada'} · última {r.ultima ? horaBR(r.ultima) : 'não iniciada'}</p>
      </>)}
    </div>
  );
}

export default function Motorista({ modo = 'dono', motoristaId }) {
  const S = useStore();
  const [ver, setVer] = useState(motoristaId || '');
  const [aba, setAba] = useState('rota');
  const [lim, setLim] = useState(8);
  const [ocor, setOcor] = useState(null);
  const id = modo === 'motorista' ? motoristaId : ver || S.motoristas[0]?.id;
  const m = S.motoristas.find((x) => x.id === id);
  const h = hoje();

  const dados = useMemo(() => {
    const meus = S.paradas.filter((p) => p.motoristaId === id && (p.status === 'pendente' || diaLocal(p.baixaEm) === h));
    const pend = meus.filter((p) => p.status === 'pendente');
    const feitas = meus.filter((p) => p.status !== 'pendente').sort((a, b) => (b.baixaEm || '').localeCompare(a.baixaEm || ''));
    const porCidade = {};
    for (const p of pend) (porCidade[p.cidade || 'Sem cidade'] ||= []).push(p);
    const pac = (l) => l.reduce((t, p) => t + p.pacotes.length, 0);
    return { pend, feitas, porCidade, totalPac: pac(meus), entPac: pac(meus.filter((p) => p.status === 'entregue')) };
  }, [S.paradas, id, h]);

  async function baixar(p, status) {
    const g = await posicao();
    act.baixar(p.id, status, g);
    setOcor(null);
  }

  if (!S.motoristas.length) return <div className="card"><Vazio titulo="Sem motoristas" texto="Cadastre motoristas em Ajustes para ver a visão do celular." /></div>;
  if (!m) return <div className="card"><Vazio titulo="Motorista não encontrado" texto="Peça ao administrador para conferir o seu cadastro." /></div>;

  const q = quinzena(h);
  const extratos = [q, quinzenaAnterior(q)].map((x) => acertoQuinzena(S, m, x));
  const sla = avaliarSla(S, m, h.slice(0, 8) + '01', h);

  return (
    <div className="stack">
      {modo === 'dono' && (
        <div className="card"><label className="f">Ver como<select className="sel" value={id} onChange={(e) => { setVer(e.target.value); setLim(8); }}>{S.motoristas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label></div>
      )}
      <div className="phone">
        <div className="row between"><div><p className="k-l">Olá,</p><b style={{ font: 'italic 800 22px var(--f1)', textTransform: 'uppercase' }}>{m.nome}</b></div></div>
        <div style={{ margin: '14px 0' }}><Chips valor={aba} onChange={setAba} opcoes={modo === 'motorista' && temServidor ? [['rota', 'Minha rota'], ['metas', 'Meu SLA']] : [['rota', 'Minha rota'], ['extrato', 'Meu extrato'], ['metas', 'Meu SLA']]} /></div>

        {aba === 'rota' ? (<>
          <p><b>{num(dados.entPac)}</b> de {num(dados.totalPac)} pacotes entregues</p>
          <div className="prog"><i style={{ width: `${dados.totalPac ? (dados.entPac / dados.totalPac) * 100 : 0}%` }} /></div>
          <p className="small muted">{dados.pend.length} parada(s) faltam · {dados.feitas.length} baixada(s) hoje</p>

          {Object.entries(dados.porCidade).map(([cid, ps]) => (
            <Rec key={cid} id={`rota-${cid}`} titulo={<><b>{cid}</b> · {ps.length} parada(s) pendente(s)</>}>
              {ps.slice(0, lim).map((p) => (
                <div className="stop" key={p.id}>
                  <b>{p.endereco}</b>
                  <span className="muted small">{[p.bairro, p.cliente].filter(Boolean).join(' · ')} · {p.pacotes.length} pacote(s)</span>
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn ac sm" onClick={() => baixar(p, 'entregue')}><Icon n="check" size={16} /> Entregue</button>
                    <button className="btn sm" onClick={() => setOcor(p)}>Ocorrência</button>
                  </div>
                </div>
              ))}
              {ps.length > lim && <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setLim(lim + 12)}>Mostrar mais ({ps.length - lim})</button>}
            </Rec>
          ))}
          {!dados.pend.length && <p className="muted" style={{ marginTop: 18 }}>Nenhuma parada pendente. Bom trabalho!</p>}

          {dados.feitas.length > 0 && (
            <Rec id="baixadas" titulo={<b>Já baixadas ({dados.feitas.length})</b>}>
              <p className="small muted">As últimas 8, com opção de desfazer.</p>
              {dados.feitas.slice(0, 8).map((p) => (
                <div className="stop" key={p.id}>
                  <div className="row between"><span><b>{p.endereco}</b><span className="small muted">{STATUS[p.status]}</span></span>
                    <button className="btn sm" onClick={() => act.desfazer(p.id)} aria-label="Desfazer baixa"><Icon n="undo" size={16} /> Desfazer</button></div>
                </div>
              ))}
            </Rec>
          )}
          <p className="small muted" style={{ marginTop: 18 }}>Ao dar baixa, a localização do celular é guardada junto como posição de apoio (se você permitir).</p>
        </>) : aba === 'metas' ? (
          <div className="stack">
            <MeuReporte m={m} S={S} />
            <h3 style={{ font: 'italic 700 16px var(--f1)', textTransform: 'uppercase', marginTop: 8 }}>Metas do mês</h3>
            <p className="small muted">Suas metas neste mês (até hoje). Só contam pacotes com baixa.</p>
            {sla.regras.length === 0 ? <p className="muted">Nenhuma meta definida para você.</p> : sla.regras.map((r) => (
              <div className="card" key={r.k} style={{ padding: 16 }}>
                <p className="k-l">{r.rotulo}</p>
                <div className="row between"><div className="k-v" style={{ fontSize: 30 }}>{r.texto}</div><CelulaSla r={{ ...r, texto: r.ok == null ? 'sem dados' : r.ok ? 'no alvo' : 'abaixo' }} /></div>
              </div>
            ))}
            {sla.regras.length > 0 && <span className={`tag ${STATUS_SLA[sla.status][0]}`}>{STATUS_SLA[sla.status][1]}</span>}
          </div>
        ) : (
          <div className="stack">
            {extratos.map((e, i) => (
              <div className="card" key={e.motorista.id + i} style={{ padding: 16 }}>
                <p className="k-l">{i === 0 ? 'Quinzena atual' : 'Quinzena anterior'} · {dataBR((i ? quinzenaAnterior(q) : q).ini)} a {dataBR((i ? quinzenaAnterior(q) : q).fim)}</p>
                <div className="k-v" style={{ fontSize: 30 }}>{brl(e.liquido)}</div>
                <p className="small muted">{m.tipo === 'fixo' ? 'Salário fixo (metade na quinzena)' : `${num(e.pacotes)} pacote(s) entregue(s)`}{e.totalDesc ? ` · descontos ${brl(e.totalDesc)}` : ''}</p>
                <span className={`tag ${e.aprovado ? 'ok' : 'warn'}`}>{e.aprovado ? 'Acerto aprovado' : 'Em aberto'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal aberto={!!ocor} fechar={() => setOcor(null)} titulo="O que aconteceu?">
        {ocor && <div className="stack"><p className="muted">{ocor.endereco}</p>
          {OCORRENCIAS.map((o) => <button key={o} className="btn" onClick={() => baixar(ocor, o)}>{STATUS[o]}</button>)}
          <button className="btn" onClick={() => setOcor(null)}>Cancelar</button></div>}
      </Modal>
    </div>
  );
}
