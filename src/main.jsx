import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErroTela, { recarregarUmaVez } from './components/ErroTela.jsx';
import './styles.css';

// o Vite avisa quando um pedaço do sistema (já substituído por uma atualização) não carrega: busca a versão nova
window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); recarregarUmaVez(); });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErroTela><App /></ErroTela>
  </StrictMode>,
);
