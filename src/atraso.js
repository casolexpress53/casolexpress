/*
  Redução do valor por pacote por ATRASO na entrega — totalmente configurável em Ajustes.
  A regra tem um HORÁRIO LIMITE no dia da rota (data do romaneio) e uma lista de FAIXAS. Cada faixa diz:
    "depois de N [minutos | horas | dias] de atraso, reduzir R$ X por pacote" (uma vez), ou
    "a cada N [minutos | horas | dias] de atraso, reduzir R$ X por pacote" (repete).
  As reduções de todas as faixas atingidas se somam; nunca fica abaixo do valor mínimo por pacote.
  Minutos e horas contam a partir do horário limite; "dias" conta dias de calendário depois do dia da rota
  (entregou no dia seguinte = 1 dia). O dia e a hora são sempre os de Brasília.
  Sem importar de lib.js (o valor base é passado por quem chama), para não criar dependência circular.
*/
const FUSO = 'America/Sao_Paulo';
const fmtData = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const utc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const diasEntre = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);

export const UNIDADES = { min: 'minutos', h: 'horas', dia: 'dias' };
const MIN_POR = { min: 1, h: 60 };
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const centavos = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0);

/* faixas da regra; aceita o formato antigo (apos + porDia) e o converte */
export function faixasDe(r) {
  if (Array.isArray(r?.faixas)) return r.faixas;
  const f = [];
  if (centavos(r?.apos)) f.push({ apos: 1, un: 'min', valor: centavos(r.apos), repetir: false });
  if (centavos(r?.porDia)) f.push({ apos: 1, un: 'dia', valor: centavos(r.porDia), repetir: true });
  return f;
}

/* Regra que vale para o motorista: padrão (Ajustes), própria, ou nenhuma. null = sem redução. */
export function regraAtraso(S, m) {
  const modo = m.reducaoAtraso?.modo || 'padrao';
  if (modo === 'nenhuma') return null;
  const r = modo === 'proprio' ? m.reducaoAtraso : S.ajustes?.reducaoAtraso;
  if (!r || (modo !== 'proprio' && !r.ativo)) return null;
  if (!HORA.test(String(r.hora || ''))) return null;
  const faixas = faixasDe(r)
    .map((f) => ({ apos: Math.max(1, Math.round(Number(f.apos) || 0)), un: UNIDADES[f.un] ? f.un : 'min', valor: centavos(f.valor), repetir: !!f.repetir }))
    .filter((f) => f.valor > 0);
  if (!faixas.length) return null;
  return { hora: r.hora, faixas, minimo: centavos(r.minimo) };
}

/* Quantas vezes a faixa vale para um atraso (em minutos) e dias de calendário depois do dia da rota. */
function vezes(f, atrasoMin, dias) {
  if (atrasoMin < 1) return 0;
  const v = f.un === 'dia' ? dias : atrasoMin / MIN_POR[f.un];
  return f.repetir ? Math.floor(v / f.apos) : v >= f.apos ? 1 : 0;
}
const textoFaixa = (f) => `${f.repetir ? 'a cada' : 'depois de'} ${f.apos} ${f.un === 'dia' ? (f.apos === 1 ? 'dia' : 'dias') : f.un === 'h' ? (f.apos === 1 ? 'hora' : 'horas') : (f.apos === 1 ? 'minuto' : 'minutos')}`;

function calcular(regra, atrasoMin, dias, base) {
  let bruta = 0; const usadas = [];
  regra.faixas.forEach((f, i) => { const n = vezes(f, atrasoMin, dias); if (n) { bruta += f.valor * n; usadas.push(`${i}x${n}`); } });
  const teto = Math.max(base - regra.minimo, 0);                     // nunca abaixo do valor mínimo por pacote
  return { reducao: Math.min(bruta, teto), atrasado: bruta > 0, assinatura: usadas.join(',') };
}

