import { Component } from 'react';

/* Se uma tela quebrar (ou um pedaço do sistema não carregar por ter sido atualizado), mostra um aviso com botão
   em vez de deixar a tela em branco. Quando o erro é de arquivo desatualizado, recarrega sozinho uma vez. */
const K = 'casol_recarga_auto';
const ehArquivoAntigo = (e) => /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|Unexpected token '<'|ChunkLoadError|error loading dynamically/i.test(String(e?.message || e));

export function recarregarUmaVez() {
  try {
    const ult = Number(sessionStorage.getItem(K) || 0);
    if (Date.now() - ult < 30000) return false;   // já tentou agora há pouco: não entra em laço
    sessionStorage.setItem(K, String(Date.now()));
  } catch { /* sem storage */ }
  window.location.reload();
  return true;
}

export default class ErroTela extends Component {
  state = { erro: null };
  static getDerivedStateFromError(erro) { return { erro }; }
  componentDidCatch(erro) {
    if (ehArquivoAntigo(erro)) recarregarUmaVez();
    else console.error(erro);
  }
  render() {
    if (!this.state.erro) return this.props.children;
    const antigo = ehArquivoAntigo(this.state.erro);
    return (
      <div className="card" role="alert" style={{ margin: 16 }}>
        <div className="empty">
          <b>{antigo ? 'O sistema foi atualizado' : 'Esta tela não abriu direito'}</b>
          <p>{antigo ? 'Estamos carregando a versão nova. Se não abrir sozinho, toque no botão.' : 'Seus dados estão salvos. Toque em Recarregar para voltar.'}</p>
          <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
            <button className="btn ac" onClick={() => window.location.reload()}>Recarregar</button>
            {!antigo && <button className="btn" onClick={() => this.setState({ erro: null })}>Tentar de novo</button>}
          </div>
        </div>
      </div>
    );
  }
}
