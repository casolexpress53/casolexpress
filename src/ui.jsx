import { useEffect, useRef, useState } from 'react';
import { centavos, reais } from './lib.js';

const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  truck: 'M2 6h12v10H2zM14 9h4.5L22 12.5V16h-8M4.8 19a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0 -3.4 0M15.8 19a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0 -3.4 0',
  percent: 'M19 5 5 19M4.5 6.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M15.5 17.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14.5h2',
  pin: 'M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21zM9.5 9.5a2.5 2.5 0 1 0 5.0 0a2.5 2.5 0 1 0 -5.0 0',
  sliders: 'M4 6h9m4 0h3M4 12h3m4 0h9M4 18h11m4 0h1M15 4v4M9 10v4M17 16v4',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sun: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  left: 'M15 18l-6-6 6-6', right: 'M9 18l6-6-6-6', down: 'M6 9l6 6 6-6',
  plus: 'M12 5v14M5 12h14', check: 'M20 6 9 17l-5-5', x: 'M18 6 6 18M6 6l12 12',
  print: 'M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  target: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M7.5 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M3.5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  clock: 'M12 7v5l3 2M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
};
export const Icon = ({ n, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={P[n]} />
  </svg>
);

export function Modal({ aberto, fechar, titulo, children }) {
  useEffect(() => {
    if (!aberto) return;
    const f = (e) => e.key === 'Escape' && fechar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [aberto, fechar]);
  if (!aberto) return null;
  return (
    <div className="ovl" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

export const Chips = ({ opcoes, valor, onChange }) => (
  <div className="chips" role="group">
    {opcoes.map(([v, r, extra]) => (
      <button key={v} type="button" className={`chip${valor === v ? ' on' : ''}`} aria-pressed={valor === v} onClick={() => onChange(v)}>
        {r}{extra !== undefined && <small>{extra}</small>}
      </button>
    ))}
  </div>
);

/* Campo de dinheiro: digita "12,50" e o valor vira centavos.
   live=false (padrão): grava ao sair do campo (bom para ajustes já salvos).
   live=true: atualiza a cada tecla (bom para formulários com botão "Lançar"/"Adicionar"). */
export function Money({ valor, onChange, live = false, placeholder = '0,00', ...rest }) {
  const [t, setT] = useState(reais(valor));
  const foco = useRef(false);
  useEffect(() => { if (!foco.current) setT(reais(valor)); }, [valor]);
  const mudou = (e) => { setT(e.target.value); if (live) { const c = centavos(e.target.value); if (c !== valor) onChange(c); } };
  const fim = () => { foco.current = false; const c = centavos(t); setT(reais(c)); if (c !== valor) onChange(c); };
  return (
    <input className="inp" inputMode="decimal" placeholder={placeholder} value={t} onChange={mudou} onFocus={() => (foco.current = true)} onBlur={fim} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} {...rest} />
  );
}

export const Vazio = ({ titulo, texto, children }) => (
  <div className="empty"><b>{titulo}</b><p>{texto}</p>{children}</div>
);

export const Delta = ({ atual, anterior }) => {
  if (!anterior) return null;
  const d = (atual - anterior) / anterior;
  return <span className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? '▲' : '▼'} {Math.abs(Math.round(d * 100))}% vs. período anterior</span>;
};
