/*
  Redução do valor por pacote por ATRASO na entrega (regra cadastrada em Ajustes).
  Exemplo com valor de R$ 2,80, horário limite 21:00, "depois do horário" R$ 0,20 e "a cada dia seguinte" R$ 0,20:
    entregue até as 21:00 do dia da rota ........ R$ 2,80
    depois das 21:00 do dia da rota ............. R$ 2,60
    no dia seguinte ............................. R$ 2,40
    dois dias depois ............................ R$ 2,20   (e assim por diante)
  O dia e a hora são sempre os de Brasília. O "dia da rota" é a data do romaneio.
  Sem importar de lib.js (o valor base é passado por quem chama), para não criar dependência circular.
*/
const FUSO = 'America/Sao_Paulo';
const fmtData = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const utc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const diasEntre = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const centavos = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0);

/* Regra que vale para o motorista: padrão (Ajustes), própria, ou nenhuma. null = sem redução. */
export function regraAtraso(S, m) {
  const modo = m.reducaoAtraso?.modo || 'padrao';
  if (modo === 'nenhuma') return null;
  const r = modo === 'proprio' ? m.reducaoAtraso : S.ajustes?.reducaoAtraso;
  if (!r || (modo !== 'proprio' && !r.ativo)) return null;
  if (!HORA.test(String(r.hora || ''))) return null;
  const apos = centavos(r.apos), porDia = centavos(r.porDia);
  if (!apos && !porDia) return null;
  return { hora: r.hora, apos, porDia, minimo: centavos(r.minimo) };
}

/* Quanto se reduz em UM pacote entregue em `baixaEm` numa rota do dia `dataRota` (centavos). 0 = no prazo. */
export function reducaoDoPacote(regra, dataRota, baixaEm, base) {
  if (!regra || !baixaEm) return { reducao: 0, dias: 0, atrasado: false };
  const quando = new Date(baixaEm);
  if (Number.isNaN(quando.getTime())) return { reducao: 0, dias: 0, atrasado: false };
  const dia = fmtData.format(quando), hora = fmtHora.format(quando);
  const dias = diasEntre(dataRota, dia);
  let bruta = 0;
  if (dias >= 1) bruta = regra.apos + regra.porDia * dias;           // dia seguinte em diante
  else if (dias === 0 && hora > regra.hora) bruta = regra.apos;      // mesmo dia, depois do horário limite
  const teto = Math.max(base - regra.minimo, 0);                     // nunca abaixo do valor mínimo por pacote
  const reducao = Math.min(bruta, teto);
  return { reducao, dias, atrasado: bruta > 0 };
}

const rotuloDias = (regra, dias) => (dias === 0 ? `No mesmo dia, depois das ${regra.hora}` : dias === 1 ? 'No dia seguinte' : `${dias} dias depois`);

/* Desconto total do motorista nas entregas do período [ini, fim] (pela data da rota), com o detalhe por faixa. */
export function descontoAtraso(S, m, ini, fim, base) {
  const vazio = { total: 0, pacotes: 0, linhas: [], regra: null };
  if (m.tipo === 'fixo') return vazio;
  const regra = regraAtraso(S, m);
  if (!regra) return vazio;
  const rom = new Map(S.romaneios.map((r) => [r.id, r]));
  const faixas = new Map();
  for (const p of S.paradas) {
    if (p.motoristaId !== m.id || p.status !== 'entregue') continue;
    const r = rom.get(p.romaneioId);
    if (!r || r.data < ini || r.data > fim) continue;
    const x = reducaoDoPacote(regra, r.data, p.baixaEm, base);
    if (!x.reducao) continue;
    const f = faixas.get(x.dias) || { dias: x.dias, pacotes: 0, reducao: x.reducao, total: 0 };
    f.pacotes += p.pacotes.length; f.total += x.reducao * p.pacotes.length; f.reducao = x.reducao; faixas.set(x.dias, f);
  }
  const linhas = [...faixas.values()].sort((a, b) => a.dias - b.dias).map((f) => ({ ...f, rotulo: rotuloDias(regra, f.dias) }));
  return { total: linhas.reduce((t, l) => t + l.total, 0), pacotes: linhas.reduce((t, l) => t + l.pacotes, 0), linhas, regra };
}

/* Os valores por faixa para mostrar como exemplo na tela de configuração (base em centavos). */
export function exemploFaixas(regra, base) {
  if (!regra) return [];
  const v = (red) => Math.max(base - Math.min(red, Math.max(base - regra.minimo, 0)), 0);
  const out = [{ rotulo: `Até as ${regra.hora} do dia da rota`, valor: base }];
  if (regra.apos) out.push({ rotulo: `Depois das ${regra.hora}, no mesmo dia`, valor: v(regra.apos) });
  for (const d of [1, 2, 3]) out.push({ rotulo: d === 1 ? 'No dia seguinte' : `${d} dias depois`, valor: v(regra.apos + regra.porDia * d) });
  return out;
}