/* Quanto se reduz em UM pacote entregue em `baixaEm` numa rota do dia `dataRota` (centavos). 0 = no prazo. */
export function reducaoDoPacote(regra, dataRota, baixaEm, base) {
  const nada = { reducao: 0, dias: 0, atrasoMin: 0, atrasado: false, assinatura: '' };
  if (!regra || !baixaEm) return nada;
  const quando = new Date(baixaEm);
  if (Number.isNaN(quando.getTime())) return nada;
  const limite = new Date(`${dataRota}T${regra.hora}:00-03:00`);
  const atrasoMin = Math.floor((quando - limite) / 60000);
  const dias = diasEntre(dataRota, fmtData.format(quando));
  return { ...calcular(regra, atrasoMin, dias, base), dias, atrasoMin };
}

/* Desconto total do motorista nas entregas do período [ini, fim] (pela data da rota), com o detalhe por faixa. */
export function descontoAtraso(S, m, ini, fim, base) {
  const vazio = { total: 0, pacotes: 0, linhas: [], regra: null };
  if (m.tipo === 'fixo') return vazio;
  const regra = regraAtraso(S, m);
  if (!regra) return vazio;
  const rom = new Map(S.romaneios.map((r) => [r.id, r]));
  const grupos = new Map();
  for (const p of S.paradas) {
    if (p.motoristaId !== m.id || p.status !== 'entregue') continue;
    const r = rom.get(p.romaneioId);
    if (!r || r.data < ini || r.data > fim) continue;
    const x = reducaoDoPacote(regra, r.data, p.baixaEm, base);
    if (!x.reducao) continue;
    const g = grupos.get(x.assinatura) || { assinatura: x.assinatura, pacotes: 0, reducao: x.reducao, total: 0, min: x.atrasoMin };
    g.pacotes += p.pacotes.length; g.total += x.reducao * p.pacotes.length; g.min = Math.min(g.min, x.atrasoMin); grupos.set(x.assinatura, g);
  }
  const linhas = [...grupos.values()].sort((a, b) => a.min - b.min).map((g) => ({
    ...g, rotulo: g.assinatura.split(',').map((t) => { const [i, n] = t.split('x'); const f = regra.faixas[+i]; return `${textoFaixa(f)}${f.repetir && +n > 1 ? ` (×${n})` : ''}`; }).join(' + '),
  }));
  return { total: linhas.reduce((t, l) => t + l.total, 0), pacotes: linhas.reduce((t, l) => t + l.pacotes, 0), linhas, regra };
}

/* Exemplos de valor por pacote para a tela de configuração (base em centavos). */
export function exemploFaixas(regra, base) {
  if (!regra) return [];
  const [hh, mm] = regra.hora.split(':').map(Number), minDoDia = hh * 60 + mm;
  const cen = [{ rotulo: `Entregue até as ${regra.hora} do dia da rota`, atrasoMin: 0, dias: 0, ord: 0 }];
  for (const f of regra.faixas) for (const k of f.repetir ? [1, 2, 3] : [1]) {
    const n = f.apos * k;
    if (f.un === 'dia') cen.push({ rotulo: n === 1 ? 'Entregue no dia seguinte' : `Entregue ${n} dias depois`, atrasoMin: n * 1440 - minDoDia + 1, dias: n, ord: n * 1440 - minDoDia + 1 });
    else { const am = n * MIN_POR[f.un]; cen.push({ rotulo: `Entregue ${n} ${f.un === 'h' ? (n === 1 ? 'hora' : 'horas') : (n === 1 ? 'minuto' : 'minutos')} depois das ${regra.hora}`, atrasoMin: am, dias: Math.floor((minDoDia + am) / 1440), ord: am }); }
  }
  const vistos = new Set();
  return cen.sort((a, b) => a.ord - b.ord).filter((c) => !vistos.has(c.rotulo) && vistos.add(c.rotulo))
    .map((c) => ({ rotulo: c.rotulo, valor: Math.max(base - calcular(regra, c.atrasoMin, c.dias, base).reducao, 0) })).slice(0, 10);
}
