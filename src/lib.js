import { descontoAtraso } from './atraso.js';
/* ---------- formatação e datas ---------- */
export const brl = (c = 0) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const num = (n = 0) => n.toLocaleString('pt-BR');
export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hoje = () => iso(new Date());
export const parse = (s) => new Date(s + 'T12:00:00');
export const addDias = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const diasEntre = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const dataBR = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
/* UUID de verdade: o banco usa uuid como chave. */
export const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
/* Dia e hora LOCAIS de um instante (o banco devolve em UTC: uma baixa às 22h não pode virar "amanhã"). */
export const diaLocal = (s) => (!s ? '' : s.length === 10 ? s : iso(new Date(s)));
export const horaLocal = (s) => { if (!s) return ''; const d = new Date(s); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const pct = (n) => `${(n * 100).toFixed((n * 100) % 1 === 0 ? 0 : 1).replace('.', ',')}%`;
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const rotuloMes = (s) => `${MESES[parse(s).getMonth()]} ${parse(s).getFullYear()}`;

/* "1.234,56" / "12,5" / 12.5 -> centavos (inteiro) */
export function centavos(v) {
  if (typeof v === 'number') return Math.round(v * 100);
  let s = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  const neg = s.startsWith('-');
  s = s.replace(/^[-+]/, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  if (Number.isNaN(n)) return 0;
  return (neg ? -1 : 1) * Math.round(n * 100);
}
export const reais = (c) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');

/* normaliza endereço: "R. das Flores, nº 10" == "rua das flores 10" */
export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\br\.\s*/g, 'rua ')
    .replace(/\bav\.\s*/g, 'avenida ')
    .replace(/n[º°]\s*/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/* ---------- períodos ---------- */
const diasNoMes = (y, m) => new Date(y, m + 1, 0).getDate();
export function shiftMes(s, n) {
  const d = parse(s);
  const y = d.getFullYear(), m = d.getMonth() + n;
  const alvo = new Date(y, m, 1);
  return iso(new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d.getDate(), diasNoMes(alvo.getFullYear(), alvo.getMonth()))));
}
/* Dias de fechamento das quinzenas (Ajustes). Padrão: dia 15 e o último dia do mês (1–15 e 16–fim).
   Ex.: fechando nos dias 10 e 25 os períodos são 26–10 e 11–25. c2 = 31 significa "último dia do mês". */
let FECH = { c1: 15, c2: 31 };
export function definirFechamento(f) {
  const c1 = Number.isInteger(f?.c1) && f.c1 >= 1 && f.c1 <= 27 ? f.c1 : 15;
  const c2 = Number.isInteger(f?.c2) && f.c2 > c1 && f.c2 <= 31 ? f.c2 : 31;
  FECH = { c1, c2 };
}
export const fechamentoAtual = () => FECH;
export function quinzena(ref) {
  const d = parse(ref), y = d.getFullYear(), m = d.getMonth(), n = d.getDate();
  const C1 = Math.min(FECH.c1, diasNoMes(y, m)), C2 = Math.min(FECH.c2, diasNoMes(y, m));
  if (n <= C1) {
    const pm = new Date(y, m - 1, 1), pC2 = Math.min(FECH.c2, diasNoMes(pm.getFullYear(), pm.getMonth()));
    return { ini: addDias(iso(new Date(y, m - 1, pC2)), 1), fim: iso(new Date(y, m, C1)) };
  }
  if (n <= C2) return { ini: iso(new Date(y, m, C1 + 1)), fim: iso(new Date(y, m, C2)) };
  const nm = new Date(y, m + 1, 1);
  return { ini: iso(new Date(y, m, C2 + 1)), fim: iso(new Date(y, m + 1, Math.min(FECH.c1, diasNoMes(nm.getFullYear(), nm.getMonth())))) };
}
export const quinzenaAnterior = (q) => quinzena(addDias(q.ini, -1));
export const quinzenaSeguinte = (q) => quinzena(addDias(q.fim, 1));
const anterior = (ini, fim) => { const n = diasEntre(ini, fim) + 1; return { ini: addDias(ini, -n), fim: addDias(ini, -1) }; };

