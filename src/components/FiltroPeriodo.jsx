import { useState } from 'react';
import { dataBR, hoje, PERIODOS, periodo } from '../lib.js';
import { Chips } from '../ui.jsx';

/* Filtro de período reutilizável: atalhos (hoje, 7 dias, quinzena, mês…) ou datas livres.
   `useFiltroPeriodo('mes')` devolve { chave, setChave, de, ate, ini, fim, ativo, dentro(data), rotulo }.
   ini/fim ficam vazios quando o filtro é "Tudo". As datas de quinzena seguem os dias de fechamento de Ajustes. */
export function useFiltroPeriodo(padrao = 'tudo') {
  const [chave, setChave] = useState(padrao);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  let ini = '', fim = '';
  if (chave === 'datas') { ini = de || ''; fim = ate || ''; }
  else if (chave !== 'tudo') ({ ini, fim } = periodo(chave));
  const dentro = (d) => { const x = (d || '').slice(0, 10); return (!ini || x >= ini) && (!fim || x <= fim); };
  const rotulo = !ini && !fim ? 'todo o período' : `${ini ? dataBR(ini) : 'o início'} a ${fim ? dataBR(fim) : dataBR(hoje())}`;
  return { chave, setChave, de, setDe, ate, setAte, ini, fim, ativo: !!(ini || fim), dentro, rotulo };
}

const OPCOES = [['tudo', 'Tudo'], ...PERIODOS, ['datas', 'Escolher datas']];

export default function FiltroPeriodo({ f, onMudar }) {
  const ate = f.ate || hoje();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <Chips opcoes={OPCOES} valor={f.chave} onChange={(v) => { f.setChave(v); onMudar?.(); }} />
      {f.chave === 'datas' && (
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <label className="f">De<input className="inp" type="date" value={f.de} max={f.ate || undefined} onChange={(e) => { f.setDe(e.target.value); onMudar?.(); }} /></label>
          <label className="f">Até<input className="inp" type="date" value={f.ate} min={f.de || undefined} onChange={(e) => { f.setAte(e.target.value); onMudar?.(); }} /></label>
        </div>
      )}
      {f.ativo && <p className="small muted">Período: {f.rotulo}{f.chave === 'datas' && !f.ate ? ` (até hoje, ${dataBR(ate)})` : ''}</p>}
    </div>
  );
}
