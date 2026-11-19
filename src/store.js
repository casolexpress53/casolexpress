import { useSyncExternalStore } from 'react';
import { temServidor } from './auth.js';
import { definirFechamento, uid } from './lib.js';
import * as sync from './sync.js';

/*
  Camada de dados. Hoje: localStorage (modo demonstração).
  Quando o Supabase estiver criado, é aqui que o driver de nuvem entra:
  as telas só usam useStore() e act.*, então nada mais precisa mudar.
*/
const KEY = 'casol_express_v1';

export const vazio = () => ({
  v: 1, demo: false,
  empresas: [], motoristas: [], romaneios: [], paradas: [], lancamentos: [], acertos: [], veiculos: [],
  colaboradores: [], pontos: [], pedidosPonto: [],
  ajustes: { saldoInicial: 0, valorPadrao: 0, meta: 0, categorias: [] },
});

function carregar() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); return { ...vazio(), ...s, ajustes: { ...vazio().ajustes, ...s.ajustes } }; }
  } catch { /* dados corrompidos: começa vazio */ }
  return vazio();
}

/* Modo servidor: nada de dados em localStorage (dado pessoal não fica no navegador); a fonte da verdade é o Supabase. */
let state = temServidor ? vazio() : carregar();
definirFechamento(state.ajustes?.fechamento);
let modo = null;   // 'dono' | 'operador' | 'motorista' | 'colaborador' (só no modo servidor)
const subs = new Set();

export const getState = () => state;
/* só o dono (ou a demonstração) mexe em acessos e permissões da equipe */
export const souDono = () => !temServidor || modo === 'dono';
export function setState(fn) {
  const prev = state;
  state = fn(state);
  definirFechamento(state.ajustes?.fechamento);
  if (!temServidor) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('Não foi possível salvar no navegador', e); } }
  else if (modo === 'dono' || modo === 'operador') sync.registrar(prev, state);
  subs.forEach((f) => f());
}
/* Troca o estado inteiro (carga do servidor) SEM gerar gravação. */
function substituir(next) { state = { ...vazio(), ...next, carregado: true }; definirFechamento(state.ajustes?.fechamento); subs.forEach((f) => f()); }

/* ----- modo servidor: carga, atualização periódica e encerramento ----- */
let relogio = null, limparRelogio = null, geracao = 0;
async function carga(papel) {
  if (papel === 'dono' || papel === 'operador') return (await sync.carregarTudo(true)).dados;
  if (papel === 'motorista') return sync.carregarMotorista();
  return {};
}
export async function iniciarServidor(papel) {
  encerrarServidor(true);
  const minha = ++geracao;            // se outra carga começar antes desta terminar, esta é descartada
  modo = papel;
  const dados = await carga(papel);
  if (minha !== geracao) return { motoristaId: null, descartada: true };
  substituir(dados);
  if (papel === 'dono' || papel === 'operador') { sync.ligar(); sync.definirAoConflito(async () => { const r = await sync.carregarTudo(true); substituir(r.dados); }); }
  if (papel === 'dono' || papel === 'operador' || papel === 'motorista') {
    const atualizar = async () => {
      if (document.hidden || sync.temPendencia() || modo !== papel || minha !== geracao) return;
      try {
        if (papel === 'dono' || papel === 'operador') {
          const r = await sync.carregarTudo(false);
          if (r.descartada || sync.temPendencia() || modo !== papel || minha !== geracao) return;
          if (r.externo) { substituir(r.dados); sync.avisar({ tipo: 'info', texto: 'Outra pessoa atualizou os dados. A tela já mostra a versão mais recente.' }); }
          return;
        }
        const novo = await carga(papel);
        if (sync.temPendencia() || modo !== papel || minha !== geracao) return;
        const a = JSON.stringify({ ...state, carregado: 0 }), b = JSON.stringify({ ...vazio(), ...novo, carregado: 0 });
        if (a !== b) substituir(novo);
      } catch { /* sem rede agora: tenta no próximo ciclo */ }
    };
    relogio = setInterval(atualizar, 30000);
    document.addEventListener('visibilitychange', atualizar);
    limparRelogio = () => document.removeEventListener('visibilitychange', atualizar);
  }
  return { motoristaId: dados.motoristaId || null };
}
export async function recarregar() {
  if (!temServidor || !modo || sync.temPendencia()) return;
  substituir(await carga(modo));
}
export function encerrarServidor(manter = false) {
  clearInterval(relogio); limparRelogio?.(); relogio = null; limparRelogio = null;
  if (!manter) geracao += 1;
  if (!manter) { modo = null; sync.desligar(); state = vazio(); subs.forEach((f) => f()); }
}
const emServidor = () => temServidor;
export const useStore = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);

