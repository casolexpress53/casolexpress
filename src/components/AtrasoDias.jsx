import { desempenhoPorDia } from '../atraso.js';
import { act } from '../store.js';
import { brl, dataBR, num, parse } from '../lib.js';

const SEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const pct = (v) => `${Math.round(v * 100)}%`;

/* Dias em que o motorista não bateu a meta de performance do dia, com o desconto de cada um.
   Quem pode editar consegue isentar o dia (feriado, exceção) só para ele ou para todos, e desfazer. */
export default function AtrasoDias({ S, m, ini, fim, editavel }) {
  const dias = desempenhoPorDia(S, m, ini, fim).filter((d) => d.abaixo);
  if (!dias.length) return null;
  const isentar = (d, todos) => {
    const motivo = window.prompt(todos ? `Isentar ${dataBR(d.data)} para TODOS os motoristas. Motivo (ex.: feriado):` : `Isentar ${dataBR(d.data)} só para ${m.nome}. Motivo (ex.: não teve rota):`, 'feriado');
    if (motivo === null) return;
    act.isentarDia(d.data, todos ? null : m.id, motivo);
  };
  return (
    <div className="list small" style={{ marginTop: 10 }}>
      <div className="item"><b>Dias abaixo da meta de {dias[0].meta}% (corte às {dias[0].hora})</b></div>
      {dias.map((d) => (
        <div className="item" key={d.data} style={{ flexWrap: 'wrap', gap: 8 }}>
          <span><b>{dataBR(d.data)}</b> <span className="muted">({SEM[parse(d.data).getDay()]})</span> · carregou {num(d.carregados)}, entregou {num(d.ate)} até as {d.hora} (<b>{pct(d.perf)}</b>){d.valor > 0 ? <> · <span style={d.isento ? { textDecoration: 'line-through' } : undefined} className={d.isento ? 'muted' : ''}>− {brl(d.valor * d.pacotesDesconto)} ({num(d.pacotesDesconto)} pacotes do dia)</span></> : null}</span>
          <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {d.isento ? <>
              <span className="tag ok">Isento{d.isento.motivo ? `: ${d.isento.motivo}` : ''}{d.isento.motoristaId ? '' : ' (todos)'}</span>
              {editavel && <button className="btn sm" onClick={() => act.removerIsencao(d.isento.id)}>Desfazer isenção</button>}
            </> : editavel && <>
              <button className="btn sm" onClick={() => isentar(d, false)}>Isentar só {m.nome.split(' ')[0]}</button>
              <button className="btn sm" onClick={() => isentar(d, true)}>Isentar todos (feriado)</button>
            </>}
          </span>
        </div>
      ))}
    </div>
  );
}
