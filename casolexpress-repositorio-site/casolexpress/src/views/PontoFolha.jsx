import { useState } from 'react';
import { dataBR, pad, rotuloMes, shiftMes } from '../lib.js';
import { gerarPdf } from '../pdf.js';
import { CURTO, fmtMin, fmtSaldo, hhmm, TIPOS } from '../ponto-lib.js';
import { Icon } from '../ui.jsx';

const NOTA = 'Registro gerado pelo controle de ponto por localização da Casol Express. Não substitui sistema de ponto homologado quando a lei exigir.';
const ESTADO = { vazio: '', incompleto: 'Incompleto', aberto: 'Em andamento', ordem: 'Horários fora de ordem' };


export function NavMes({ mes, onChange, max }) {
  return (
    <div className="row">
      <button className="btn icon" onClick={() => onChange(shiftMes(mes, -1))} aria-label="Mês anterior"><Icon n="left" /></button>
      <b style={{ font: 'italic 800 22px var(--f1)', minWidth: 170, textAlign: 'center' }}>{rotuloMes(mes)}</b>
      <button className="btn icon" disabled={mes >= max} onClick={() => onChange(shiftMes(mes, 1))} aria-label="Próximo mês"><Icon n="right" /></button>
    </div>
  );
}

/* Folha do mês de um colaborador: tabela, totais e exportação (PDF e planilha). */
export default function PontoFolha({ nome, funcao, mes, folha, cargaMin, onEditar }) {
  const [busy, setBusy] = useState('');
  const visiveis = folha.dias.filter((d) => !d.futuro);
  const celula = (d, t) => (d.t[t] != null ? hhmm(d.t[t]) : '');
  const linhas = visiveis.map((d) => [`${pad(d.n)}/${mes.slice(5, 7)}`, d.sem, ...TIPOS.map((t) => celula(d, t)), d.estado === 'fechado' ? fmtMin(d.min) : ESTADO[d.estado]]);
  const resumo = [
    ['Colaborador', `${nome}${funcao ? ` · ${funcao}` : ''}`], ['Total de horas', fmtMin(folha.total)], ['Dias trabalhados', String(folha.diasTrab)], ['Dias com pendência', String(folha.pendencias)],
    ...(folha.saldo == null ? [] : [['Carga diária informada', fmtMin(cargaMin)], ['Saldo sobre a carga informada', fmtSaldo(folha.saldo)]]),
  ];
  const arquivo = `folha-ponto-${nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${mes.slice(0, 7)}`;
  const pdf = async () => { setBusy('pdf'); try { await gerarPdf({ titulo: 'Folha de ponto', subtitulo: `${nome} · ${rotuloMes(mes)}`, colunas: ['Dia', 'Sem.', ...TIPOS.map((t) => CURTO[t]), 'Horas'], linhas, resumo, nota: NOTA, arquivo: `${arquivo}.pdf` }); } finally { setBusy(''); } };
  const planilha = async () => {
    setBusy('xls');
    try {
      const X = await import('xlsx');
      const ws = X.utils.aoa_to_sheet([['Folha de ponto', nome, rotuloMes(mes)], [], ['Dia', 'Sem.', ...TIPOS.map((t) => CURTO[t]), 'Horas'], ...linhas, [], ...resumo, [], [NOTA]]);
      const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Folha'); X.writeFile(wb, `${arquivo}.xlsx`);
    } finally { setBusy(''); }
  };

  return (
    <div className="stack">
      <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="card"><div className="k-l">Total de horas</div><b style={{ font: 'italic 800 28px var(--f1)' }}>{fmtMin(folha.total)}</b></div>
        <div className="card"><div className="k-l">Dias trabalhados</div><b style={{ font: 'italic 800 28px var(--f1)' }}>{folha.diasTrab}</b></div>
        <div className="card"><div className="k-l">Dias com pendência</div><b style={{ font: 'italic 800 28px var(--f1)' }}>{folha.pendencias}</b></div>
        {folha.saldo != null && <div className="card"><div className="k-l">Saldo (carga {fmtMin(cargaMin)}/dia)</div><b style={{ font: 'italic 800 28px var(--f1)' }}>{fmtSaldo(folha.saldo)}</b></div>}
      </div>
      <div className="card">
        <div className="row between" style={{ marginBottom: 8 }}>
          <p className="sub" style={{ margin: 0 }}>Só dias fechados (com saída) entram na soma. Sem regras de feriado, hora extra ou banco de horas: isso a Casol define.</p>
          <div className="row"><button className="btn sm" disabled={!!busy} onClick={pdf}><Icon n="print" size={16} /> {busy === 'pdf' ? 'Gerando…' : 'PDF'}</button><button className="btn sm" disabled={!!busy} onClick={planilha}>{busy === 'xls' ? 'Gerando…' : 'Planilha'}</button></div>
        </div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Dia</th>{TIPOS.map((t) => <th key={t}>{CURTO[t]}</th>)}<th className="r">Horas</th>{onEditar && <th />}</tr></thead>
          <tbody>
            {visiveis.map((d) => (
              <tr key={d.data}>
                <td><b>{pad(d.n)}</b> <span className="muted small">{d.sem}</span></td>
                {TIPOS.map((t) => <td key={t}>{celula(d, t) || <span className="muted">·</span>}</td>)}
                <td className="r">{d.estado === 'fechado' ? <b>{fmtMin(d.min)}</b> : ESTADO[d.estado] ? <span className={`tag ${d.estado === 'aberto' ? '' : 'warn'}`}>{ESTADO[d.estado]}</span> : <span className="muted">—</span>}</td>
                {onEditar && <td className="r"><button className="btn sm" onClick={() => onEditar(d)} aria-label={`Editar ${dataBR(d.data)}`}>Editar</button></td>}
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
