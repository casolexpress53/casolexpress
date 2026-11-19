import { useEffect, useRef, useState } from 'react';

/* Esconder/mostrar listas. A escolha fica guardada neste navegador (conveniência de cada pessoa, não é dado da operação). */
const K = 'casol_recolher_';
const ler = (id) => { try { return localStorage.getItem(K + id) === '1'; } catch { return false; } };
const gravar = (id, v) => { try { localStorage.setItem(K + id, v ? '1' : '0'); } catch { /* sem storage */ } };
const textoDe = (c) => (Array.isArray(c) ? c.join('') : String(c ?? ''));

/* Título (h2) de um cartão com botão de ocultar. Quando oculto, só o título fica; o resto do cartão some.
   `id` fixa a memória da escolha (padrão: o texto do título sem números). */
export function H2({ children, id, style }) {
  const chave = id || textoDe(children).replace(/[\d().]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 70);
  const [oculto, setOculto] = useState(() => ler(chave));
  const ref = useRef(null);
  useEffect(() => {
    const card = ref.current?.closest('.card');
    if (!card) return undefined;
    let cab = ref.current;
    while (cab.parentElement && cab.parentElement !== card) cab = cab.parentElement;   // o filho do cartão que contém o título
    cab.classList.add('cab-rec');
    card.classList.toggle('recolhido', oculto);
    return () => card.classList.remove('recolhido');
  }, [oculto]);
  const alternar = () => setOculto((v) => { gravar(chave, !v); return !v; });
  return (
    <h2 ref={ref} className="h2rec" style={style}>
      <span>{children}</span>
      <button type="button" className="rec-btn" aria-expanded={!oculto} aria-label={`${oculto ? 'Mostrar' : 'Ocultar'} ${textoDe(children)}`} onClick={alternar}>{oculto ? 'Mostrar' : 'Ocultar'}</button>
    </h2>
  );
}

/* Trecho com cabeçalho próprio e botão (para listas dentro da tela do celular). */
export function Rec({ id, titulo, children, extra }) {
  const [oculto, setOculto] = useState(() => ler(id));
  const alternar = () => setOculto((v) => { gravar(id, !v); return !v; });
  return (
    <section style={{ marginTop: 14 }}>
      <div className="row between">
        <p className="k-l" style={{ margin: 0 }}>{titulo}</p>
        <span className="row">{extra}<button type="button" className="rec-btn" aria-expanded={!oculto} aria-label={`${oculto ? 'Mostrar' : 'Ocultar'} ${textoDe(titulo)}`} onClick={alternar}>{oculto ? 'Mostrar' : 'Ocultar'}</button></span>
      </div>
      {!oculto && children}
    </section>
  );
}
