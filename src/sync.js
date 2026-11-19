import { useSyncExternalStore } from 'react';
import { sb } from './auth.js';

/*
  Sincronização do app com o Supabase (modo servidor).
  O store continua sendo a única porta das telas. Aqui ficam: o mapa campo do app → coluna do banco,
  a detecção do que mudou (diff), a fila de gravação com nova tentativa e o carregamento paginado.
  Campos que o app tiver e o banco ainda não tiver como coluna vão para `extra` (jsonb): nada se perde.
*/
const MAPA = {
  empresas: { nome: 'nome', tarifa: 'tarifa', prazoDias: 'prazo_dias' },
  motoristas: { nome: 'nome', tipo: 'tipo', valor: 'valor', ativo: 'ativo', sla: 'sla' },
  romaneios: { empresaId: 'empresa_id', data: 'data', arquivo: 'arquivo', finalizado: 'finalizado' },
  paradas: { romaneioId: 'romaneio_id', motoristaId: 'motorista_id', endereco: 'endereco', bairro: 'bairro', cidade: 'cidade', cliente: 'cliente', pacotes: 'pacotes', status: 'status', baixaEm: 'baixa_em' },
  lancamentos: { data: 'data', tipo: 'tipo', categoria: 'categoria', descricao: 'descricao', valor: 'valor', pago: 'pago', venc: 'venc', origem: 'origem' },
  acertos: { motoristaId: 'motorista_id', ini: 'ini', fim: 'fim', descontos: 'descontos', aprovadoEm: 'aprovado_em', lancId: 'lancamento_id' },
  veiculos: { placa: 'placa', motoristaId: 'motorista_id', rastreadorId: 'rastreador_id', instalado: 'instalado' },
};
/* Ordem de gravação: quem é referenciado vem antes. Exclusões seguem a ordem inversa. */
export const ORDEM = ['empresas', 'motoristas', 'romaneios', 'paradas', 'lancamentos', 'acertos', 'veiculos'];
const PADRAO = { tarifa: 0, prazo_dias: 1, valor: 0, ativo: true, finalizado: false, pacotes: [], descontos: [], instalado: false, pago: false, sla: {} };
const CHAVES_UUID = ['empresa_id', 'motorista_id', 'romaneio_id', 'lancamento_id'];
const SO_LEITURA = new Set(['vinculado']);   // vem do banco, nunca volta para ele
const LOTE_UP = 500, LOTE_DEL = 100, PAGINA = 1000;

export function paraLinha(col, it, versao = 0) {
  const m = MAPA[col], row = { id: it.id }, extra = {};
  for (const [k, v] of Object.entries(it)) {
    if (k === 'id' || (col === 'paradas' && k === 'gps') || SO_LEITURA.has(k)) continue;
    if (k in m) row[m[k]] = v; else extra[k] = v;
  }
  for (const c of Object.values(m)) if (row[c] === undefined) row[c] = c in PADRAO ? PADRAO[c] : null;   // colunas iguais em todas as linhas do lote
  for (const c of CHAVES_UUID) if (row[c] === '') row[c] = null;   // chave estrangeira vazia = sem vínculo
  if (col === 'paradas') { row.lat = it.gps?.lat ?? null; row.lng = it.gps?.lng ?? null; }
  row.extra = extra;
  row.versao = versao;   // a versão que o app leu: o banco recusa se outra pessoa já mudou (conflito_edicao)
  return row;
}

export function daLinha(col, r) {
  const m = MAPA[col], it = { id: r.id };
  for (const [k, c] of Object.entries(m)) it[k] = r[c];
  Object.assign(it, r.extra || {});
  if (col === 'paradas') it.gps = r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null;
  if (col === 'motoristas') it.vinculado = !!r.user_id;
  return it;
}

