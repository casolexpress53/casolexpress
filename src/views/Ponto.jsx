import { useMemo, useRef, useState } from 'react';
import { dataBR } from '../lib.js';
import { CURTO, dataDe, fmtMin, hojeBR, folhaMes, hhmm, lerCoordenadas, mensagemErro, RAIO_PADRAO, resumoDia, ROTULO, TIPOS } from '../ponto-lib.js';
import { posicao, usePontoDono } from '../ponto.js';
import { temServidor } from '../auth.js';
import { Chips, Icon, Modal, Vazio } from '../ui.jsx';
import AcessoBox from '../components/AcessoBox.jsx';
import PontoColab from './PontoColab.jsx';
import PontoFolha, { NavMes } from './PontoFolha.jsx';
import { H2 } from '../components/Recolher.jsx';

const mesDe = (d) => `${d.slice(0, 8)}01`;
const STATUS = { pendente: ['warn', 'Pendente'], aprovado: ['ok', 'Aprovado'], recusado: ['bad', 'Recusado'] };
const horasParaMin = (t) => { const n = Number(String(t).replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 60) : null; };

/* ---------- cadastro do colaborador e do local do ponto ---------- */
function ColabForm({ aberto, colab, onFechar, P }) {
  const novo = !colab;
  const vivo = (colab && P.colaboradores.find((c) => c.id === colab.id)) || colab;   // versão atual (reflete o acesso recém-criado)
  const tocouAcesso = useRef(false);
  const ini = () => ({ nome: colab?.nome || '', funcao: colab?.funcao || '', endereco: colab?.endereco || '', lat: colab?.lat ?? '', lng: colab?.lng ?? '', raio: colab?.raio || RAIO_PADRAO, cargaH: colab?.cargaMin ? String(colab.cargaMin / 60).replace('.', ',') : '', ativo: colab?.ativo !== false, batePonto: colab?.batePonto !== false, email: '' });
  const [f, setF] = useState(ini);
  const [cola, setCola] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function aqui() {
    setBusy(true); setMsg({ ok: null, texto: 'Lendo a localização deste aparelho…' });
    try { const p = await posicao(); setF((x) => ({ ...x, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) })); setMsg({ ok: p.precisao <= 50, texto: `Local definido (precisão de ${Math.round(p.precisao)} m).${p.precisao > 50 ? ' Está imprecisa: repita ao ar livre, de preferência no celular.' : ' Confira no mapa antes de salvar.'}` }); }
    catch (e) { setMsg({ ok: false, texto: mensagemErro(e) }); }
    setBusy(false);
  }
  function colar() { const c = lerCoordenadas(cola); if (!c) return setMsg({ ok: false, texto: 'Não entendi. Cole no formato: -25.4284, -49.2733' }); setF((x) => ({ ...x, lat: String(c.lat), lng: String(c.lng) })); setCola(''); setMsg({ ok: true, texto: 'Coordenadas aplicadas.' }); }

  async function salvar() {
    const lat = f.lat === '' ? null : Number(String(f.lat).replace(',', '.')), lng = f.lng === '' ? null : Number(String(f.lng).replace(',', '.'));
    if (!f.nome.trim()) return setMsg({ ok: false, texto: 'Informe o nome.' });
    if (f.batePonto && ((lat == null) !== (lng == null) || (lat != null && (!(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180))))) return setMsg({ ok: false, texto: 'Latitude e longitude inválidas.' });
    const raio = Math.round(Number(f.raio));
    if (f.batePonto && !(raio >= 20 && raio <= 1000)) return setMsg({ ok: false, texto: 'O raio deve ficar entre 20 e 1000 metros.' });
    if (f.batePonto && f.cargaH && horasParaMin(f.cargaH) == null) return setMsg({ ok: false, texto: 'Carga diária inválida. Ex.: 8 ou 6,5.' });
    setBusy(true);
    try {
      // versão que foi LIDA ao abrir (detecta edição de outra pessoa); se o acesso foi criado aqui, a mudança foi nossa
      const id = await P.salvarColab({ ...(colab ? { id: colab.id, versao: tocouAcesso.current ? vivo?.versao : colab.versao } : {}), nome: f.nome.trim(), funcao: f.funcao.trim(), endereco: f.endereco.trim(), lat, lng, raio, cargaMin: f.batePonto ? horasParaMin(f.cargaH) : colab?.cargaMin ?? null, ativo: f.ativo, batePonto: f.batePonto });
      onFechar();
    } catch (e) { setMsg({ ok: false, texto: mensagemErro(e) }); }
    setBusy(false);
  }

  return (
    <Modal aberto={aberto} fechar={onFechar} titulo={novo ? 'Novo funcionário' : `Editar ${colab.nome}`}>
      <div className="stack">
        <div className="form">
          <label className="f">Nome<input className="inp" value={f.nome} onChange={(e) => set('nome', e.target.value)} /></label>
          <label className="f">Função<input className="inp" value={f.funcao} placeholder="Operacional, Ajudante…" onChange={(e) => set('funcao', e.target.value)} /></label>
        </div>
        <label className="row"><input type="checkbox" checked={f.batePonto} onChange={(e) => set('batePonto', e.target.checked)} /> <b>Bate ponto</b> <span className="small muted">(desmarque para quem não registra ponto: ele não aparece na folha nem consegue bater)</span></label>
        {f.batePonto && (<>
        <label className="f" style={{ maxWidth: 260 }}>Carga diária (horas, opcional)<input className="inp" inputMode="decimal" value={f.cargaH} placeholder="Ex.: 8" onChange={(e) => set('cargaH', e.target.value)} /></label>
        <h3 style={{ font: 'italic 700 16px var(--f1)', textTransform: 'uppercase' }}>Local onde o ponto pode ser batido</h3>
        <label className="f">Endereço (referência)<input className="inp" value={f.endereco} onChange={(e) => set('endereco', e.target.value)} /></label>
        <div className="row">
          <button type="button" className="btn ac" disabled={busy} onClick={aqui}><Icon n="pin" size={18} /> Usar minha localização atual</button>
          <span className="small muted">Faça isso estando no local.</span>
        </div>
        <div className="form">
          <label className="f">Latitude<input className="inp" inputMode="decimal" value={f.lat} onChange={(e) => set('lat', e.target.value)} /></label>
          <label className="f">Longitude<input className="inp" inputMode="decimal" value={f.lng} onChange={(e) => set('lng', e.target.value)} /></label>
          <label className="f">Raio (metros)<input className="inp" type="number" min="20" max="1000" value={f.raio} onChange={(e) => set('raio', e.target.value)} /></label>
        </div>
        <div className="row"><input className="inp" style={{ flex: 1, minWidth: 200 }} aria-label="Colar coordenadas do Google Maps" placeholder="Ou cole do Google Maps: -25.4284, -49.2733" value={cola} onChange={(e) => setCola(e.target.value)} /><button type="button" className="btn sm" onClick={colar}>Aplicar</button></div>
        <p className="small muted">Raio de 100 m costuma funcionar em área aberta; dentro de galpão o GPS erra mais, então aumente se precisar. Sem coordenadas, o colaborador não consegue bater o ponto.</p>
        {temServidor && !novo && vivo && <AcessoBox tipo="colaborador" item={vivo} aoMudar={async () => { tocouAcesso.current = true; await P.recarregar(); }} />}
        {temServidor && novo && <p className="small muted">Salve o colaborador e depois abra <b>Editar</b> para criar o acesso dele ao sistema.</p>}
        </>)}
        <label className="row"><input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Ativo (pode bater ponto)</label>
        {msg && <p role="status" aria-live="polite" className={`small ${msg.ok === false ? 'l-err' : 'muted'}`}>{msg.texto}</p>}
        <div className="row between"><button className="btn" onClick={onFechar}>Cancelar</button><button className="btn ac" disabled={busy} onClick={salvar}>Salvar</button></div>
      </div>
    </Modal>
  );
}