export const PERIODOS = [
  ['hoje', 'Hoje'], ['7d', '7 dias'], ['quinzena', 'Quinzena'], ['passada', 'Quinzena passada'], ['mes', 'Este mês'], ['3m', '3 meses'],
];
export function periodo(chave, ref = hoje(), de = '', ate = '') {
  let ini = ref, fim = ref, ant;
  if (chave === 'datas') { ini = de || ref.slice(0, 8) + '01'; fim = ate || ref; if (fim < ini) fim = ini; }
  else if (chave === '7d') ini = addDias(ref, -6);
  else if (chave === 'quinzena') ({ ini, fim } = quinzena(ref));
  else if (chave === 'passada') ({ ini, fim } = quinzenaAnterior(quinzena(ref)));
  else if (chave === 'mes') { ini = ref.slice(0, 8) + '01'; ant = { ini: shiftMes(ini, -1), fim: shiftMes(ref, -1) }; }
  else if (chave === '3m') { ini = shiftMes(ref.slice(0, 8) + '01', -2); ant = { ini: shiftMes(ini, -3), fim: shiftMes(ref, -3) }; }
  return { ini, fim, ant: ant || anterior(ini, fim) };
}

/* ---------- regras de negócio ---------- */
export const STATUS = {
  pendente: 'Pendente', entregue: 'Entregue', ausente: 'Cliente ausente', recusado: 'Recusado',
  avaria: 'Avaria', endereco_errado: 'Endereço errado', reagendar: 'Reagendar',
};
export const OCORRENCIAS = ['ausente', 'recusado', 'avaria', 'endereco_errado', 'reagendar'];
export const CATEGORIAS_BASE = ['Repasse de parceira', 'Combustível', 'Manutenção', 'Parcela de veículo', 'Impostos', 'Comissão de motorista', 'Outras'];
export const CAT_COMISSAO = 'Comissão de motorista';

export const valorMotorista = (S, m) => (m.valor > 0 ? m.valor : S.ajustes.valorPadrao || 0);

/* Percorre as paradas de um período, já aplicando filtros. */
export function metricas(S, { ini, fim, empresaId = '', motoristaId = '' }) {
  const rom = new Map(S.romaneios.map((r) => [r.id, r]));
  const emp = new Map(S.empresas.map((e) => [e.id, e]));
  const o = { entregues: 0, ocorrencias: 0, pendentes: 0, noPrazo: 0, foraPrazo: 0, receita: 0, semTarifa: false, porMotorista: {}, porCidade: {}, porDia: {} };
  for (const p of S.paradas) {
    const r = rom.get(p.romaneioId);
    if (!r || r.data < ini || r.data > fim) continue;
    if (empresaId && r.empresaId !== empresaId) continue;
    if (motoristaId && p.motoristaId !== motoristaId) continue;
    const n = p.pacotes.length;
    const mk = p.motoristaId || '_';
    const pm = (o.porMotorista[mk] ||= { entregues: 0, ocorrencias: 0, pendentes: 0 });
    if (p.status === 'entregue') {
      o.entregues += n; pm.entregues += n;
      o.porDia[r.data] = (o.porDia[r.data] || 0) + n;
      const e = emp.get(r.empresaId);
      if (e?.tarifa > 0) o.receita += n * e.tarifa; else o.semTarifa = true;
      const limite = addDias(r.data, e?.prazoDias ?? 1);
      if ((p.baixaEm ? diaLocal(p.baixaEm) : r.data) <= limite) o.noPrazo += n; else o.foraPrazo += n;
    } else if (p.status === 'pendente') {
      o.pendentes += n; pm.pendentes += n;
    } else {
      o.ocorrencias += n; pm.ocorrencias += n;
      const c = p.cidade || 'Sem cidade';
      o.porCidade[c] = (o.porCidade[c] || 0) + n;
    }
  }
  return o;
}

/* Quanto custa cada motorista no período (por pacote, ou salário fixo proporcional aos dias). */
export function custoMotoristas(S, ini, fim, porMotorista, soMotorista = '') {
  const dias = Math.min(diasEntre(ini, fim) + 1, 30);
  const por = {}; let total = 0;
  for (const m of S.motoristas) {
    if (soMotorista && m.id !== soMotorista) continue;
    const base = valorMotorista(S, m);
    const v = m.tipo === 'fixo' ? Math.round((m.valor * (m.desligadoEm && m.desligadoEm < fim ? Math.max(0, Math.min(diasEntre(ini, m.desligadoEm) + 1, dias)) : dias)) / 30) : Math.max((porMotorista[m.id]?.entregues || 0) * base - descontoAtraso(S, m, ini, fim, base).total, 0);
    if (v > 0) { por[m.id] = v; total += v; }
  }
  return { por, total };
}