const AJ = { saldoInicial: 'saldo_inicial', valorPadrao: 'valor_padrao', meta: 'meta', categorias: 'categorias', sla: 'sla' };
export function ajustesParaLinha(a, versao = 0) {
  const row = { id: 1 }, extra = {};
  for (const [k, v] of Object.entries(a || {})) { if (k in AJ) row[AJ[k]] = v; else extra[k] = v; }
  row.saldo_inicial ??= 0; row.valor_padrao ??= 0; row.meta ??= 0; row.categorias ??= []; row.sla ??= {}; row.extra = extra; row.versao = versao;
  return row;
}
export function ajustesDaLinha(r) {
  const a = {}; for (const [k, c] of Object.entries(AJ)) a[k] = r?.[c];
  return { ...a, ...(r?.extra || {}), saldoInicial: a.saldoInicial ?? 0, valorPadrao: a.valorPadrao ?? 0, meta: a.meta ?? 0, categorias: a.categorias ?? [], sla: a.sla ?? {} };
}

/* ---------- o que mudou entre dois estados ---------- */
export function diffColecao(prev = [], next = []) {
  const antes = new Map(prev.map((x) => [x.id, x]));
  const vistos = new Set(), up = [];
  for (const n of next) {
    vistos.add(n.id);
    const a = antes.get(n.id);
    if (a !== n && (!a || JSON.stringify(a) !== JSON.stringify(n))) up.push(n);
  }
  const del = prev.filter((a) => !vistos.has(a.id));
  return { up, del };
}

/* ---------- estado da sincronização (para a tela) ---------- */
let st = { estado: 'salvo', pendentes: 0, erro: '' };
const subs = new Set();
const mudou = (p) => { st = { ...st, ...p }; subs.forEach((f) => f()); };
export const useSyncStatus = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => st);
export const getSyncStatus = () => st;

/* ---------- avisos (conflito de edição, atualização por outra pessoa) ---------- */
let aviso = null;
const subsAviso = new Set();
export const avisar = (a) => { aviso = a ? { ...a, em: Date.now() } : null; subsAviso.forEach((f) => f()); };
export const limparAviso = () => avisar(null);
export const useAviso = () => useSyncExternalStore((f) => { subsAviso.add(f); return () => subsAviso.delete(f); }, () => aviso);
const TEXTO_CONFLITO = 'Outra pessoa alterou esta informação ao mesmo tempo. A sua alteração NÃO foi salva e a tela foi atualizada com a versão mais recente. Confira e refaça, se ainda precisar.';

/* ---------- versões lidas de cada linha (controle de edição simultânea) ---------- */
let versoes = Object.fromEntries(ORDEM.map((c) => [c, new Map()]));
let versaoAj = 0;
let epoca = 0;                        // sobe a cada gravação concluída: cargas antigas não podem reverter versões
let aoConflito = null;
export const definirAoConflito = (f) => { aoConflito = f; };

/* ---------- fila ---------- */
const vazioPend = () => ({ up: Object.fromEntries([...ORDEM, 'ajustes'].map((c) => [c, new Map()])), del: Object.fromEntries(ORDEM.map((c) => [c, new Set()])) });
let pend = vazioPend();
let rodando = null, retry = null, tentativas = 0, ligado = false;

const contar = (p) => Object.values(p.up).reduce((t, m) => t + m.size, 0) + Object.values(p.del).reduce((t, s) => t + s.size, 0);

/* Chamado pelo store a cada mudança de estado (só no modo dono). */
export function registrar(prev, next) {
  if (!ligado) return;
  const romsApagados = new Set(diffColecao(prev.romaneios, next.romaneios).del.map((r) => r.id));
  for (const col of ORDEM) {
    if (prev[col] === next[col]) continue;
    const { up, del } = diffColecao(prev[col], next[col]);
    for (const it of up) { pend.up[col].set(it.id, it); pend.del[col].delete(it.id); }
    for (const it of del) {
      if (col === 'paradas' && romsApagados.has(it.romaneioId)) { pend.up[col].delete(it.id); continue; }   // o banco apaga em cascata
      pend.up[col].delete(it.id); pend.del[col].add(it.id);
    }
  }
  if (prev.ajustes !== next.ajustes && JSON.stringify(prev.ajustes) !== JSON.stringify(next.ajustes)) pend.up.ajustes.set(1, next.ajustes);
  const n = contar(pend);
  if (n) { mudou({ pendentes: n, estado: st.estado === 'erro' ? 'erro' : 'salvando' }); descarregar(); }
}

