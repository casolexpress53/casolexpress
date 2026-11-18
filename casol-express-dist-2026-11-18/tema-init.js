/* aplica o tema salvo antes da primeira pintura (evita piscar). Fica em arquivo próprio para a CSP não precisar de 'unsafe-inline' em scripts. */
try {
  var t = localStorage.getItem('casol_tema');
  if (t === 'claro' || t === 'escuro') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
