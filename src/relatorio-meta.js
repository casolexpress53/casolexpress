import { desempenhoPorDia } from './atraso.js';
import { brl, dataBR, num } from './lib.js';

/* Linhas dos relatórios (PDF) do desconto por meta do dia: um dia de um motorista por linha. */
export const COLUNAS_DESCONTO = ['Motorista', 'Dia', 'Carregou', 'Entregou até o corte', 'Depois', 'Pendente', 'Performance', 'Meta', 'Resultado', 'Desconto'];
const RESULT = { bateu: 'Bateu a meta', abaixo: 'Abaixo da meta', isento: 'Isento', andamento: 'Em andamento' };
const pct = (v) => (v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

export function linhasDescontos(S, motoristas, ini, fim) {
  const linhas = []; let total = 0, dias = 0, abaixo = 0;
  for (const m of motoristas) {
    for (const d of desempenhoPorDia(S, m, ini, fim)) {
      dias++; if (d.situacao === 'abaixo' || d.situacao === 'isento') abaixo++;
      total += d.desconto;
      linhas.push([m.nome, dataBR(d.data).slice(0, 5), num(d.carregados), num(d.ate), num(d.depois), num(d.pendentes), pct(d.perf), `${d.meta}%`, RESULT[d.situacao] + (d.isento?.motivo ? ` (${d.isento.motivo})` : ''), d.desconto > 0 ? `− ${brl(d.desconto)}` : '—']);
    }
  }
  return { linhas, total, dias, abaixo };
}