function devolver(lote) {   // falhou: volta para a fila sem pisar em alterações mais novas
  for (const col of Object.keys(lote.up)) for (const [id, it] of lote.up[col]) if (!pend.up[col].has(id) && !pend.del[col]?.has(id)) pend.up[col].set(id, it);
  for (const col of Object.keys(lote.del)) for (const id of lote.del[col]) if (!pend.up[col].has(id)) pend.del[col].add(id);
}

async function enviar(lote) {
  const c = await sb();
  const ok = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
  for (const col of ORDEM) {
    const itens = [...lote.up[col].values()];
    for (let i = 0; i < itens.length; i += LOTE_UP) {
      const parte = itens.slice(i, i + LOTE_UP);
      const rows = parte.map((it) => paraLinha(col, it, versoes[col].get(it.id) || 0));
      const novas = ok(await c.from(col).upsert(rows, { onConflict: 'id' }).select('id,versao'));
      for (const r of novas || []) versoes[col].set(r.id, r.versao);
    }
  }
  if (lote.up.ajustes.size) {
    const novas = ok(await c.from('ajustes').upsert(ajustesParaLinha(lote.up.ajustes.get(1), versaoAj), { onConflict: 'id' }).select('id,versao'));
    if (novas?.[0]) versaoAj = novas[0].versao;
  }
  for (const col of [...ORDEM].reverse()) {
    const ids = [...lote.del[col]];
    for (let i = 0; i < ids.length; i += LOTE_DEL) {
      const parte = ids.slice(i, i + LOTE_DEL);
      ok(await c.from(col).delete().in('id', parte));
      for (const id of parte) versoes[col].delete(id);
    }
  }
  epoca += 1;
}

export function descarregar() {
  if (rodando) return rodando;
  clearTimeout(retry);
  rodando = (async () => {
    mudou({ estado: 'salvando' });
    try {
      while (contar(pend)) {
        const lote = pend; pend = vazioPend();
        try { await enviar(lote); } catch (e) { devolver(lote); throw e; }
        mudou({ pendentes: contar(pend) });
      }
      tentativas = 0; mudou({ estado: 'salvo', pendentes: 0, erro: '' });
    } catch (e) {
      if (/conflito_edicao/.test(e.message || '')) {   // outra pessoa mudou antes: descarta a fila (é de uma visão velha), avisa e recarrega
        pend = vazioPend(); tentativas = 0; epoca += 1;
        mudou({ estado: 'salvo', pendentes: 0, erro: '' });
        avisar({ tipo: 'conflito', texto: TEXTO_CONFLITO });
        try { await aoConflito?.(); } catch { /* sem rede: a próxima carga corrige */ }
        return;
      }
      tentativas += 1;
      mudou({ estado: 'erro', pendentes: contar(pend), erro: e.message || 'Falha ao salvar' });
      retry = setTimeout(descarregar, Math.min(30000, 3000 * 2 ** (tentativas - 1)));
    } finally { rodando = null; }
  })();
  return rodando;
}

/* Espera a fila esvaziar (para sair com segurança). */
export async function aguardarGravacao(ms = 8000) {
  const fim = Date.now() + ms;
  while ((contar(pend) || rodando) && Date.now() < fim) { await descarregar(); if (st.estado === 'erro') break; }
  return contar(pend) === 0 && !rodando;
}

export function ligar() {
  ligado = true; pend = vazioPend(); tentativas = 0;
  mudou({ estado: 'salvo', pendentes: 0, erro: '' });
}
export function desligar() { ligado = false; clearTimeout(retry); pend = vazioPend(); versoes = Object.fromEntries(ORDEM.map((c) => [c, new Map()])); versaoAj = 0; avisar(null); mudou({ estado: 'salvo', pendentes: 0, erro: '' }); }
export const temPendencia = () => contar(pend) > 0 || !!rodando;
export function falhou(msg) { mudou({ estado: 'erro', erro: msg }); }
export function reaberto() { if (st.estado === 'erro' && contar(pend)) descarregar(); }

