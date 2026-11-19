import { useState } from 'react';
import { temServidor } from '../auth.js';
import AcessoBox from '../components/AcessoBox.jsx';
import { exemploFaixas, faixasDe, regraAtraso, UNIDADES } from '../atraso.js';
import { brl, norm } from '../lib.js';
import { act, getState, recarregar, useStore } from '../store.js';
import { METRICAS_SLA, MODOS_SLA, regrasEfetivas } from '../sla.js';
import { Icon, Money } from '../ui.jsx';
import { H2 } from '../components/Recolher.jsx';

/* grava só ao sair do campo (evita regravar a cada tecla) */
const Texto = ({ valor, onSave, ...r }) => <input className="inp" defaultValue={valor} key={valor} onBlur={(e) => e.target.value.trim() && e.target.value !== valor && onSave(e.target.value.trim())} {...r} />;

/* campos da regra de redução por atraso (padrão ou própria do motorista): horário limite + faixas livres */
function CamposAtraso({ r = {}, onChange }) {
  const faixas = faixasDe(r);
  const set = (patch) => onChange({ ...r, ...patch });
  const setF = (i, patch) => set({ faixas: faixas.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  return (
    <div className="stack">
      <div className="form">
        <label className="f">Horário limite (no dia da rota)<input className="inp" type="time" value={r.hora || ''} onChange={(e) => set({ hora: e.target.value })} /></label>
        <label className="f">Valor mínimo por pacote (R$, opcional)<Money valor={r.minimo || 0} onChange={(v) => set({ minimo: v })} /></label>
      </div>
      <div className="list">
        {faixas.map((f, i) => (
          <div className="item" key={i} style={{ alignItems: 'end', gap: 8, flexWrap: 'wrap' }}>
            <label className="f" style={{ flex: '1 1 130px' }}>Quando<select className="sel" value={f.repetir ? 'cada' : 'uma'} onChange={(e) => setF(i, { repetir: e.target.value === 'cada' })}><option value="uma">Depois de (uma vez)</option><option value="cada">A cada (repete)</option></select></label>
            <label className="f" style={{ flex: '0 1 90px' }}>Tempo<input className="inp" type="number" min="1" step="1" inputMode="numeric" value={f.apos ?? ''} onChange={(e) => setF(i, { apos: e.target.value === '' ? '' : Math.max(1, Math.round(Number(e.target.value))) })} /></label>
            <label className="f" style={{ flex: '0 1 120px' }}>Unidade<select className="sel" value={f.un || 'min'} onChange={(e) => setF(i, { un: e.target.value })}>{Object.entries(UNIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="f" style={{ flex: '1 1 130px' }}>Reduzir por pacote (R$)<Money valor={f.valor || 0} onChange={(v) => setF(i, { valor: v })} /></label>
            <button type="button" className="btn" aria-label="Remover faixa" onClick={() => set({ faixas: faixas.filter((_, j) => j !== i) })}>Remover</button>
          </div>
        ))}
      </div>
      <div><button type="button" className="btn" onClick={() => set({ faixas: [...faixas, { apos: 1, un: 'min', valor: 0, repetir: false }] })}>+ Adicionar faixa de atraso</button></div>
      <p className="small muted">Minutos e horas contam depois do horário limite. “Dias” conta dias de calendário depois do dia da rota (entregou no dia seguinte = 1 dia). As reduções das faixas atingidas se somam.</p>
    </div>
  );
}

/* tabela de prazo por cidade (D + N): cidades que já apareceram nos romaneios + importação da aba "Regiões" da planilha de controle */
function PrazosCidade({ S }) {
  const tab = S.ajustes.prazosCidade || {};
  const [msg, setMsg] = useState('');
  const cidades = [...new Map(S.paradas.filter((p) => p.cidade).map((p) => [norm(p.cidade), p.cidade])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const set = (k, d) => act.ajustes({ prazosCidade: { ...tab, [k]: d } });
  async function importar(file) {
    if (!file) return; setMsg('');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer());
      const nome = wb.SheetNames.find((n) => norm(n) === 'regioes');
      if (!nome) return setMsg('Não achei a aba "Regiões" nesse arquivo.');
      const novo = { ...tab }; let n = 0;
      for (const r of XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: '' }).slice(1)) for (const [a, b] of [[0, 1], [2, 3]]) {
        const d = String(r[b]).match(/D\s*\+\s*(\d+)/i);
        if (r[a] && d) { novo[norm(String(r[a]))] = Number(d[1]); n++; }
      }
      act.ajustes({ prazosCidade: novo }); setMsg(`${n} cidades importadas.`);
    } catch { setMsg('Não consegui ler esse arquivo.'); }
  }
  return (
    <div className="stack">
      <label className="btn sm" style={{ alignSelf: 'start' }}>Importar da planilha de controle (aba Regiões)<input type="file" accept=".xlsx,.xls" hidden onChange={(e) => { importar(e.target.files[0]); e.target.value = ''; }} /></label>
      {msg && <p className="small muted" role="status">{msg}</p>}
      {cidades.length === 0 ? <p className="small muted">As cidades aparecem aqui depois que você importar um romaneio.</p> : (
        <div className="list">{cidades.map(([k, nome]) => (
          <div className="item" key={k}><span>{nome}</span>
            <label className="row" style={{ gap: 6 }}>D +<input className="inp" style={{ width: 70 }} type="number" min="0" max="30" value={tab[k] ?? 0} onChange={(e) => set(k, Math.max(0, Math.round(Number(e.target.value) || 0)))} aria-label={`Prazo de ${nome}`} /></label>
          </div>))}
        </div>)}
    </div>
  );
}

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
        <H2>Motoristas</H2>
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
        <H2>Valores e prazos</H2>
        <label className="f" style={{ maxWidth: 320 }}>Valor padrão por pacote entregue (motoristas)<Money valor={S.ajustes.valorPadrao} onChange={(v) => act.ajustes({ valorPadrao: v })} /></label>
        <H2 style={{ marginTop: 24 }}>Empresas ({S.empresas.length})</H2>
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
        <H2>Metas de SLA dos motoristas</H2>
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

      <div className="card">
        <H2 id="prazo-cidade">Prazo de entrega por cidade</H2>
        <p className="sub">Como na planilha de controle: <b>D + 0</b> vence no dia do carregamento, <b>D + 1</b> no dia seguinte, e assim por diante. É isso que define “vence hoje”, “no prazo” e “fora do prazo” no SLA. Cidade sem prazo conta como D + 0.</p>
        <PrazosCidade S={S} />
      </div>

      <div className="card">
        <H2 id="reducao-atraso">Redução por atraso na entrega</H2>
        <p className="sub">Se o motorista entregar depois do horário combinado, o valor de <b>cada pacote</b> é reduzido. Você define o horário limite do <b>dia da rota</b> e as faixas: depois de quantos minutos, horas ou dias, ou a cada quanto tempo, e quanto reduz. O dia e a hora são os de Brasília. Vale para quem é pago por pacote; o salário fixo não muda. O desconto aparece na Comissão, linha por linha.</p>
        <label className="row"><input type="checkbox" checked={!!S.ajustes.reducaoAtraso?.ativo} onChange={(e) => act.ajustes({ reducaoAtraso: { ...S.ajustes.reducaoAtraso, ativo: e.target.checked } })} /> <b>Usar a redução por atraso para todos os motoristas</b></label>
        <CamposAtraso r={S.ajustes.reducaoAtraso} onChange={(r) => act.ajustes({ reducaoAtraso: { ...S.ajustes.reducaoAtraso, ...r } })} />
        {(() => {
          const base = S.ajustes.valorPadrao > 0 ? S.ajustes.valorPadrao : (S.motoristas.find((x) => x.tipo !== 'fixo' && x.valor > 0)?.valor || 280);
          const regra = regraAtraso({ ajustes: { reducaoAtraso: { ...S.ajustes.reducaoAtraso, ativo: true } } }, { tipo: 'pacote' });
          return regra ? (
            <div className="list small" style={{ marginTop: 10 }}>
              <div className="item"><b>Exemplo com {brl(base)} por pacote</b><span className="muted">{S.ajustes.reducaoAtraso?.ativo ? '' : '(a regra está desligada)'}</span></div>
              {exemploFaixas(regra, base).map((f) => <div className="item" key={f.rotulo}><span>{f.rotulo}</span><b>{brl(f.valor)}</b></div>)}
            </div>
          ) : <p className="small muted" style={{ marginTop: 10 }}>Preencha o horário e adicione pelo menos uma faixa com valor para ver o exemplo.</p>;
        })()}
        <h3 style={{ font: 'italic 700 16px var(--f1)', textTransform: 'uppercase', margin: '20px 0 4px' }}>Por motorista</h3>
        <p className="small muted">Por padrão, todos seguem a regra acima. Aqui dá para dar uma regra própria a um motorista ou isentá-lo.</p>
        {S.motoristas.length === 0 ? <p className="small muted">Cadastre motoristas acima.</p> : (
          <div className="list">
            {S.motoristas.map((mo) => {
              const ra = mo.reducaoAtraso || {}, modo = ra.modo || 'padrao';
              return (
                <div className="item" key={mo.id} style={{ alignItems: 'end' }}>
                  <div style={{ flex: '1 1 170px' }}><b>{mo.nome}</b>{mo.tipo === 'fixo' && <div className="small muted">Salário fixo: não sofre redução</div>}</div>
                  <label className="f" style={{ flex: '1 1 200px' }}>Redução por atraso
                    <select className="sel" value={modo} onChange={(e) => act.upd('motoristas', mo.id, { reducaoAtraso: { ...ra, modo: e.target.value } })}>
                      <option value="padrao">Usar a regra geral</option><option value="proprio">Regra própria</option><option value="nenhuma">Sem redução</option>
                    </select>
                  </label>
                  {modo === 'proprio' && <div style={{ flex: '1 1 100%' }}><CamposAtraso r={ra} onChange={(r) => act.upd('motoristas', mo.id, { reducaoAtraso: { ...ra, ...r, modo: 'proprio' } })} /></div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid g2">
        <div className="card">
          <H2>Meta do mês</H2>
          <p className="sub">Use uma ou as duas: uma quantidade de pacotes entregues e/ou um percentual sobre <b>todos os pacotes do mês</b> (entregues, pendentes e com ocorrência). Vale para todos os meses até você mudar.</p>
          <label className="f" style={{ maxWidth: 220 }}>Pacotes por mês<input className="inp" type="number" min="0" value={S.ajustes.meta || ''} onChange={(ev) => act.ajustes({ meta: Math.max(0, Number(ev.target.value) || 0) })} /></label>
          <label className="f" style={{ maxWidth: 220, marginTop: 10 }}>% dos pacotes do mês<input className="inp" type="number" min="0" max="100" step="0.1" inputMode="decimal" placeholder="ex.: 95" value={S.ajustes.metaPct || ''} onChange={(ev) => act.ajustes({ metaPct: Math.min(100, Math.max(0, Number(ev.target.value) || 0)) })} /></label>
        </div>
        <div className="card">
          <H2>Categorias do caixa</H2>
          <p className="sub">Crie as suas além das que já vêm prontas.</p>
          <div className="chips">{S.ajustes.categorias.map((c) => <button key={c} className="chip" onClick={() => act.ajustes({ categorias: S.ajustes.categorias.filter((x) => x !== c) })} title="Remover">{c} ✕</button>)}</div>
          <div className="row" style={{ marginTop: 12 }}>
            <input className="inp" style={{ flex: 1 }} placeholder="Nova categoria" value={cat} onChange={(ev) => setCat(ev.target.value)} />
            <button className="btn" disabled={!cat.trim()} onClick={() => { act.ajustes({ categorias: [...new Set([...S.ajustes.categorias, cat.trim()])] }); setCat(''); }}>Adicionar</button>
          </div>
        </div>
      </div>

      <div className="card">
        <H2>Dados</H2>
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
