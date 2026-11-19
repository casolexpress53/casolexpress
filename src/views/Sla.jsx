import { useMemo, useState } from 'react';
import { horaBR, hojeBRT, reporteHxH } from '../hxh.js';
import { brl, num, PERIODOS, periodo, valorMotorista } from '../lib.js';
import { descontoAtraso, regraAtraso } from '../atraso.js';
import { avaliarSla, METRICAS_SLA, STATUS_SLA, temAlgumaMeta } from '../sla.js';
import { useStore } from '../store.js';
import { Chips, Icon, Vazio } from '../ui.jsx';
import FiltroPeriodo, { useFiltroPeriodo } from '../components/FiltroPeriodo.jsx';
import { H2 } from '../components/Recolher.jsx';

/* resultado de uma meta: valor real (colorido) e a meta ao lado */
export const CelulaSla = ({ r }) => (r ? (
  <div><span className={`tag ${r.ok == null ? '' : r.ok ? 'ok' : 'bad'}`}>{r.texto}</span><div className="small muted">meta {r.alvoTexto}</div></div>
) : <span className="muted">—</span>);

const pctFmt = (v) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
const ddmm = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);

/* Reporte Hora a Hora por motorista, no mesmo formato da planilha de controle da Casol */
function Reporte({ ir }) {
  const S = useStore();
  const hoje = hojeBRT();
  const ultimo = useMemo(() => S.romaneios.map((r) => r.data).filter((d) => d <= hoje).sort().pop() || hoje, [S.romaneios, hoje]);
  const [modo, setModo] = useState('dia');
  const [dia, setDia] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const P = modo === 'dia' ? { ini: dia || ultimo, fim: dia || ultimo } : modo === 'datas' ? { ini: de || ultimo, fim: ate || hoje } : periodo(modo);
  const { linhas, tot } = useMemo(() => reporteHxH(S, P.ini, P.fim, hoje), [S, P.ini, P.fim, hoje]);
  const semPrazo = !S.ajustes.prazosCidade || !Object.keys(S.ajustes.prazosCidade).length;
  return (
    <div className="card">
      <H2 id="reporte-hxh">Reporte hora a hora</H2>
      <p className="sub">Igual à planilha de controle: pacotes <b>carregados</b> de cada motorista e quantos já foram <b>entregues</b>, <b>vencem hoje</b>, estão <b>no prazo</b> ou <b>fora do prazo</b>. Performance = entregues ÷ carregados.</p>
      <div className="row between" style={{ margin: '8px 0 12px', flexWrap: 'wrap', gap: 8 }}>
        <Chips opcoes={[['dia', 'Um dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['datas', 'Escolher datas']]} valor={modo} onChange={setModo} />
        {modo === 'datas' && <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}><label className="f">De<input className="inp" type="date" value={de || P.ini} max={ate || hoje} onChange={(e) => setDe(e.target.value)} /></label><label className="f">Até<input className="inp" type="date" value={ate || P.fim} min={de || undefined} max={hoje} onChange={(e) => setAte(e.target.value)} /></label></div>}
        {modo === 'dia' && <label className="row" style={{ gap: 8 }}><span className="small muted">Dia carregado</span><input className="inp" type="date" value={dia || ultimo} max={hoje} onChange={(e) => setDia(e.target.value)} /></label>}
      </div>
      {semPrazo && <p className="small muted">Prazo por cidade ainda não cadastrado: todas as cidades contam como D + 0 (vence no dia do carregamento). <button className="btn sm" onClick={() => ir?.('ajustes')}>Cadastrar prazos</button></p>}
      <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', margin: '10px 0' }}>
        <div className="card"><div className="k-l">Performance</div><div className="k-v">{tot.carregados ? pctFmt(tot.performance) : '—'}</div></div>
        <div className="card"><div className="k-l">Carregados</div><div className="k-v">{num(tot.carregados)}</div></div>
        <div className="card"><div className="k-l">✅ Entregue</div><div className="k-v">{num(tot.ent)}</div></div>
        <div className="card"><div className="k-l">⚠️ Vence hoje</div><div className="k-v">{num(tot.vence)}</div></div>
        <div className="card"><div className="k-l">🕒 No prazo</div><div className="k-v">{num(tot.prazo)}</div></div>
        <div className="card"><div className="k-l">🚨 Fora do prazo</div><div className="k-v" style={tot.fora ? { color: 'var(--bad)' } : undefined}>{num(tot.fora)}</div></div>
      </div>
      {!linhas.length ? <Vazio titulo="Nada carregado" texto="Importe o relatório da plataforma em Romaneio para ver o reporte deste período." /> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Turno</th><th>Carregamento</th><th>1ª entrega</th><th>Última</th><th>Motorista</th><th className="r">Carregados</th><th className="r">✅ Entregue</th><th className="r">⚠️ Vence hoje</th><th className="r">🕒 No prazo</th><th className="r">🚨 Fora do prazo</th><th className="r">Performance</th><th>Cidade</th><th>Tempo de entrega</th><th>Dia carregado</th></tr></thead>
          <tbody>{linhas.map((l) => (
            <tr key={l.motoristaId}>
              <td>{l.turno || '—'}</td>
              <td>{l.carga ? horaBR(l.carga) : '—'}</td>
              <td>{l.primeira ? horaBR(l.primeira) : 'Não iniciada'}</td>
              <td>{l.ultima ? horaBR(l.ultima) : 'Não iniciada'}</td>
              <td><b>{l.nome}</b></td>
              <td className="r">{num(l.carregados)}</td>
              <td className="r">{num(l.ent)}</td>
              <td className="r">{l.vence ? <span className="tag warn">{num(l.vence)}</span> : 0}</td>
              <td className="r">{num(l.prazo)}</td>
              <td className="r">{l.fora ? <span className="tag bad">{num(l.fora)}</span> : 0}</td>
              <td className="r"><span className={`tag ${l.performance >= 0.9 ? 'ok' : l.performance >= 0.7 ? 'warn' : 'bad'}`}>{pctFmt(l.performance)}</span></td>
              <td>{l.cidade || '—'}</td>
              <td>D + {l.prazoCidade}</td>
              <td>{ddmm(l.diaCarga)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

/* Gestão: reporte igual ao controle da Casol e, abaixo, as metas acordadas (definidas em Ajustes). */
export default function Sla({ ir }) {
  const S = useStore();
  const per = useFiltroPeriodo('mes', { tudo: false });
  const P = useMemo(() => per.P, [per.P.ini, per.P.fim]); // eslint-disable-line react-hooks/exhaustive-deps
  const linhas = useMemo(() => {
    const ordem = { abaixo: 0, ok: 1, sem_dados: 2, sem_meta: 3 };
    return S.motoristas.filter((m) => m.ativo !== false).map((m) => ({ m, r: avaliarSla(S, m, P.ini, P.fim) })).sort((a, b) => ordem[a.r.status] - ordem[b.r.status] || a.m.nome.localeCompare(b.m.nome));
  }, [S, P.ini, P.fim]);
  const cont = (st) => linhas.filter((l) => l.r.status === st).length;

  if (!S.motoristas.length) return <div className="card"><Vazio titulo="Sem motoristas" texto="Cadastre motoristas em Ajustes para acompanhar o SLA." /></div>;

  return (
    <div className="stack">
      <Reporte ir={ir} />
      {!temAlgumaMeta(S) ? (
        <div className="card"><H2>Metas por motorista</H2><p className="sub">Opcional: defina metas (taxa de entrega, ocorrências, prazo, pacotes por dia) e a regra de cada motorista em Ajustes.</p>
          <button className="btn" onClick={() => ir?.('ajustes')}><Icon n="sliders" size={18} /> Configurar metas</button></div>
      ) : (<>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}><FiltroPeriodo f={per} /><button className="btn sm" onClick={() => ir?.('ajustes')}><Icon n="sliders" size={16} /> Editar metas</button></div>
        <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <div className="card"><div className="k-l">Cumprindo as metas</div><div className="k-v">{cont('ok')}</div></div>
          <div className="card"><div className="k-l">Abaixo da meta</div><div className="k-v" style={cont('abaixo') ? { color: 'var(--bad)' } : undefined}>{cont('abaixo')}</div></div>
          <div className="card"><div className="k-l">Sem dados ou sem meta</div><div className="k-v">{cont('sem_dados') + cont('sem_meta')}</div></div>
        </div>
        <div className="card">
          <H2>Metas por motorista</H2>
          <p className="sub">Só entram pacotes com baixa (entregue ou ocorrência). Quem está abaixo aparece primeiro.</p>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Motorista</th><th>Situação</th>{METRICAS_SLA.map((x) => <th key={x.k}>{x.rotulo}</th>)}<th>Atraso no pagamento</th><th className="r">Pacotes</th></tr></thead>
            <tbody>{linhas.map(({ m, r }) => {
              const [cls, rot] = STATUS_SLA[r.status];
              return (
                <tr key={m.id}>
                  <td><b>{m.nome}</b></td>
                  <td><span className={`tag ${cls}`}>{rot}{r.status === 'abaixo' ? ` (${r.abaixo})` : ''}</span></td>
                  {METRICAS_SLA.map((x) => <td key={x.k}><CelulaSla r={r.regras.find((g) => g.k === x.k)} /></td>)}
                  <td className="small">{(() => { const e = descontoAtraso(S, m, P.ini, P.fim, valorMotorista(S, m)); return e.total > 0 ? <span className="tag bad">− {brl(e.total)} ({num(e.pacotes)} pacote(s) fora do horário)</span> : regraAtraso(S, m) ? <span className="muted">sem atraso</span> : <span className="muted">—</span>; })()}</td>
                  <td className="r">{num(r.entregues)}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </div>
      </>)}
    </div>
  );
}
