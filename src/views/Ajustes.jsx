import { useState } from 'react';
import { temServidor } from '../auth.js';
import AcessoBox from '../components/AcessoBox.jsx';
import { brl } from '../lib.js';
import { act, getState, recarregar, useStore } from '../store.js';
import { METRICAS_SLA, MODOS_SLA, regrasEfetivas } from '../sla.js';
import { Icon, Money } from '../ui.jsx';

/* grava só ao sair do campo (evita regravar a cada tecla) */
const Texto = ({ valor, onSave, ...r }) => <input className="inp" defaultValue={valor} key={valor} onBlur={(e) => e.target.value.trim() && e.target.value !== valor && onSave(e.target.value.trim())} {...r} />;

/* campo de meta: vazio = sem meta */
const Meta = ({ m, valor, onChange }) => (
  <input className="inp" type="number" min="0" max={m.un === '%' ? 100 : undefined} step="0.1" inputMode="decimal" placeholder="sem meta" value={valor ?? ''} aria-label={m.rotulo}
    onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))} />
);

export default function Ajustes() {
  const S = useStore();
  const [m, setM] = useState({ nome: '', tipo: 'pacote', valor: 0 });
  const [e, setE] = useState({ nome: '', tarifa: 0, prazoDias: 1 });
  const [cat, setCat] = useState('');
  const [carregando, setCarregando] = useState(false);

  const backup = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' }));
    a.download = `casol-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="stack">
      <div className="card">
        <h2>Motoristas</h2>
        <p className="sub">Quanto cada um recebe. Fixos têm salário mensal (a quinzena paga metade). Os demais recebem por pacote entregue; deixe em branco para usar o valor padrão.</p>
        <div className="list">
          {S.motoristas.map((x) => (
            <div className="item" key={x.id} style={{ alignItems: 'end' }}>
              <label className="f" style={{ flex: '2 1 200px' }}>Nome<Texto valor={x.nome} onSave={(v) => act.upd('motoristas', x.id, { nome: v })} /></label>
              <label className="f" style={{ flex: '1 1 130px' }}>Tipo<select className="sel" value={x.tipo} onChange={(ev) => act.upd('motoristas', x.id, { tipo: ev.target.value })}><option value="pacote">Por pacote</option><option value="fixo">Fixo (mensal)</option></select></label>
              <label className="f" style={{ flex: '1 1 130px' }}>{x.tipo === 'fixo' ? 'Salário mensal' : 'Por pacote'}<Money valor={x.valor} onChange={(v) => act.upd('motoristas', x.id, { valor: v })} /></label>
              {temServidor && <AcessoBox tipo="motorista" item={x} aoMudar={recarregar} />}
              <button className="btn sm danger" onClick={() => window.confirm(`Remover ${x.nome}? As paradas dele ficam sem motorista.`) && (act.del('motoristas', x.id), S.paradas.filter((p) => p.motoristaId === x.id).forEach((p) => act.upd('paradas', p.id, { motoristaId: null })))} aria-label={`Remover ${x.nome}`}><Icon n="x" size={14} /></button>
            </div>
          ))}
        </div>
        <div className="form" style={{ marginTop: 12 }}>
          <label className="f">Novo motorista<input className="inp" value={m.nome} onChange={(ev) => setM({ ...m, nome: ev.target.value })} /></label>
          <label className="f">Tipo<select className="sel" value={m.tipo} onChange={(ev) => setM({ ...m, tipo: ev.target.value })}><option value="pacote">Por pacote</option><option value="fixo">Fixo (mensal)</option></select></label>
          <label className="f">{m.tipo === 'fixo' ? 'Salário mensal' : 'Por pacote'}<Money live valor={m.valor} onChange={(v) => setM({ ...m, valor: v })} /></label>
          <button className="btn ac" disabled={!m.nome.trim()} onClick={() => { act.add('motoristas', { nome: m.nome.trim(), tipo: m.tipo, valor: m.valor, ativo: true }); setM({ nome: '', tipo: 'pacote', valor: 0 }); }}><Icon n="plus" size={18} /> Adicionar</button>
        </div>
      </div>

      <div className="card">
        <h2>Valores e prazos</h2>
        <label className="f" style={{ maxWidth: 320 }}>Valor padrão por pacote entregue (motoristas)<Money valor={S.ajustes.valorPadrao} onChange={(v) => act.ajustes({ valorPadrao: v })} /></label>
        <h2 style={{ marginTop: 24 }}>Empresas ({S.empresas.length})</h2>
        <p className="sub">“Recebe por pacote” é o valor que a empresa parceira paga a vocês. Sem ele, receita e margem não aparecem no painel. O prazo diz em quantos dias a entrega ainda conta como no prazo.</p>
        <div className="list">
          {S.empresas.map((x) => (
            <div className="item" key={x.id} style={{ alignItems: 'end' }}>
              <label className="f" style={{ flex: '2 1 180px' }}>Nome<Texto valor={x.nome} onSave={(v) => act.upd('empresas', x.id, { nome: v })} /></label>
              <label className="f" style={{ flex: '1 1 130px' }}>Recebe por pacote<Money valor={x.tarifa} onChange={(v) => act.upd('empresas', x.id, { tarifa: v })} /></label>
              <label className="f" style={{ flex: '1 1 100px' }}>Prazo (dias)<input className="inp" type="number" min="0" max="30" value={x.prazoDias} onChange={(ev) => act.upd('empresas', x.id, { prazoDias: Math.max(0, Number(ev.target.value) || 0) })} /></label>
              <button className="btn sm danger" disabled={S.romaneios.some((r) => r.empresaId === x.id)} title={S.romaneios.some((r) => r.empresaId === x.id) ? 'Tem romaneios importados' : ''} onClick={() => act.del('empresas', x.id)} aria-label={`Remover ${x.nome}`}><Icon n="x" size={14} /></button>
            </div>
          ))}
        </div>
        <div className="form" style={{ marginTop: 12 }}>
          <label className="f">Nova empresa<input className="inp" value={e.nome} onChange={(ev) => setE({ ...e, nome: ev.target.value })} /></label>
          <label className="f">Recebe por pacote<Money live valor={e.tarifa} onChange={(v) => setE({ ...e, tarifa: v })} /></label>
          <label className="f">Prazo (dias)<input className="inp" type="number" min="0" max="30" value={e.prazoDias} onChange={(ev) => setE({ ...e, prazoDias: Number(ev.target.value) || 0 })} /></label>
          <button className="btn ac" disabled={!e.nome.trim()} onClick={() => { act.add('empresas', { nome: e.nome.trim(), tarifa: e.tarifa, prazoDias: e.prazoDias }); setE({ nome: '', tarifa: 0, prazoDias: 1 }); }}><Icon n="plus" size={18} /> Cadastrar</button>
        </div>
      </div>

      <div className="card">
        <h2>Metas de SLA dos motoristas</h2>
        <p className="sub">As metas acordadas. Deixe em branco o que não for avaliar. A meta padrão vale para todo motorista que não tiver regra própria; a gestão acompanha na aba SLA.</p>
        <div className="form">
          {METRICAS_SLA.map((x) => (
            <label className="f" key={x.k} title={x.ajuda}>{x.rotulo} ({x.op === '>=' ? 'mínimo' : 'máximo'}{x.un === '%' ? ', %' : ', por dia'})
              <Meta m={x} valor={S.ajustes.sla?.[x.k]} onChange={(v) => act.ajustes({ sla: { ...S.ajustes.sla, [x.k]: v } })} />
            </label>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>{METRICAS_SLA.map((x) => `${x.rotulo}: ${x.ajuda}`).join(' ')}</p>
        <h3 style={{ font: 'italic 700 16px var(--f1)', textTransform: 'uppercase', margin: '20px 0 4px' }}>Regra de cada motorista</h3>
        {S.motoristas.length === 0 ? <p className="small muted">Cadastre motoristas acima para definir regras por motorista.</p> : (
          <div className="list">
            {S.motoristas.map((mo) => {
              const modo = mo.sla?.modo || 'padrao';
              const setSla = (patch) => act.upd('motoristas', mo.id, { sla: { ...mo.sla, ...patch } });
              const n = regrasEfetivas(S, mo).length;
              return (
                <div className="item" key={mo.id} style={{ alignItems: 'end' }}>
                  <div style={{ flex: '1 1 170px' }}><b>{mo.nome}</b><div className="small muted">{modo === 'nenhuma' ? 'Não é avaliado' : `${n} meta(s) valendo`}</div></div>
                  <label className="f" style={{ flex: '1 1 190px' }}>Regra<select className="sel" value={modo} onChange={(e) => setSla({ modo: e.target.value })}>{MODOS_SLA.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></label>
                  {modo === 'proprio' && METRICAS_SLA.map((x) => (
                    <label className="f" key={x.k} style={{ flex: '1 1 110px' }}>{x.rotulo}<Meta m={x} valor={mo.sla?.[x.k]} onChange={(v) => setSla({ [x.k]: v })} /></label>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>Meta do mês</h2>
          <p className="sub">Meta de pacotes entregues por mês. Vale para todos os meses até você mudar.</p>
          <label className="f" style={{ maxWidth: 220 }}>Pacotes por mês<input className="inp" type="number" min="0" value={S.ajustes.meta || ''} onChange={(ev) => act.ajustes({ meta: Math.max(0, Number(ev.target.value) || 0) })} /></label>
        </div>
        <div className="card">
          <h2>Categorias do caixa</h2>
          <p className="sub">Crie as suas além das que já vêm prontas.</p>
          <div className="chips">{S.ajustes.categorias.map((c) => <button key={c} className="chip" onClick={() => act.ajustes({ categorias: S.ajustes.categorias.filter((x) => x !== c) })} title="Remover">{c} ✕</button>)}</div>
          <div className="row" style={{ marginTop: 12 }}>
            <input className="inp" style={{ flex: 1 }} placeholder="Nova categoria" value={cat} onChange={(ev) => setCat(ev.target.value)} />
            <button className="btn" disabled={!cat.trim()} onClick={() => { act.ajustes({ categorias: [...new Set([...S.ajustes.categorias, cat.trim()])] }); setCat(''); }}>Adicionar</button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Dados</h2>
        {temServidor ? (<>
          <p className="sub">Os dados ficam salvos na nuvem (Supabase da Casol). O arquivo abaixo é uma cópia extra, para guardar fora do sistema.</p>
          <div className="row"><button className="btn" onClick={backup}>Baixar cópia (JSON)</button></div>
        </>) : (<>
          <p className="sub">Hoje os dados ficam só neste navegador. Faça backup antes de limpar o navegador. Quando o Supabase for conectado, tudo passa a ficar na nuvem.</p>
          <div className="row">
            <button className="btn" onClick={backup}>Baixar backup (JSON)</button>
            <button className="btn" disabled={carregando} onClick={async () => { if (!S.romaneios.length || window.confirm('Isso substitui tudo pelos dados fictícios. Continuar?')) { setCarregando(true); await act.carregarDemo(); setCarregando(false); } }}>Carregar dados fictícios</button>
            <button className="btn danger" onClick={() => window.confirm('Apagar TODOS os dados deste navegador? Isso não pode ser desfeito.') && act.limpar()}>Apagar tudo</button>
          </div>
          {S.demo && <p className="small warn" style={{ marginTop: 10 }}>Os dados atuais são fictícios de demonstração ({brl(S.ajustes.saldoInicial)} de saldo inicial é inventado).</p>}
        </>)}
      </div>
    </div>
  );
}