/* ---------- ajuste direto de um dia na folha ---------- */
function DiaForm({ aberto, dia, colab, onFechar, P }) {
  const [v, setV] = useState({});
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const atual = (t) => (dia?.t?.[t] != null ? hhmm(dia.t[t]) : '');
  const valor = (t) => (v[t] !== undefined ? v[t] : atual(t));
  async function salvar() {
    setBusy(true); setErro('');
    try { for (const t of TIPOS) if (valor(t) !== atual(t)) await P.salvarDia(colab.id, dia.data, t, valor(t) || null); setV({}); onFechar(); }
    catch (e) { setErro(mensagemErro(e)); }
    setBusy(false);
  }
  if (!dia) return null;
  return (
    <Modal aberto={aberto} fechar={() => { setV({}); onFechar(); }} titulo={`${colab.nome} · ${dataBR(dia.data)}`}>
      <div className="stack">
        <p className="small muted">Deixe em branco para remover a batida. O horário fica marcado como “ajustado pelo gestor”.</p>
        <div className="form">{TIPOS.map((t) => <label className="f" key={t}>{ROTULO[t]}<input className="inp" type="time" value={valor(t)} onChange={(e) => setV({ ...v, [t]: e.target.value })} /></label>)}</div>
        {erro && <p className="l-err" role="alert">{erro}</p>}
        <div className="row between"><button className="btn" onClick={() => { setV({}); onFechar(); }}>Cancelar</button><button className="btn ac" disabled={busy} onClick={salvar}>Salvar</button></div>
      </div>
    </Modal>
  );
}

