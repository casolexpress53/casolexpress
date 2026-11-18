import { useState } from 'react';
import { act, useStore } from '../store.js';
import { Icon, Vazio } from '../ui.jsx';

export default function Rastreador() {
  const S = useStore();
  const [f, setF] = useState({ placa: '', motoristaId: '', rastreadorId: '' });
  const add = () => { act.add('veiculos', { placa: f.placa.trim().toUpperCase(), motoristaId: f.motoristaId || null, rastreadorId: f.rastreadorId.trim(), instalado: false }); setF({ placa: '', motoristaId: '', rastreadorId: '' }); };

  return (
    <div className="stack">
      <div className="card ac">
        <h2>Rastreamento</h2>
        <p>Integração ainda não conectada. Enquanto isso, o sistema usa o GPS do celular do motorista na hora da baixa como posição de apoio.</p>
        <p className="k-s" style={{ marginTop: 8 }}>Quando houver um provedor de rastreamento definido, o acesso de integração fica no servidor, nunca no navegador.</p>
      </div>
      <div className="card">
        <h2>Veículos</h2>
        <p className="sub">O ID do rastreador é o número que o provedor mostra para cada aparelho. Pode deixar em branco por enquanto.</p>
        <div className="form">
          <label className="f">Placa<input className="inp" value={f.placa} onChange={(e) => setF({ ...f, placa: e.target.value })} maxLength={8} /></label>
          <label className="f">Motorista<select className="sel" value={f.motoristaId} onChange={(e) => setF({ ...f, motoristaId: e.target.value })}><option value="">Sem motorista</option>{S.motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>
          <label className="f">ID do rastreador<input className="inp" value={f.rastreadorId} onChange={(e) => setF({ ...f, rastreadorId: e.target.value })} /></label>
          <button className="btn ac" disabled={!f.placa.trim()} onClick={add}><Icon n="plus" size={18} /> Cadastrar</button>
        </div>
      </div>
      <div className="card">
        <h2>Veículos cadastrados ({S.veiculos.length})</h2>
        {!S.veiculos.length ? <Vazio titulo="Nenhum ainda" texto="Cadastre a placa e o motorista de cada veículo." /> : (
          <div className="list">{S.veiculos.map((v) => (
            <div className="item" key={v.id}>
              <span><b>{v.placa}</b><br /><span className="muted small">{S.motoristas.find((m) => m.id === v.motoristaId)?.nome || 'Sem motorista'}{v.rastreadorId ? ` · rastreador ${v.rastreadorId}` : ''}</span></span>
              <span className="row"><button className={`chip ${v.instalado ? 'on' : ''}`} onClick={() => act.upd('veiculos', v.id, { instalado: !v.instalado })}>{v.instalado ? 'Rastreador instalado' : 'Aguardando instalação'}</button>
                <button className="btn sm danger" onClick={() => act.del('veiculos', v.id)} aria-label="Remover veículo"><Icon n="x" size={14} /></button></span>
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}
