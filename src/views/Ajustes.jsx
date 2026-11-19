import { useState } from 'react';
import { temServidor } from '../auth.js';
import AcessoBox from '../components/AcessoBox.jsx';
import { exemploFaixas, faixasDe, regraAtraso, UNIDADES } from '../atraso.js';
import { acertoQuinzena, addDias, brl, dataBR, fechamentoAtual, norm, quinzena, quinzenaAnterior, hoje } from '../lib.js';
import { act, getState, recarregar, souDono, useStore } from '../store.js';
import { METRICAS_SLA, MODOS_SLA, regrasEfetivas } from '../sla.js';
import { Icon, Modal, Money } from '../ui.jsx';
import { H2 } from '../components/Recolher.jsx';
import { ABAS_EQUIPE } from '../equipe.js';
import { hojeBR, mensagemErro } from '../ponto-lib.js';
import { usePontoDono } from '../ponto.js';

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

/* Funcionários cadastrados: só bater ponto ou operar o sistema (com as abas liberadas) */
const lerAberto = (id) => { try { return localStorage.getItem(`casol_recolher_equipe_${id}`) === '1'; } catch { return false; } };   // padrão: oculto
const gravarAberto = (id, v) => { try { localStorage.setItem(`casol_recolher_equipe_${id}`, v ? '1' : '0'); } catch { /* sem storage */ } };
function PermissoesEquipe({ ir }) {
  const P = usePontoDono(`${hojeBR().slice(0, 8)}01`);
  const [msg, setMsg] = useState(null);
  const [, setTick] = useState(0);
  async function salvar(c, patch) {
    setMsg(null);
    try { await P.salvarColab({ ...c, ...patch }); } catch (e) { setMsg(mensagemErro(e)); }
  }
  if (P.carregando) return <p className="small muted">Carregando…</p>;
  if (P.erro) return <p className="l-err small" role="alert">Não consegui carregar os funcionários: {P.erro}</p>;
  if (!P.colaboradores.length) return <p className="small muted">Nenhum funcionário cadastrado ainda. Cadastre em <button className="btn sm" onClick={() => ir?.('equipe')}>Funcionários</button>.</p>;
  const ativos = P.colaboradores.filter((c) => c.ativo);
  return (
    <div className="stack">
      {msg && <p className="l-err small" role="alert">{msg}</p>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn sm" onClick={() => { ativos.forEach((c) => gravarAberto(c.id, true)); setTick((t) => t + 1); }}>Mostrar as funções de todos</button>
        <button type="button" className="btn sm" onClick={() => { ativos.forEach((c) => gravarAberto(c.id, false)); setTick((t) => t + 1); }}>Ocultar as funções de todos</button>
      </div>
      <div className="list">
        {ativos.map((c) => {
          const op = c.permissao === 'operador', abas = c.abas || [], aberto = lerAberto(c.id);
          return (
            <div className="item" key={c.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
              <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <b>{c.nome}</b>{c.funcao && <span className="muted small"> · {c.funcao}</span>}
                  <div className="small muted">{temServidor ? (c.vinculado ? 'Tem login' : 'Sem login ainda (crie em Funcionários)') : 'Demonstração'} · {op ? `Trabalha no sistema (${abas.length} função(ões) liberada(s))` : 'Só bate o ponto'}</div>
                </div>
                <button type="button" className="rec-btn" aria-expanded={aberto} aria-label={`${aberto ? 'Ocultar' : 'Mostrar'} as funções de ${c.nome}`} onClick={() => { gravarAberto(c.id, !aberto); setTick((t) => t + 1); }}>{aberto ? 'Ocultar funções' : 'Mostrar funções'}</button>
              </div>
              {aberto && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label className="f" style={{ maxWidth: 420, flex: 'none' }}>O que pode fazer
                    <select className="sel" value={op ? 'operador' : 'ponto'} onChange={(e) => salvar(c, { permissao: e.target.value, abas: e.target.value === 'operador' && !abas.length ? ['romaneio', 'entregas'] : abas })}>
                      <option value="ponto">Só bater o ponto</option><option value="operador">Trabalhar no sistema (e bater o ponto)</option>
                    </select></label>
                  {op && (
                    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                      <legend className="small muted" style={{ marginBottom: 8 }}>Funções liberadas</legend>
                      <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                        <button type="button" className="btn sm" onClick={() => salvar(c, { abas: ABAS_EQUIPE.map((x) => x[0]) })}>Marcar todas</button>
                        <button type="button" className="btn sm" onClick={() => salvar(c, { abas: [] })}>Limpar</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 10 }}>
                        {ABAS_EQUIPE.map(([id, nome, desc]) => (
                          <label key={id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', alignItems: 'start', alignContent: 'start', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 14, cursor: 'pointer', background: abas.includes(id) ? 'var(--surface2)' : 'transparent' }}>
                            <input type="checkbox" style={{ marginTop: 3 }} checked={abas.includes(id)} onChange={(e) => salvar(c, { abas: e.target.checked ? [...abas, id] : abas.filter((x) => x !== id) })} />
                            <b>{nome}</b><span />
                            <span className="small muted">{desc}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* dias de fechamento das quinzenas do cliente */
function Fechamento({ S }) {
  const f = S.ajustes.fechamento || {};
  const { c1, c2 } = fechamentoAtual();
  const set = (patch) => act.ajustes({ fechamento: { c1, c2, ...patch } });
  const q1 = quinzena(hoje()), q0 = quinzena(addDias(q1.ini, -1)), q2 = quinzena(addDias(q1.fim, 1));
  return (
    <div className="stack">
      <div className="form">
        <label className="f">1º fechamento (dia do mês)
          <select className="sel" value={c1} onChange={(e) => { const v = Number(e.target.value); set({ c1: v, c2: c2 > v ? c2 : 31 }); }}>
            {Array.from({ length: 27 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>dia {d}</option>)}
          </select></label>
        <label className="f">2º fechamento (dia do mês)
          <select className="sel" value={c2} onChange={(e) => set({ c2: Number(e.target.value) })}>
            {Array.from({ length: 30 - c1 }, (_, i) => c1 + 1 + i).filter((d) => d <= 28).map((d) => <option key={d} value={d}>dia {d}</option>)}
            <option value={31}>último dia do mês</option>
          </select></label>
      </div>
      <p className="small muted">Períodos neste momento: <b>{dataBR(q0.ini)} a {dataBR(q0.fim)}</b> (anterior), <b>{dataBR(q1.ini)} a {dataBR(q1.fim)}</b> (atual), <b>{dataBR(q2.ini)} a {dataBR(q2.fim)}</b> (próximo). Vale para a Comissão, o extrato do motorista e os fechamentos em PDF. Fechamentos já aprovados continuam como estão.{f.c1 ? '' : ' (padrão: dia 15 e último dia do mês)'}</p>
    </div>
  );
}

/* Desligar motorista: encerra o acesso, passa as paradas pendentes para outro e mostra o acerto final. */
function DesligarMotorista({ m, S, onFechar, ir }) {
  const [data, setData] = useState(hoje());
  const [para, setPara] = useState('');
  const [feito, setFeito] = useState(false);
  const pend = S.paradas.filter((p) => p.motoristaId === m.id && p.status === 'pendente');
  const nPac = pend.reduce((t, p) => t + p.pacotes.length, 0);
  const q = quinzena(data), qa = quinzenaAnterior(q);
  const ac = [qa, q].map((x) => ({ x, a: acertoQuinzena(S, { ...m, desligadoEm: data, ativo: false }, x) })).filter(({ a }) => a.bruto > 0 || a.reg);
  const outros = S.motoristas.filter((x) => x.id !== m.id && x.ativo !== false);
  function confirmar() {
    for (const p of pend) act.upd('paradas', p.id, { motoristaId: para || null });
    act.upd('motoristas', m.id, { ativo: false, desligadoEm: data });
    setFeito(true);
  }
  return (
    <Modal aberto fechar={onFechar} titulo={feito ? `${m.nome} desligado` : `Desligar ${m.nome}`}>
      <div className="stack">
        {feito ? <p className="small"><b>Desligamento registrado em {dataBR(data)}.</b> O acesso do motorista foi encerrado. O histórico de entregas e os acertos continuam guardados. Faça o acerto final em Comissão.</p> : (<>
          <p className="small muted">O motorista perde o acesso ao sistema; entregas e comissões já feitas ficam guardadas. {m.tipo === 'fixo' ? 'O salário fixo é pago só até o último dia (proporcional).' : 'Os pacotes entregues até aqui continuam valendo no acerto.'}</p>
          <label className="f" style={{ maxWidth: 240 }}>Último dia de trabalho<input className="inp" type="date" value={data} max={hoje()} onChange={(e) => setData(e.target.value)} /></label>
          {nPac > 0 && (
            <label className="f">Ele tem {nPac} pacote(s) pendente(s) em {pend.length} parada(s). Passar para
              <select className="sel" value={para} onChange={(e) => setPara(e.target.value)}><option value="">Deixar sem motorista</option>{outros.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
          )}
        </>)}
        <div className="list small">
          <div className="item"><b>Acerto final (estimativa)</b></div>
          {ac.length === 0 ? <div className="item muted">Sem valores a acertar nestes períodos.</div> : ac.map(({ x, a }) => (
            <div className="item" key={x.ini}><span>{dataBR(x.ini)} a {dataBR(x.fim)} · {m.tipo === 'fixo' ? 'salário proporcional' : `${a.pacotes} pacote(s)`}{a.totalDesc ? ` · descontos ${brl(a.totalDesc)}` : ''}</span><b>{brl(a.liquido)} {a.aprovado ? '(já aprovado)' : ''}</b></div>
          ))}
        </div>
        <div className="row between">
          <button className="btn" onClick={onFechar}>{feito ? 'Fechar' : 'Cancelar'}</button>
          {feito ? <button className="btn ac" onClick={() => { onFechar(); ir?.('comissao'); }}>Ir para a Comissão</button> : <button className="btn ac danger" onClick={confirmar}>Confirmar desligamento</button>}
        </div>
      </div>
    </Modal>
  );
}

/* campo de meta: vazio = sem meta */
const Meta = ({ m, valor, onChange }) => (
  <input className="inp" type="number" min="0" max={m.un === '%' ? 100 : undefined} step="0.1" inputMode="decimal" placeholder="sem meta" value={valor ?? ''} aria-label={m.rotulo}
    onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))} />
);

export default function Ajustes({ ir }) {
  const S = useStore();
  const [m, setM] = useState({ nome: '', tipo: 'pacote', valor: 0 });
  const [e, setE] = useState({ nome: '', tarifa: 0, prazoDias: 1 });
  const [cat, setCat] = useState('');
  const [deslM, setDeslM] = useState(null);
  const [carregando, setCarregando] = useState(false);

  const backup = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' }));
    a.download = `casol-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="stack">
      {deslM && <DesligarMotorista m={deslM} S={S} ir={ir} onFechar={() => setDeslM(null)} />}
      <div className="card">
        <H2>Motoristas</H2>
        <p className="sub">Quanto cada um recebe. Fixos têm salário mensal (a quinzena paga metade). Os demais recebem por pacote entregue; deixe em branco para usar o valor padrão.</p>
        <div className="list">
          {S.motoristas.map((x) => (
            <div className="item" key={x.id} style={{ alignItems: 'end' }}>
              <label className="f" style={{ flex: '2 1 200px' }}>Nome<Texto valor={x.nome} onSave={(v) => act.upd('motoristas', x.id, { nome: v })} /></label>
              <label className="f" style={{ flex: '1 1 130px' }}>Tipo<select className="sel" value={x.tipo} onChange={(ev) => act.upd('motoristas', x.id, { tipo: ev.target.value })}><option value="pacote">Por pacote</option><option value="fixo">Fixo (mensal)</option></select></label>
              <label className="f" style={{ flex: '1 1 130px' }}>{x.tipo === 'fixo' ? 'Salário mensal' : 'Por pacote'}<Money valor={x.valor} onChange={(v) => act.upd('motoristas', x.id, { valor: v })} /></label>
              {x.ativo === false && <span className="tag">{x.desligadoEm ? `Desligado em ${dataBR(x.desligadoEm)}` : 'Inativo'}</span>}
              {x.ativo === false ? <button className="btn sm" onClick={() => act.upd('motoristas', x.id, { ativo: true, desligadoEm: null })}>Reativar</button> : <button className="btn sm" onClick={() => setDeslM(x)}>Desligar</button>}
              {temServidor && souDono() && <AcessoBox tipo="motorista" item={x} aoMudar={recarregar} />}
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

      {souDono() && <div className="card">
        <H2 id="equipe-permissoes">Equipe: o que cada funcionário pode fazer</H2>
        <p className="sub">Quem foi cadastrado em Funcionários aparece aqui. Escolha se a pessoa <b>só bate o ponto</b> ou <b>trabalha no sistema</b>, e quais abas ela enxerga. Marque as abas que a pessoa vai usar: o sistema libera só o que está marcado, também no banco de dados. O cadastro de funcionários, os acessos e as permissões ficam sempre só com você. A pessoa precisa ter login (criado em Funcionários) e, ao mudar a permissão, entrar de novo para valer.</p>
        <PermissoesEquipe ir={ir} />
      </div>}

      <div className="card">
        <H2 id="prazo-cidade">Prazo de entrega por cidade</H2>
        <p className="sub">Como na planilha de controle: <b>D + 0</b> vence no dia do carregamento, <b>D + 1</b> no dia seguinte, e assim por diante. É isso que define “vence hoje”, “no prazo” e “fora do prazo” no SLA. Cidade sem prazo conta como D + 0.</p>
        <PrazosCidade S={S} />
      </div>

      <div className="card">
        <H2 id="fechamento">Fechamento das quinzenas</H2>
        <p className="sub">Em que dias o cliente fecha o pagamento dos motoristas. Padrão: dia 15 e último dia do mês. Se ele fecha, por exemplo, nos dias 10 e 25, os períodos viram 26 a 10 e 11 a 25.</p>
        <Fechamento S={S} />
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