export const act = {
  /* Com dados reais, estas duas apagariam/sobrescreveriam a nuvem: ficam travadas. */
  limpar: () => { if (emServidor()) throw new Error('Bloqueado: com dados reais não é possível apagar tudo.'); setState(() => vazio()); },
  async carregarDemo() { if (emServidor()) throw new Error('Bloqueado: os dados fictícios sobrescreveriam os dados reais.'); const { gerarDemo } = await import('./seed.js'); setState(() => gerarDemo()); },
  add: (col, item) => { const id = uid(); setState((s) => ({ ...s, [col]: [...s[col], { id, ...item }] })); return id; },
  upd: (col, id, patch) => setState((s) => ({ ...s, [col]: s[col].map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
  del: (col, id) => setState((s) => ({ ...s, [col]: s[col].filter((x) => x.id !== id) })),
  ajustes: (patch) => setState((s) => ({ ...s, ajustes: { ...s.ajustes, ...patch } })),

  baixar: (id, status, gps) => {
    act.upd('paradas', id, { status, baixaEm: new Date().toISOString(), gps: gps || null });
    if (temServidor && modo === 'motorista') sync.rpc('motorista_baixar', { p_parada: id, p_status: status, p_lat: gps?.lat ?? null, p_lng: gps?.lng ?? null }).catch((e) => falhaMotorista(e));
  },
  desfazer: (id) => {
    act.upd('paradas', id, { status: 'pendente', baixaEm: null, gps: null });
    if (temServidor && modo === 'motorista') sync.rpc('motorista_desfazer', { p_parada: id }).catch((e) => falhaMotorista(e));
  },

  importar: ({ empresaId, data, arquivo, paradas }) => setState((s) => {
    const id = uid();
    const novas = paradas.map((p) => ({ id: uid(), romaneioId: id, status: 'pendente', baixaEm: null, ...p }));
    return { ...s, romaneios: [...s.romaneios, { id, empresaId, data, arquivo, finalizado: false }], paradas: [...s.paradas, ...novas] };
  }),
  excluirRomaneio: (id) => setState((s) => ({ ...s, romaneios: s.romaneios.filter((r) => r.id !== id), paradas: s.paradas.filter((p) => p.romaneioId !== id) })),
  distribuir: (cidade, motoristaId) => setState((s) => ({
    ...s, paradas: s.paradas.map((p) => (!p.motoristaId && (p.cidade || 'Sem cidade') === cidade && p.status === 'pendente' ? { ...p, motoristaId } : p)),
  })),

  /* acerto quinzenal: cria o registro na primeira alteração */
  acertoGarantir: (motoristaId, q) => {
    const s = getState();
    const ex = s.acertos.find((a) => a.motoristaId === motoristaId && a.ini === q.ini);
    if (ex) return ex.id;
    return act.add('acertos', { motoristaId, ini: q.ini, fim: q.fim, descontos: [], aprovadoEm: null, lancId: null });
  },
  descontoAdd: (motoristaId, q, desc, valor) => {
    const id = act.acertoGarantir(motoristaId, q);
    setState((s) => ({ ...s, acertos: s.acertos.map((a) => (a.id === id ? { ...a, descontos: [...a.descontos, { id: uid(), desc, valor }] } : a)) }));
  },
  descontoDel: (acertoId, dId) => setState((s) => ({ ...s, acertos: s.acertos.map((a) => (a.id === acertoId ? { ...a, descontos: a.descontos.filter((d) => d.id !== dId) } : a)) })),
  aprovar: (motoristaId, q, liquido, nome, hojeISO, snap = null) => {
    const id = act.acertoGarantir(motoristaId, q);
    const lancId = act.add('lancamentos', {
      data: hojeISO, tipo: 'saida', categoria: 'Comissão de motorista', pago: true, venc: hojeISO, origem: 'comissao',
      descricao: `Acerto ${nome} · ${q.ini.slice(8)}/${q.ini.slice(5, 7)} a ${q.fim.slice(8)}/${q.fim.slice(5, 7)}`, valor: liquido,
    });
    act.upd('acertos', id, { aprovadoEm: new Date().toISOString(), lancId, snap });   // snap: valores no momento do pagamento (não mudam se a regra mudar depois)
  },
  desaprovar: (acertoId) => {
    const a = getState().acertos.find((x) => x.id === acertoId);
    if (a?.lancId) act.del('lancamentos', a.lancId);
    act.upd('acertos', acertoId, { aprovadoEm: null, lancId: null, snap: null });
  },
};

/* A baixa do motorista não foi aceita pelo servidor: avisa e recarrega o que está de fato salvo. */
async function falhaMotorista(e) {
  sync.falhou(e.message || 'Não foi possível salvar a baixa');
  try { substituir(await sync.carregarMotorista()); } catch { /* sem rede: mantém o que está na tela */ }
}
