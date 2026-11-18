import { useEffect, useState } from 'react';

const K = 'casol_tema';
const ler = () => (document.documentElement.getAttribute('data-theme') === 'claro' ? 'claro' : 'escuro');

export function useTema() {
  const [tema, setTema] = useState(ler);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', tema === 'claro' ? '#f3f2ee' : '#000000');
    try { localStorage.setItem(K, tema); } catch { /* sem storage */ }
  }, [tema]);
  return [tema, () => setTema((t) => (t === 'escuro' ? 'claro' : 'escuro'))];
}

/* Logo preta (circular, vermelha) no tema escuro; logo branca (dourada) no tema claro. */
export const logoCompleta = (tema) => (tema === 'claro' ? '/logo-light.webp' : '/logo-dark.webp');
export const logoRedonda = (tema) => (tema === 'claro' ? '/logo-light-round.webp' : '/logo-dark.webp');
