import { metricas, pct } from './lib.js';

/*
  SLA do motorista: metas acordadas, comparadas com o que ele realmente entregou no período.
  Não existe meta pré-definida: a Casol informa os alvos em Ajustes. Campo em branco = não avalia.
  As contas são as mesmas do Painel.
*/
export const METRICAS_SLA = [
  { k: 'taxaEntrega', rotulo: 'Taxa de entrega', op: '>=', un: '%', ajuda: 'Pacotes entregues ÷ (entregues + com ocorrência). Mínimo.' },
  { k: 'ocorrencias', rotulo: 'Ocorrências', op: '<=', un: '%', ajuda: 'Pacotes com ocorrência ÷ (entregues + com ocorrência). Máximo.' },
  { k: 'noPrazo', rotulo: 'Entregas no prazo', op: '>=', un: '%', ajuda: 'Entregues dentro do prazo da empresa ÷ entregues. Mínimo.' },
  { k: 'pacotesDia', rotulo: 'Pacotes por dia', op: '>=', un: 'pac.', ajuda: 'Entregues ÷ dias em que ele entregou. Mínimo.' },
];
export const MODOS_SLA = [['padrao', 'Usar a meta padrão'], ['proprio', 'Regra própria'], ['nenhuma', 'Sem meta']];

const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));

/* Quais metas valem para este motorista (já resolvendo padrão / própria / nenhuma). */
export function regrasEfetivas(S, m) {
  const modo = m.sla?.modo || 'padrao';
  if (modo === 'nenhuma') return [];
  const fonte = modo === 'proprio' ? m.sla : S.ajustes.sla || {};
  return METRICAS_SLA.map((x) => ({ ...x, alvo: num(fonte[x.k]) })).filter((x) => x.alvo != null);
}

export const temAlgumaMeta = (S) => S.motoristas.some((m) => regrasEfetivas(S, m).length > 0);

/* Resultado de um motorista no período, contra cada meta dele. */
export function avaliarSla(S, m, ini, fim) {
  const d = metricas(S, { ini, fim, motoristaId: m.id });
  const concl = d.entregues + d.ocorrencias, dias = Object.keys(d.porDia).length;
  const valores = {
    taxaEntrega: concl ? d.entregues / concl : null,
    ocorrencias: concl ? d.ocorrencias / concl : null,
    noPrazo: d.entregues ? d.noPrazo / d.entregues : null,
    pacotesDia: dias ? d.entregues / dias : null,
  };
  const regras = regrasEfetivas(S, m).map((r) => {
    const v = valores[r.k];
    const alvoNum = r.un === '%' ? r.alvo / 100 : r.alvo;
    const ok = v == null ? null : r.op === '>=' ? v >= alvoNum : v <= alvoNum;
    const fmt = (x) => (x == null ? '—' : r.un === '%' ? pct(x) : x.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
    return { ...r, valor: v, ok, texto: fmt(v), alvoTexto: `${r.op === '>=' ? '≥' : '≤'} ${r.un === '%' ? `${r.alvo.toLocaleString('pt-BR')}%` : r.alvo.toLocaleString('pt-BR')}` };
  });
  const avaliadas = regras.filter((r) => r.ok != null), abaixo = avaliadas.filter((r) => !r.ok).length;
  const status = !regras.length ? 'sem_meta' : !avaliadas.length ? 'sem_dados' : abaixo ? 'abaixo' : 'ok';
  return { regras, abaixo, status, entregues: d.entregues, ocorrencias: d.ocorrencias };
}
export const STATUS_SLA = { ok: ['ok', 'Cumprindo'], abaixo: ['bad', 'Abaixo da meta'], sem_dados: ['', 'Sem dados no período'], sem_meta: ['', 'Sem meta definida'] };
