import { useState } from 'react';
import { dataBR, hoje, PERIODOS, periodo } from '../lib.js';
import { Chips } from '../ui.jsx';

/* Filtro de período reutilizável: atalhos (hoje, 7 dias, quinzena, mês…) ou datas livres.
   `useFiltroPeriodo('mes')` devolve { chave, setChave, de, ate, ini, fim, ativo, dentro(data), rotulo }.
   ini/fim ficam vazios quando o filtro é "Tudo". As datas de quinzena seguem os dias de fechamento de Ajustes. */
export function useFiltroPeriodo(padrao = 'tudo', { tudo = true } = {}) {
  const [chave, setChave] = useState(padrao);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  let ini = '', fim = '';
  if (chave === 'datas') { ini = de || ''; fim = ate || ''; }
  else if (chave !== 'tudo') ({ ini, fim } = periodo(chave));
  const dentro = (d) => { const x = (d || '').slice(0, 10); return (!ini || x >= ini) && (!fim || x <= fim); };
  const rotulo = !ini && !fim ? 'todo o período' : `${ini ? dataBR(ini) : 'o início'} a ${fim ? dataBR(fim) : dataBR(hoje())}`;
  const P = periodo(chave === 'tudo' ? 'mes' : chave, hoje(), de, ate);   // sempre com início e fim (para painel, SLA e comissão)
  return { chave, setChave, de, setDe, ate, setAte, ini, fim, ativo: !!(ini || fim), dentro, rotulo, P, semTudo: !tudo };
}

const OPCOES = [['tudo', 'Tudo'], ...PERIODOS, ['datas', 'Escolher datas']];
const SEM_TUDO = OPCOES.filter(([k]) => k !== 'tudo');

export default function FiltroPeriodo({ f, onMudar }) {
  const ate = f.ate || hoje();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <Chips opcoes={f.semTudo ? SEM_TUDO : OPCOES} valor={f.chave} onChange={(v) => { f.setChave(v); onMudar?.(); }} />
      {f.chave === 'datas' && (
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <label className="f">De<input className="inp" type="date" value={f.de} max={f.ate || undefined} onChange={(e) => { f.setDe(e.target.value); onMudar?.(); }} /></label>
          <label className="f">Até<input className="inp" type="date" value={f.ate} min={f.de || undefined} onChange={(e) => { f.setAte(e.target.value); onMudar?.(); }} /></label>
        </div>
      )}
      {(f.ativo || f.semTudo) && <p className="small muted">Período: {f.semTudo ? `${dataBR(f.P.ini)} a ${dataBR(f.P.fim)}` : f.rotulo}{f.chave === 'datas' && !f.ate ? ` (até hoje, ${dataBR(ate)})` : ''}</p>}
    </div>
  );
}