/* `so='equipe'`: abre só o cadastro de funcionários (item próprio do menu). */
export default function Ponto({ so }) {
  const hojeI = hojeBR(), mesAtual = mesDe(hojeI);
  const [aba, setAba] = useState(so || 'hoje');
  const [mes, setMes] = useState(mesAtual);
  const [quem, setQuem] = useState('');
  const [edit, setEdit] = useState(null);       // { colab | null } no cadastro
  const [dia, setDia] = useState(null);
  const [ver, setVer] = useState('');
  const [erro, setErro] = useState('');
  const P = usePontoDono(mes);

  const usaPonto = (c) => c.batePonto !== false || P.batidas.some((b) => b.colaboradorId === c.id);   // quem parou de bater mantém o histórico
  const batem = P.colaboradores.filter(usaPonto);
  const ativos = batem.filter((c) => c.ativo && c.batePonto !== false);
  const sel = batem.find((c) => c.id === quem) || ativos[0] || batem[0];
  const pend = P.pedidos.filter((p) => p.status === 'pendente');
  const nome = (id) => P.colaboradores.find((c) => c.id === id)?.nome || '—';

  const hojeLinhas = useMemo(() => ativos.map((c) => {
    const lista = P.batidas.filter((b) => b.colaboradorId === c.id && dataDe(b.em) === hojeI).sort((a, b) => a.em.localeCompare(b.em));
    const r = resumoDia(lista, true), t = r.t;
    let estado = ['warn', 'Ainda não bateu'], desde = '';
    if (t.saida != null) { estado = ['ok', 'Encerrou']; desde = hhmm(new Date(t.saida).toISOString()); }
    else if (t.saida_intervalo != null && t.volta_intervalo == null) { estado = ['', 'Em intervalo']; desde = hhmm(new Date(t.saida_intervalo).toISOString()); }
    else if (t.entrada != null) { estado = ['ok', 'Trabalhando']; desde = hhmm(new Date(t.entrada).toISOString()); }
    return { c, lista, estado, desde, min: r.min, sem: !c.temLocal };
  }), [ativos, P.batidas, hojeI]);

  const folha = useMemo(() => (sel ? folhaMes(P.batidas.filter((b) => b.colaboradorId === sel.id), mes, sel.cargaMin, hojeI) : null), [P.batidas, sel, mes, hojeI]);
  const agir = async (fn) => { setErro(''); try { await fn(); } catch (e) { setErro(mensagemErro(e)); } };

  if (ver) return (
    <div className="stack">
      <div className="card row between"><span className="small muted">Visão do colaborador. <b>As batidas feitas aqui valem de verdade.</b></span><button className="btn sm" onClick={() => setVer('')}>Voltar ao gestor</button></div>
      <PontoColab colaboradorId={ver} />
    </div>
  );

  return (
    <div className="stack">
      <div className="row between">
        {so ? <span /> : <Chips valor={aba} onChange={setAba} opcoes={[['hoje', 'Hoje'], ['folha', 'Folha do mês'], ['pedidos', 'Pedidos de ajuste', pend.length || undefined], ['equipe', 'Funcionários e locais', P.colaboradores.length]]} />}
        {temServidor && <button className="btn sm" onClick={P.recarregar}>Atualizar</button>}
      </div>
      {(erro || P.erro) && <p className="l-err" role="alert">{erro || P.erro}</p>}

      {!P.carregando && P.colaboradores.length === 0 && aba !== 'equipe' && (
        <div className="card"><Vazio titulo="Nenhum funcionário cadastrado" texto="Cadastre quem vai operar e bater ponto, e o local de trabalho dele.">
          <button className="btn ac" onClick={() => { setAba('equipe'); setEdit({ colab: null }); }}><Icon n="plus" size={18} /> Cadastrar funcionário</button>
        </Vazio></div>
      )}

      {aba === 'hoje' && hojeLinhas.length > 0 && (
        <div className="card">
          <H2>Hoje · {dataBR(hojeI)}</H2>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Colaborador</th><th>Situação</th>{TIPOS.map((t) => <th key={t}>{CURTO[t]}</th>)}<th className="r">Horas</th></tr></thead>
            <tbody>{hojeLinhas.map(({ c, lista, estado, desde, min, sem }) => (
              <tr key={c.id}>
                <td><b>{c.nome}</b>{c.funcao && <div className="small muted">{c.funcao}</div>}</td>
                <td>{sem ? <span className="tag bad">Sem local cadastrado</span> : <span className={`tag ${estado[0]}`}>{estado[1]}{desde && ` · ${desde}`}</span>}</td>
                {TIPOS.map((t) => { const b = lista.find((x) => x.tipo === t); return <td key={t}>{b ? hhmm(b.em) : <span className="muted">·</span>}</td>; })}
                <td className="r">{min ? <b>{fmtMin(min)}</b> : <span className="muted">—</span>}</td>
              </tr>))}</tbody>
          </table></div>
        </div>
      )}

      {aba === 'folha' && sel && folha && (<>
        <div className="card row between">
          <label className="f" style={{ minWidth: 220 }}>Colaborador<select className="sel" value={sel.id} onChange={(e) => setQuem(e.target.value)}>{batem.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.ativo && c.batePonto !== false ? '' : ' (inativo)'}</option>)}</select></label>
          <NavMes mes={mes} onChange={setMes} max={mesAtual} />
        </div>
        <PontoFolha nome={sel.nome} funcao={sel.funcao} mes={mes} folha={folha} cargaMin={sel.cargaMin} onEditar={(d) => setDia(d)} />
        <DiaForm key={dia?.data} aberto={!!dia} dia={dia} colab={sel} onFechar={() => setDia(null)} P={P} />
      </>)}

      {aba === 'pedidos' && (
        <div className="card">
          <H2>Pedidos de ajuste</H2>
          <p className="sub">Aprovar grava o horário na folha como “ajustado”. Recusar mantém a folha como está.</p>
          {P.pedidos.length === 0 ? <Vazio titulo="Nenhum pedido" texto="Quando um colaborador pedir ajuste, aparece aqui." /> : (
            <div className="list">
              {P.pedidos.slice(0, 40).map((p) => <Pedido key={p.id} p={p} nome={nome(p.colaboradorId)} onDecidir={(a, r) => agir(() => P.decidir(p.id, a, r))} />)}
            </div>
          )}
        </div>
      )}

      {aba === 'equipe' && (
        <div className="card">
          <div className="row between"><H2 id="funcionarios">Funcionários e locais</H2><button className="btn ac" onClick={() => setEdit({ colab: null })}><Icon n="plus" size={18} /> Novo funcionário</button></div>
          <p className="sub">O funcionário só consegue bater o ponto dentro do raio do local cadastrado. A localização é lida apenas na hora da batida.</p>
          {P.colaboradores.length === 0 ? <Vazio titulo="Ninguém cadastrado" texto="Adicione o primeiro funcionário: nome, função, local do ponto e acesso ao sistema." /> : (
            <div className="list">
              {P.colaboradores.map((c) => (
                <div className="item" key={c.id}>
                  <div><b>{c.nome}</b>{c.funcao && <span className="muted"> · {c.funcao}</span>}{!c.ativo && <span className="tag" style={{ marginLeft: 8 }}>Inativo</span>}{c.batePonto === false && <span className="tag" style={{ marginLeft: 8 }}>Não bate ponto</span>}
                    <div className="small muted">{c.batePonto === false ? 'Sem registro de ponto' : c.temLocal ? `${c.endereco || 'Local definido'} · raio ${c.raio || RAIO_PADRAO} m` : <span style={{ color: 'var(--bad)' }}>Sem local: não consegue bater ponto</span>}{temServidor && c.batePonto !== false && ` · ${c.vinculado ? 'com acesso' : 'sem acesso ao app'}`}</div></div>
                  <div className="row">
                    {!temServidor && c.batePonto !== false && <button className="btn sm" onClick={() => setVer(c.id)}>Ver como funcionário</button>}
                    <button className="btn sm" onClick={() => setEdit({ colab: c })}>Editar</button>
                    <button className="btn sm danger" aria-label={`Remover ${c.nome}`} onClick={() => window.confirm(`Remover ${c.nome}? As batidas dele também serão apagadas. Para só impedir novas batidas, desmarque “Ativo”.`) && agir(() => P.removerColab(c.id))}><Icon n="x" size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {edit && <ColabForm key={edit.colab?.id || 'novo'} aberto colab={edit.colab} onFechar={() => setEdit(null)} P={P} />}
    </div>
  );
}

function Pedido({ p, nome, onDecidir }) {
  const [r, setR] = useState('');
  const [s, rot] = STATUS[p.status];
  return (
    <div className="item" style={{ alignItems: 'start' }}>
      <div style={{ flex: '1 1 240px' }}>
        <b>{nome}</b> · {dataBR(p.data)} · {ROTULO[p.tipo]} → <b>{p.hora}</b>
        <div className="small muted">“{p.motivo}”{p.resposta && <> — resposta: {p.resposta}</>}</div>
      </div>
      {p.status === 'pendente' ? (
        <div className="row">
          <input className="inp" style={{ width: 190 }} aria-label="Resposta (opcional)" placeholder="Resposta (opcional)" value={r} onChange={(e) => setR(e.target.value)} />
          <button className="btn sm ac" onClick={() => onDecidir(true, r)}>Aprovar</button>
          <button className="btn sm danger" onClick={() => onDecidir(false, r)}>Recusar</button>
        </div>
      ) : <span className={`tag ${s}`}>{rot}</span>}
    </div>
  );
}
