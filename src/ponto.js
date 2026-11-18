import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sb, temServidor } from './auth.js';
import { shiftMes } from './lib.js';
import { dataDe, distMetros, emBR, hojeBR, INTERVALO_MIN_S, mensagemErro, PRECISAO_MAX, proximos, RAIO_PADRAO, TIPOS } from './ponto-lib.js';
import { act, getState, useStore } from './store.js';

/*
  Dados do ponto. Duas implementações com a mesma interface (as telas não sabem qual é):
  - demonstração: localStorage (via store)  - servidor: Supabase (tabelas para o dono, funções para o colaborador).
  No servidor, distância, sequência e horário são validados no banco (supabase/ponto.sql).
*/

/* Posição do aparelho, pedida só no momento da batida (nunca fica rastreando). */
export function posicao() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Este aparelho não oferece localização.'));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy }),
      (e) => rej(new Error(e.code === 1 ? 'Permita o acesso à localização do navegador para bater o ponto.' : 'Não consegui obter a localização. Tente de novo em um lugar aberto.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

const doServidor = {
  colab: (r) => ({ id: r.id, nome: r.nome, funcao: r.funcao || '', ativo: r.ativo, endereco: r.endereco || '', lat: r.lat, lng: r.lng, raio: r.raio_m, cargaMin: r.carga_min, vinculado: !!r.user_id, temLocal: r.lat != null && r.lng != null, batePonto: r.bate_ponto !== false, versao: r.versao }),
  batida: (r) => ({ id: r.id, colaboradorId: r.colaborador_id, em: r.em, tipo: r.tipo, origem: r.origem, dist: r.dist_m }),
  pedido: (r) => ({ id: r.id, colaboradorId: r.colaborador_id, data: r.dia, tipo: r.tipo, hora: String(r.hora).slice(0, 5), motivo: r.motivo, status: r.status, resposta: r.resposta, criadoEm: r.criado_em }),
};
const paraServidor = (c) => ({ nome: c.nome, funcao: c.funcao || null, ativo: c.ativo !== false, endereco: c.endereco || null, lat: c.lat ?? null, lng: c.lng ?? null, raio_m: c.raio || RAIO_PADRAO, carga_min: c.cargaMin || null, bate_ponto: c.batePonto !== false });
const rpc = async (nome, args) => { const { data, error } = await (await sb()).rpc(nome, args); if (error) throw new Error(error.message); return data; };

/* ============================ DONO ============================ */
const intervaloMes = (mes) => [mes, shiftMes(mes, 1)];
const localDeDia = (data, hhmmTxt) => emBR(data, hhmmTxt);

function useDonoLocal() {
  const S = useStore();
  return useMemo(() => ({
    colaboradores: S.colaboradores.map((c) => ({ ...c, vinculado: false, temLocal: c.lat != null && c.lng != null })),
    batidas: S.pontos, pedidos: S.pedidosPonto, carregando: false, erro: '', recarregar: () => {},
    async salvarColab(c) { if (c.id) { act.upd('colaboradores', c.id, c); return c.id; } return act.add('colaboradores', { ativo: true, raio: RAIO_PADRAO, ...c }); },
    async removerColab(id) {
      act.del('colaboradores', id);
      getState().pontos.filter((p) => p.colaboradorId === id).forEach((p) => act.del('pontos', p.id));
      getState().pedidosPonto.filter((p) => p.colaboradorId === id).forEach((p) => act.del('pedidosPonto', p.id));
    },
    async vincular() { throw new Error('No modo demonstração não existe login de colaborador.'); },
    async decidir(id, aprovar, resposta) {
      const q = getState().pedidosPonto.find((x) => x.id === id); if (!q) return;
      if (aprovar) salvarDiaLocal(q.colaboradorId, q.data, q.tipo, q.hora, 'ajuste');
      act.upd('pedidosPonto', id, { status: aprovar ? 'aprovado' : 'recusado', decididoEm: new Date().toISOString(), resposta: (resposta || '').trim() || null });
    },
    async salvarDia(colabId, data, tipo, hora) { salvarDiaLocal(colabId, data, tipo, hora, 'dono'); },
  }), [S]);
}
function salvarDiaLocal(colabId, data, tipo, hora, origem) {
  const s = getState();
  const ex = s.pontos.find((p) => p.colaboradorId === colabId && dataDe(p.em) === data && p.tipo === tipo);
  if (!hora) { if (ex) act.del('pontos', ex.id); return; }
  const em = localDeDia(data, hora);
  if (ex) act.upd('pontos', ex.id, { em, origem, dist: null, gps: null }); else act.add('pontos', { colaboradorId: colabId, em, tipo, origem, dist: null, gps: null });
}

function useDonoServidor(mes) {
  const [d, setD] = useState({ colaboradores: [], batidas: [], pedidos: [], carregando: true, erro: '' });
  const recarregar = useCallback(async () => {
    try {
      const c = await sb();
      const [ini, fim] = intervaloMes(mes), hojeI = hojeBR();
      const [a, b, h, p] = await Promise.all([
        c.from('colaboradores').select('*').order('nome'),
        c.from('pontos').select('*').gte('dia', ini).lt('dia', fim),
        c.from('pontos').select('*').eq('dia', hojeI),
        c.from('pedidos_ponto').select('*').order('criado_em', { ascending: false }).limit(200),
      ]);
      const falha = a.error || b.error || h.error || p.error; if (falha) throw new Error(falha.message);
      const vistos = new Map([...b.data, ...h.data].map((r) => [r.id, doServidor.batida(r)]));
      setD({ colaboradores: a.data.map(doServidor.colab), batidas: [...vistos.values()], pedidos: p.data.map(doServidor.pedido), carregando: false, erro: '' });
    } catch (e) { setD((x) => ({ ...x, carregando: false, erro: mensagemErro(e) })); }
  }, [mes]);
  useEffect(() => { recarregar(); const t = setInterval(() => !document.hidden && recarregar(), 30000); return () => clearInterval(t); }, [recarregar]);
  return useMemo(() => ({
    ...d, recarregar,
    async salvarColab(c) {
      const cli = await sb();
      if (c.id) {   // edição: só grava se ninguém mudou desde que o cadastro foi aberto
        const { data: lin, error: e1 } = await cli.from('colaboradores').update(paraServidor(c)).eq('id', c.id).eq('versao', c.versao ?? 1).select('id');
        if (e1) throw new Error(e1.message);
        if (!lin?.length) { await recarregar(); throw new Error('conflito_edicao'); }
        await recarregar(); return c.id;
      }
      const q = cli.from('colaboradores').insert(paraServidor(c)).select('id').single();
      const { data, error } = await q;
      if (error) throw new Error(error.message); await recarregar(); return data.id;
    },
    async removerColab(id) { const { error } = await (await sb()).from('colaboradores').delete().eq('id', id); if (error) throw new Error(error.message); await recarregar(); },
    async vincular(id, email) { await rpc('definir_acesso_colaborador', { p_colab: id, p_email: email }); await recarregar(); },
    async decidir(id, aprovar, resposta) { await rpc('ponto_decidir_ajuste', { p_id: id, p_aprovar: aprovar, p_resposta: resposta || null }); await recarregar(); },
    async salvarDia(colabId, data, tipo, hora) { await rpc('ponto_salvar_dia', { p_colab: colabId, p_dia: data, p_tipo: tipo, p_hora: hora || null }); await recarregar(); },
  }), [d, recarregar]);
}
export const usePontoDono = temServidor ? useDonoServidor : useDonoLocal;

/* ========================== COLABORADOR ========================== */
function useColabLocal({ colaboradorId, mes }) {
  const S = useStore();
  const [ini, fim] = intervaloMes(mes);
  const c = S.colaboradores.find((x) => x.id === colaboradorId) || null;
  return useMemo(() => ({
    colab: c && { ...c, temLocal: c.lat != null && c.lng != null },
    batidas: S.pontos.filter((p) => p.colaboradorId === colaboradorId && dataDe(p.em) >= ini && dataDe(p.em) < fim),
    hojeBatidas: S.pontos.filter((p) => p.colaboradorId === colaboradorId && dataDe(p.em) === hojeBR()),
    pedidos: S.pedidosPonto.filter((p) => p.colaboradorId === colaboradorId).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
    carregando: false, erro: '', recarregar: () => {},
    async bater(tipo) {
      const g = getState(), col = g.colaboradores.find((x) => x.id === colaboradorId);
      if (col?.batePonto === false) throw new Error('sem_ponto');
      if (!col || col.lat == null || col.lng == null) throw new Error('sem_local');
      const pos = await posicao();
      if (!(pos.precisao <= PRECISAO_MAX)) throw new Error('gps_fraco');
      const dist = Math.round(distMetros(pos, col));
      if (dist > (col.raio || RAIO_PADRAO)) throw new Error(`fora_do_local:${dist}`);
      const hojeLista = g.pontos.filter((p) => p.colaboradorId === colaboradorId && dataDe(p.em) === hojeBR());
      const ultimo = hojeLista.reduce((m, p) => Math.max(m, new Date(p.em).getTime()), 0);
      if (Date.now() - ultimo < INTERVALO_MIN_S * 1000) throw new Error('muito_rapido');
      if (!proximos(hojeLista).includes(tipo)) throw new Error('sequencia_invalida');
      act.add('pontos', { colaboradorId, em: new Date().toISOString(), tipo, origem: 'gps', dist, gps: { lat: pos.lat, lng: pos.lng, precisao: Math.round(pos.precisao) } });
      return { dist };
    },
    async pedirAjuste({ data, tipo, hora, motivo }) {
      const g = getState(), hojeI = hojeBR();
      if (!motivo.trim()) throw new Error('motivo_obrigatorio');
      if (!data || !hora || data > hojeI) throw new Error('data_invalida');
      if (g.pedidosPonto.some((p) => p.colaboradorId === colaboradorId && p.data === data && p.tipo === tipo && p.status === 'pendente')) throw new Error('pedido_ja_pendente');
      act.add('pedidosPonto', { colaboradorId, data, tipo, hora, motivo: motivo.trim(), status: 'pendente', criadoEm: new Date().toISOString(), resposta: null });
    },
  }), [S, colaboradorId, c, ini, fim]);
}

function useColabServidor({ mes }) {
  const [d, setD] = useState({ colab: null, batidas: [], pedidos: [], carregando: true, erro: '' });
  const reqId = useRef(0);
  const recarregar = useCallback(async () => {
    const meu = ++reqId.current;
    try {
      const r = await rpc('ponto_meus_dados', { p_mes: mes });
      if (meu !== reqId.current) return;
      if (r?.erro) throw new Error(r.erro);
      const colab = { id: r.colaborador.id, nome: r.colaborador.nome, funcao: r.colaborador.funcao || '', endereco: r.colaborador.endereco || '', raio: r.colaborador.raio_m, cargaMin: r.colaborador.carga_min, temLocal: r.colaborador.tem_local, batePonto: r.colaborador.bate_ponto !== false };
      setD({ colab, batidas: r.batidas.map((b) => ({ id: b.id, colaboradorId: colab.id, em: b.em, tipo: b.tipo, origem: b.origem, dist: b.dist_m })), pedidos: r.pedidos.map((q) => ({ id: q.id, data: q.dia, tipo: q.tipo, hora: String(q.hora).slice(0, 5), motivo: q.motivo, status: q.status, resposta: q.resposta, criadoEm: q.criado_em })), carregando: false, erro: '' });
    } catch (e) { if (meu === reqId.current) setD((x) => ({ ...x, carregando: false, erro: mensagemErro(e) })); }
  }, [mes]);
  useEffect(() => { recarregar(); }, [recarregar]);
  const hojeISO = hojeBR();
  return useMemo(() => ({
    ...d, recarregar,
    // "hoje" sai do mês carregado: a tela de hoje sempre chama este hook com o mês atual
    hojeBatidas: d.batidas.filter((b) => dataDe(b.em) === hojeISO),
    async bater(tipo) {
      const pos = await posicao();
      if (!(pos.precisao <= PRECISAO_MAX)) throw new Error('gps_fraco');
      const r = await rpc('ponto_bater', { p_tipo: tipo, p_lat: pos.lat, p_lng: pos.lng, p_precisao: pos.precisao });
      await recarregar(); return { dist: r?.dist_m };
    },
    async pedirAjuste({ data, tipo, hora, motivo }) { await rpc('ponto_pedir_ajuste', { p_dia: data, p_tipo: tipo, p_hora: hora, p_motivo: motivo }); await recarregar(); },
  }), [d, recarregar, hojeISO]);
}
export const usePontoColab = temServidor ? useColabServidor : useColabLocal;
export { TIPOS };
