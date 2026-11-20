import { atrasoPorDia } from '../atraso.js';
import { act } from '../store.js';
import { brl, dataBR, num, parse, valorMotorista } from '../lib.js';

const SEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const horaDe = (iso) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

/* Dias em que o motorista entregou depois do horário limite, com o desconto de cada um.
   Quem pode editar consegue isentar o dia (feriado, exceção) só para ele ou para todos, e desfazer. */
export default function AtrasoDias({ S, m, ini, fim, editavel }) {
  const dias = atrasoPorDia(S, m, ini, fim, valorMotorista(S, m));
  if (!dias.length) return null;
  const isentar = (d, todos) => {
    const motivo = window.prompt(todos ? `Isentar ${dataBR(d.data)} para TODOS os motoristas. Motivo (ex.: feriado):` : `Isentar ${dataBR(d.data)} só para ${m.nome}. Motivo (ex.: não teve rota):`, 'feriado');
    if (motivo === null) return;
    act.isentarDia(d.data, todos ? null : m.id, motivo);
  };
  return (
    <div className="list small" style={{ marginTop: 10 }}>
      <div className="item"><b>Entregas depois das {dias[0].hora}, por dia</b></div>
      {dias.map((d) => (
        <div className="item" key={d.data} style={{ flexWrap: 'wrap', gap: 8 }}>
          <span><b>{dataBR(d.data)}</b> <span className="muted">({SEM[parse(d.data).getDay()]})</span> · {num(d.atrasados)} pacote(s), a última às {horaDe(d.ultima)}{d.reducao > 0 ? <> · <span className={d.isento ? 'muted' : ''} style={d.isento ? { textDecoration: 'line-through' } : undefined}>− {brl(d.reducao)}</span></> : null}</span>
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