if (typeof window !== 'undefined') {
  window.addEventListener('online', reaberto);
  window.addEventListener('beforeunload', (e) => { if (ligado && temPendencia()) { e.preventDefault(); e.returnValue = ''; } });
}

/* ---------- leitura ---------- */
async function baixarTudo(c, col) {
  const todas = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await c.from(col).select('*').order('seq').range(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    todas.push(...data);
    if (data.length < PAGINA) break;
  }
  return todas;
}

/* Dono: tudo da operação. `inicial` força (entrada ou depois de conflito). Numa atualização periódica a carga é descartada
   se, enquanto buscava, houve gravação local (versões novas não podem ser revertidas). Devolve também se houve mudança de OUTRA pessoa. */
export async function carregarTudo(inicial = true) {
  const epoca0 = epoca;
  const c = await sb();
  const [cols, aj] = await Promise.all([
    Promise.all(ORDEM.map(async (col) => [col, await baixarTudo(c, col)])),
    c.from('ajustes').select('*').eq('id', 1).maybeSingle(),
  ]);
  if (aj.error) throw new Error(aj.error.message);
  if (!inicial && (epoca !== epoca0 || temPendencia())) return { descartada: true };
  const novas = {}; let externo = false;
  const dados = {};
  for (const [col, rows] of cols) {
    novas[col] = new Map(rows.map((r) => [r.id, r.versao]));
    if (novas[col].size !== versoes[col].size || rows.some((r) => versoes[col].get(r.id) !== r.versao)) externo = true;
    dados[col] = rows.map((r) => daLinha(col, r));
  }
  if ((aj.data?.versao || 0) !== versaoAj) externo = true;
  versoes = novas; versaoAj = aj.data?.versao || 0;
  dados.ajustes = ajustesDaLinha(aj.data);
  return { dados, externo };
}

/* Motorista: só as próprias paradas, pela função do banco. */
export async function carregarMotorista() {
  const c = await sb();
  const { data, error } = await c.rpc('motorista_meus_dados');
  if (error) throw new Error(error.message);
  if (data?.erro) throw new Error(data.erro === 'motorista_nao_vinculado' ? 'Seu acesso ainda não está ligado a um motorista. Fale com o administrador.' : data.erro);
  const m = data.motorista;
  return {
    motoristas: [{ id: m.id, nome: m.nome, tipo: m.tipo, valor: m.valor, ativo: m.ativo, sla: m.sla || {} }],
    paradas: data.paradas.map((p) => ({ id: p.id, romaneioId: p.romaneio_id || null, motoristaId: m.id, endereco: p.endereco, bairro: p.bairro || '', cidade: p.cidade || '', cliente: p.cliente || '', pacotes: p.pacotes || [], status: p.status, baixaEm: p.baixa_em, gps: null })),
    romaneios: (data.romaneios || []).map((r) => ({ id: r.id, empresaId: r.empresa_id, data: r.data, arquivo: '', finalizado: false })),
    empresas: (data.empresas || []).map((e) => ({ id: e.id, nome: '', tarifa: 0, prazoDias: e.prazo_dias })),   // só o prazo: nome e tarifa não vão ao motorista
    ajustes: { saldoInicial: 0, valorPadrao: 0, meta: 0, categorias: [], sla: data.sla_padrao || {}, fechamento: data.fechamento || undefined },
    motoristaId: m.id,
  };
}

/* Cria (ou redefine a senha de) o acesso de um motorista/colaborador. Só o dono consegue: a função do servidor confere. */
export async function acesso(body) {
  const c = await sb();
  const { data, error } = await c.functions.invoke('criar-acesso', { body });
  if (error) {
    let det = null;
    try { det = await error.context?.json(); } catch { /* sem corpo */ }
    throw new Error(det?.erro || error.message);
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

export async function rpc(nome, args) {
  const { data, error } = await (await sb()).rpc(nome, args);
  if (error) throw new Error(error.message);
  return data;
}
