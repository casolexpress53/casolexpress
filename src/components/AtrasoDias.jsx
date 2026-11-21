import { desempenhoPorDia } from '../atraso.js';
import { act } from '../store.js';
import { brl, dataBR, num, parse } from '../lib.js';

const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const pct = (v) => (v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const SIT = { bateu: ['ok', 'Bateu a meta'], abaixo: ['bad', 'Abaixo da meta'], isento: ['ok', 'Isento'], andamento: ['', 'Em andamento'] };

/* Dia a dia do motorista no período: carregados, entregues até o corte, depois do corte, pendentes, performance, resultado e desconto.
   Quem pode editar (`editavel`) consegue isentar um dia abaixo da meta (feriado, exceção) e desfazer. */
export default function AtrasoDias({ S, m, ini, fim, editavel }) {
  const dias = desempenhoPorDia(S, m, ini, fim);
  if (!dias.length) return null;
  const isentar = (d, todos) => {
    const motivo = window.prompt(todos ? `Isentar ${dataBR(d.data)} para TODOS os motoristas. Motivo (ex.: feriado):` : `Isentar ${dataBR(d.data)} só para ${m.nome}. Motivo (ex.: não teve rota):`, 'feriado');
    if (motivo === null) return;
    act.isentarDia(d.data, todos ? null : m.id, motivo);
  };
  const r = dias[0];
  const total = dias.reduce((t, d) => t + d.desconto, 0);
  return (
    <div style={{ marginTop: 10 }}>
      <p className="small"><b>Meta do dia: {r.meta}% até as {r.hora}</b> · desconto de {brl(r.valor)} em todos os pacotes do dia quando não bate{r.valor === 0 ? ' (desconto por pacote não cadastrado em Ajustes)' : ''}</p>
      <div className="tbl-wrap"><table className="tbl small">
        <thead><tr><th>Dia</th><th className="r">Carregou</th><th className="r">Entregou até {r.hora}</th><th className="r">Depois</th><th className="r">Pendente</th><th className="r">Performance</th><th>Resultado</th><th className="r">Desconto</th>{editavel && <th />}</tr></thead>
        <tbody>{dias.map((d) => (
          <tr key={d.data}>
            <td><b>{dataBR(d.data).slice(0, 5)}</b> <span className="muted">{SEM[parse(d.data).getDay()]}</span></td>
            <td className="r">{num(d.carregados)}</td><td className="r">{num(d.ate)}</td><td className="r">{num(d.depois)}</td><td className="r">{num(d.pendentes)}</td>
            <td className="r"><b>{pct(d.perf)}</b></td>
            <td><span className={`tag ${SIT[d.situacao][0]}`}>{SIT[d.situacao][1]}</span>{d.isento ? <span className="muted"> {d.isento.motivo || ''}{d.isento.motoristaId ? '' : ' (todos)'}</span> : null}</td>
            <td className="r">{d.desconto > 0 ? <b style={{ color: 'var(--bad)' }}>− {brl(d.desconto)}</b> : d.isento ? <span className="muted" style={{ textDecoration: 'line-through' }}>− {brl(d.valor * d.carregados)}</span> : <span className="muted">—</span>}</td>
            {editavel && <td className="r">{d.isento ? <button className="btn sm" onClick={() => act.removerIsencao(d.isento.id)}>Desfazer</button> : d.abaixo ? <span className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}><button className="btn sm" onClick={() => isentar(d, false)}>Isentar</button><button className="btn sm" onClick={() => isentar(d, true)}>Feriado (todos)</button></span> : null}</td>}
          </tr>
        ))}</tbody>
        <tfoot><tr><td colSpan={7}><b>Total descontado no período</b></td><td className="r"><b>{total > 0 ? `− ${brl(total)}` : brl(0)}</b></td>{editavel && <td />}</tr></tfoot>
      </table></div>
    </div>
  );
}
