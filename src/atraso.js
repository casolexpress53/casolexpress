/*
  Desconto por NÃO BATER A META DO DIA (regra cadastrada em Ajustes). Substitui a antiga regra por atraso.

  Para cada motorista e cada DIA DA ROTA (o dia em que o pacote foi carregado):
    performance do dia = pacotes entregues até o HORÁRIO DE CORTE (ex.: 21:30 do dia da rota) ÷ pacotes carregados no dia.
  Se a performance ficar abaixo da META (ex.: 95%), desconta o VALOR (ex.: R$ 0,20) em cada pacote entregue do dia
  (só os que contam, isto é, entregues até o corte; opcionalmente também os entregues depois do corte).
  O dia só é fechado depois do horário de corte: antes disso o dia ainda está em andamento e não desconta.
  Dias isentos (feriado, exceção) não descontam. O dia e a hora são sempre os de Brasília.
  Sem importar de lib.js (para não criar dependência circular).
*/
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const centavos = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0);

/* A regra que vale para o motorista: geral (Ajustes), própria, ou nenhuma. null = sem desconto. */
export function regraAtraso(S, m) {
  const modo = m.reducaoAtraso?.modo || 'padrao';
  if (modo === 'nenhuma') return null;
  const r = modo === 'proprio' ? m.reducaoAtraso : S.ajustes?.reducaoAtraso;
  if (!r || (modo !== 'proprio' && !r.ativo)) return null;
  if (!HORA.test(String(r.hora || ''))) return null;
  const valor = centavos(r.valor);
  if (!valor) return null;
  const meta = Number.isFinite(Number(r.metaPct)) && Number(r.metaPct) > 0 ? Math.min(Number(r.metaPct), 100) : 95;
  return { hora: r.hora, meta, valor, incluirDepois: !!r.incluirDepois };
}

/* Só o horário de corte (mesmo sem valor de desconto cadastrado): serve para mostrar a performance do dia. */
export function regraHora(S, m) {
  const modo = m.reducaoAtraso?.modo || 'padrao';
  if (modo === 'nenhuma') return null;
  const r = modo === 'proprio' ? m.reducaoAtraso : S.ajustes?.reducaoAtraso;
  if (!r || (modo !== 'proprio' && !r.ativo)) return null;
  if (!HORA.test(String(r.hora || ''))) return null;
  const meta = Number.isFinite(Number(r.metaPct)) && Number(r.metaPct) > 0 ? Math.min(Number(r.metaPct), 100) : 95;
  return { hora: r.hora, meta, valor: centavos(r.valor), incluirDepois: !!r.incluirDepois };
}

/* Dias sem desconto (feriado, exceção): guardados junto da regra. motoristaId vazio = vale para todos. */
export const isencoesDe = (S) => S.ajustes?.reducaoAtraso?.isencoes || [];
export const estaIsento = (S, motoristaId, dia) => isencoesDe(S).find((i) => i.data === dia && (!i.motoristaId || i.motoristaId === motoristaId)) || null;

const corteDe = (dia, hora) => new Date(`${dia}T${hora}:00-03:00`);

/* Desempenho de cada dia da rota no período [ini, fim] (pela data do romaneio = dia do carregamento). */
export function desempenhoPorDia(S, m, ini, fim) {
  const rh = regraHora(S, m); if (!rh) return [];
  const rom = new Map(S.romaneios.map((r) => [r.id, r]));
  const dias = new Map();
  for (const p of S.paradas) {
    if (p.motoristaId !== m.id) continue;
    const r = rom.get(p.romaneioId);
    if (!r || r.data < ini || r.data > fim) continue;
    const d = dias.get(r.data) || { data: r.data, carregados: 0, ate: 0, depois: 0 };
    const n = p.pacotes.length; d.carregados += n;
    if (p.status === 'entregue' && p.baixaEm) {
      if (new Date(p.baixaEm) <= corteDe(r.data, rh.hora)) d.ate += n; else d.depois += n;
    }
    dias.set(r.data, d);
  }
  const agora = Date.now();
  return [...dias.values()].sort((a, b) => a.data.localeCompare(b.data)).map((d) => {
    const fechado = agora >= corteDe(d.data, rh.hora).getTime();          // só depois do corte o dia vale
    const perf = d.carregados ? d.ate / d.carregados : null;
    const abaixo = fechado && perf != null && perf * 100 < rh.meta - 1e-9;
    const isento = estaIsento(S, m.id, d.data);
    const base = rh.incluirDepois ? d.ate + d.depois : d.ate;
    const desconto = abaixo && !isento && m.tipo !== 'fixo' ? rh.valor * base : 0;
    return { ...d, perf, fechado, abaixo, isento, pacotesDesconto: abaixo ? base : 0, desconto, hora: rh.hora, meta: rh.meta, valor: rh.valor };
  });
}

/* Desconto total do motorista no período, com uma linha por dia que não bateu a meta. (O 5º argumento não é mais usado.) */
export function descontoAtraso(S, m, ini, fim) {
  const vazio = { total: 0, pacotes: 0, linhas: [], regra: null };
  if (m.tipo === 'fixo') return vazio;
  const regra = regraAtraso(S, m);
  if (!regra) return vazio;
  const dd = (x) => x.slice(8) + '/' + x.slice(5, 7);
  const linhas = desempenhoPorDia(S, m, ini, fim).filter((d) => d.desconto > 0).map((d) => ({
    assinatura: d.data, data: d.data, pacotes: d.pacotesDesconto, reducao: d.valor, total: d.desconto,
    rotulo: `dia ${dd(d.data)}: performance ${Math.round(d.perf * 100)}% (meta ${d.meta}%)`,
  }));
  return { total: linhas.reduce((t, l) => t + l.total, 0), pacotes: linhas.reduce((t, l) => t + l.pacotes, 0), linhas, regra };
}

/* Resumo do período: dias fechados, dias abaixo da meta e desconto (para o SLA e para o motorista). */
export function resumoMeta(S, m, ini, fim) {
  const regra = regraHora(S, m);
  const vazio = { regra: null, dias: [], fechados: 0, abaixo: 0, desconto: 0, perfAteCorte: null };
  if (!regra) return vazio;
  const dias = desempenhoPorDia(S, m, ini, fim);
  const fechados = dias.filter((d) => d.fechado);
  const car = fechados.reduce((t, d) => t + d.carregados, 0), ate = fechados.reduce((t, d) => t + d.ate, 0);
  return { regra, dias, fechados: fechados.length, abaixo: fechados.filter((d) => d.abaixo && !d.isento).length, desconto: dias.reduce((t, d) => t + d.desconto, 0), perfAteCorte: car ? ate / car : null };
}

/* Exemplo para a tela de configuração (valores em centavos). */
export function exemploMeta(regra, base = 280) {
  if (!regra) return [];
  const vezes = 100, ok = Math.ceil((regra.meta / 100) * vezes), ruim = Math.max(ok - 3, 0);
  return [
    { rotulo: `Carregou ${vezes} e entregou ${ok} até as ${regra.hora} (${Math.round((ok / vezes) * 100)}%): bateu a meta`, valor: ok * base },
    { rotulo: `Carregou ${vezes} e entregou ${ruim} até as ${regra.hora} (${Math.round((ruim / vezes) * 100)}%): perde ${(regra.valor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em cada um dos ${ruim}`, valor: ruim * (base - regra.valor) },
  ];
}
