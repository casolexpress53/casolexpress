import { useMemo, useState } from 'react';
import { brl, num, PERIODOS, periodo } from '../lib.js';
import { avaliarSla, METRICAS_SLA, penalidadeEfetiva, reducaoPorPacote, STATUS_SLA, temAlgumaMeta } from '../sla.js';
import { useStore } from '../store.js';
import { Chips, Icon, Vazio } from '../ui.jsx';
import { H2 } from '../components/Recolher.jsx';

/* resultado de uma meta: valor real (colorido) e a meta ao lado */
export const CelulaSla = ({ r }) => (r ? (
  <div><span className={`tag ${r.ok == null ? '' : r.ok ? 'ok' : 'bad'}`}>{r.texto}</span><div className="small muted">meta {r.alvoTexto}</div></div>
) : <span className="muted">—</span>);

/* Gestão: como cada motorista está contra as metas acordadas. As metas são definidas em Ajustes. */
export default function Sla({ ir }) {
  const S = useStore();
  const [per, setPer] = useState('mes');
  const P = periodo(per);
  const linhas = useMemo(() => {
    const ordem = { abaixo: 0, ok: 1, sem_dados: 2, sem_meta: 3 };
    return S.motoristas.filter((m) => m.ativo !== false).map((m) => ({ m, r: avaliarSla(S, m, P.ini, P.fim) })).sort((a, b) => ordem[a.r.status] - ordem[b.r.status] || a.m.nome.localeCompare(b.m.nome));
  }, [S, P.ini, P.fim]);
  const cont = (st) => linhas.filter((l) => l.r.status === st).length;

  if (!S.motoristas.length) return <div className="card"><Vazio titulo="Sem motoristas" texto="Cadastre motoristas em Ajustes para acompanhar as metas." /></div>;
  if (!temAlgumaMeta(S)) return (
    <div className="card"><Vazio titulo="Nenhuma meta definida" texto="Defina as metas acordadas (taxa de entrega, ocorrências, prazo, pacotes por dia) e crie a regra de cada motorista em Ajustes.">
      <button className="btn ac" onClick={() => ir?.('ajustes')}><Icon n="sliders" size={18} /> Configurar metas</button>
    </Vazio></div>
  );

  return (
    <div className="stack">
      <div className="row between"><Chips opcoes={PERIODOS.filter(([v]) => v !== '3m')} valor={per} onChange={setPer} /><button className="btn sm" onClick={() => ir?.('ajustes')}><Icon n="sliders" size={16} /> Editar metas</button></div>
      <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <div className="card"><div className="k-l">Cumprindo as metas</div><div className="k-v">{cont('ok')}</div></div>
        <div className="card"><div className="k-l">Abaixo da meta</div><div className="k-v" style={cont('abaixo') ? { color: 'var(--bad)' } : undefined}>{cont('abaixo')}</div></div>
        <div className="card"><div className="k-l">Sem dados ou sem meta</div><div className="k-v">{cont('sem_dados') + cont('sem_meta')}</div></div>
      </div>
      <div className="card">
        <H2>Metas por motorista</H2>
        <p className="sub">Só entram pacotes com baixa (entregue ou ocorrência). Quem está abaixo aparece primeiro.</p>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Motorista</th><th>Situação</th>{METRICAS_SLA.map((x) => <th key={x.k}>{x.rotulo}</th>)}<th>No pagamento</th><th className="r">Pacotes</th></tr></thead>
          <tbody>{linhas.map(({ m, r }) => {
            const [cls, rot] = STATUS_SLA[r.status];
            return (
              <tr key={m.id}>
                <td><b>{m.nome}</b></td>
                <td><span className={`tag ${cls}`}>{rot}{r.status === 'abaixo' ? ` (${r.abaixo})` : ''}</span></td>
                {METRICAS_SLA.map((x) => <td key={x.k}><CelulaSla r={r.regras.find((g) => g.k === x.k)} /></td>)}
                <td className="small">{(() => { const e = reducaoPorPacote(S, m, P.ini, P.fim); return e.aplica ? <span className="tag bad">− {brl(e.reducao)} por pacote</span> : penalidadeEfetiva(S, m) ? <span className="muted">sem redução</span> : <span className="muted">—</span>; })()}</td>
                <td className="r">{num(r.entregues)}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </div>
    </div>
  );
}
