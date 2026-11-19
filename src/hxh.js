import { norm } from './lib.js';

/*
  "Reporte Hora a Hora" por motorista — mesma conta da planilha de controle da Casol:
  por pacote, status = ✅ Entregue | ⚠️ Vence hoje | 🕒 No prazo | 🚨 Fora do prazo;
  prazo = dia do carregamento + N dias (N vem da tabela de prazo por cidade, "D + N"; cidade fora da tabela = D + 0);
  Performance = Entregue ÷ Carregados. Dia e hora sempre os de Brasília.
*/
const FUSO = 'America/Sao_Paulo';
const fData = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const fHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const diaBR = (iso) => fData.format(new Date(iso));
export const horaBR = (iso) => fHora.format(new Date(iso));
export const hojeBRT = () => fData.format(new Date());
const somar = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

export const prazoDaCidade = (S, cidade) => { const v = S.ajustes?.prazosCidade?.[norm(cidade || '')]; return Number.isInteger(v) && v >= 0 ? v : 0; };

export function reporteHxH(S, ini, fim, hoje = hojeBRT()) {
  const rom = new Map(S.romaneios.map((r) => [r.id, r]));
  const por = new Map();
  for (const p of S.paradas) {
    const r = rom.get(p.romaneioId);
    if (!r || r.data < ini || r.data > fim || !p.motoristaId) continue;
    const n = p.pacotes.length, carga = p.carregadoEm ? new Date(p.carregadoEm) : null;
    const diaCarga = carga && !Number.isNaN(carga.getTime()) ? diaBR(carga) : r.data;
    const limite = somar(diaCarga, prazoDaCidade(S, p.cidade));
    const st = p.status === 'entregue' ? 'ent' : limite < hoje ? 'fora' : limite === hoje ? 'vence' : 'prazo';
    let g = por.get(p.motoristaId);
    if (!g) { g = { motoristaId: p.motoristaId, carregados: 0, ent: 0, vence: 0, prazo: 0, fora: 0, carga: null, primeira: null, ultima: null, cidade: p.cidade || '', diaCarga }; por.set(p.motoristaId, g); }
    g.carregados += n; g[st] += n;
    if (carga && (!g.carga || carga < g.carga)) { g.carga = carga; g.diaCarga = diaCarga; }
    if (p.status === 'entregue' && p.baixaEm) { const t = new Date(p.baixaEm); if (!g.primeira || t < g.primeira) g.primeira = t; if (!g.ultima || t > g.ultima) g.ultima = t; }
  }
  const nomes = new Map(S.motoristas.map((m) => [m.id, m.nome]));
  const linhas = [...por.values()].map((g) => ({
    ...g, nome: nomes.get(g.motoristaId) || '—', performance: g.carregados ? g.ent / g.carregados : 0,
    turno: g.carga ? (Number(horaBR(g.carga).slice(0, 2)) < 12 ? 'AM' : 'PM') : '',
    prazoCidade: prazoDaCidade(S, g.cidade),
  })).sort((a, b) => b.carregados - a.carregados || a.nome.localeCompare(b.nome));
  const tot = linhas.reduce((t, l) => ({ carregados: t.carregados + l.carregados, ent: t.ent + l.ent, vence: t.vence + l.vence, prazo: t.prazo + l.prazo, fora: t.fora + l.fora }), { carregados: 0, ent: 0, vence: 0, prazo: 0, fora: 0 });
  return { linhas, tot: { ...tot, performance: tot.carregados ? tot.ent / tot.carregados : 0 } };
}