/* Acerto quinzenal de um motorista. */
export function acertoQuinzena(S, m, q) {
  const dados = metricas(S, { ini: q.ini, fim: q.fim, motoristaId: m.id });
  const operou = S.romaneios.some((r) => r.data >= q.ini && r.data <= q.fim);
  const pacotes = dados.entregues;
  // fixo desligado: paga só os dias até a saída (proporcional, base de 30 dias); depois da saída não gera mais nada
  let fixo = operou ? Math.round(m.valor / 2) : 0;
  if (m.tipo === 'fixo' && m.desligadoEm) fixo = m.desligadoEm < q.ini ? 0 : Math.min(fixo, Math.round((m.valor * (diasEntre(q.ini, m.desligadoEm < q.fim ? m.desligadoEm : q.fim) + 1)) / 30));
  const bruto = m.tipo === 'fixo' ? fixo : pacotes * valorMotorista(S, m);
  const reg = q.livre ? undefined : S.acertos.find((a) => a.motoristaId === m.id && a.ini === q.ini);
  const descontos = reg?.descontos || [];
  // entregas fora do horário (regra de atraso cadastrada em Ajustes): cada pacote é pago com a redução da faixa
  const atraso = descontoAtraso(S, m, q.ini, q.fim, valorMotorista(S, m));
  const totalDesc = descontos.reduce((s, d) => s + d.valor, 0) + atraso.total;
  const base = { motorista: m, pacotes, bruto, descontos, descAtraso: atraso.total, atrasoLinhas: atraso.linhas, totalDesc, liquido: Math.max(bruto - totalDesc, 0), reg, aprovado: !!reg?.aprovadoEm };
  // acerto já pago: vale o que foi pago na época (não muda se a regra, o valor por pacote ou o período mudarem depois)
  if (reg?.aprovadoEm && reg.snap) {
    const out = { ...base, ...reg.snap, congelado: true };
    // pacote entregue depois da aprovação (carregado nesta quinzena): não entra no valor congelado, então avisa e oferece o complemento
    if (m.tipo !== 'fixo' && base.pacotes > (reg.snap.pacotes || 0)) { out.pacotesDepois = base.pacotes - (reg.snap.pacotes || 0); out.complemento = Math.max(base.liquido - (reg.snap.liquido || 0), 0); out.vivo = base; }
    return out;
  }
  if (reg?.aprovadoEm && reg.liquidoPago != null) return { ...base, liquido: reg.liquidoPago, parcial: true, congelado: true };   // pago antes de guardarmos o detalhe: só o valor líquido
  return base;
}

/* Quinzenas com operação (a partir dos romaneios). */
export function quinzenasComOperacao(S) {
  const m = new Map();
  for (const r of S.romaneios) { const q = quinzena(r.data); m.set(q.ini, q); }
  return [...m.values()].sort((a, b) => a.ini.localeCompare(b.ini));
}

/* Comissões geradas pelas entregas que ainda não foram aprovadas/pagas. */
export function comissoesAbertas(S) {
  const lista = [];
  for (const q of quinzenasComOperacao(S)) {
    for (const m of S.motoristas) {
      const a = acertoQuinzena(S, m, q);
      if (a.liquido > 0 && !a.aprovado) lista.push({ ...a, q });
    }
  }
  return lista;
}

export function saldoHoje(S) {
  let s = S.ajustes.saldoInicial || 0;
  for (const l of S.lancamentos) if (l.pago) s += l.tipo === 'entrada' ? l.valor : -l.valor;
  return s;
}
export function saldoPrevisto(S, ate) {
  let s = saldoHoje(S);
  for (const l of S.lancamentos) if (!l.pago && (l.venc || l.data) <= ate) s += l.tipo === 'entrada' ? l.valor : -l.valor;
  return s - comissoesAbertas(S).reduce((t, c) => t + c.liquido, 0);
}
export function fluxoPeriodo(S, ini, fim) {
  let entradas = 0, saidas = 0, despesas = 0;
  for (const l of S.lancamentos) {
    if (!l.pago || l.data < ini || l.data > fim) continue;
    if (l.tipo === 'entrada') entradas += l.valor;
    else { saidas += l.valor; if (l.categoria !== CAT_COMISSAO) despesas += l.valor; }
  }
  return { entradas, saidas, despesas, resultado: entradas - saidas };
}
