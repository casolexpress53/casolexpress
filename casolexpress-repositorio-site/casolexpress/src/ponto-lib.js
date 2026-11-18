import { iso, pad, parse } from './lib.js';

/* Regras e contas do controle de ponto (puras, sem tela e sem rede). */
export const TIPOS = ['entrada', 'saida_intervalo', 'volta_intervalo', 'saida'];
export const ROTULO = { entrada: 'Entrada', saida_intervalo: 'Saída para o intervalo', volta_intervalo: 'Volta do intervalo', saida: 'Saída' };
export const CURTO = { entrada: 'Entrada', saida_intervalo: 'Saída int.', volta_intervalo: 'Volta int.', saida: 'Saída' };
export const RAIO_PADRAO = 100;     // metros
export const PRECISAO_MAX = 150;    // metros: GPS pior que isso não vale como prova de local
export const INTERVALO_MIN_S = 60;  // trava de toque duplo
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function distMetros(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const dataDe = (em) => iso(new Date(em));
export const hhmm = (em) => { const d = new Date(em); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fmtMin = (m) => `${Math.floor(Math.abs(m) / 60)}h${pad(Math.abs(m) % 60)}`;
export const fmtSaldo = (m) => `${m < 0 ? '−' : '+'}${fmtMin(m)}`;

/* Quais batidas fazem sentido agora, dado o que já foi batido no dia. */
export function proximos(dia) {
  const tem = (t) => dia.some((b) => b.tipo === t);
  if (tem('saida')) return [];
  if (!tem('entrada')) return ['entrada'];
  if (tem('saida_intervalo') && !tem('volta_intervalo')) return ['volta_intervalo'];
  if (!tem('saida_intervalo')) return ['saida_intervalo', 'saida'];
  return ['saida'];
}

/* Horas do dia. Só conta quando o dia está fechado; ordem trocada vira alerta, não número. */
export function resumoDia(dia, ehHoje = false) {
  const t = {}; for (const b of dia) t[b.tipo] = new Date(b.em).getTime();
  if (t.entrada == null) return { t, min: 0, estado: dia.length ? 'incompleto' : 'vazio' };
  const seq = TIPOS.map((k) => t[k]).filter((x) => x != null);
  if (seq.some((x, i) => i && x < seq[i - 1])) return { t, min: 0, estado: 'ordem' };
  if (t.saida == null) return { t, min: 0, estado: ehHoje ? 'aberto' : 'incompleto' };
  if ((t.saida_intervalo == null) !== (t.volta_intervalo == null)) return { t, min: 0, estado: 'incompleto' };
  const ms = t.saida_intervalo != null ? t.saida_intervalo - t.entrada + (t.saida - t.volta_intervalo) : t.saida - t.entrada;
  return { t, min: Math.round(ms / 60000), estado: 'fechado' };
}

/* Folha do mês: uma linha por dia do calendário, para a falta de registro aparecer. */
export function folhaMes(batidas, mes, cargaMin, hojeISO) {
  const d0 = parse(mes), ult = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
  const porDia = {};
  for (const b of batidas) (porDia[dataDe(b.em)] ||= []).push(b);
  const dias = [];
  for (let n = 1; n <= ult; n++) {
    const data = `${mes.slice(0, 8)}${pad(n)}`;
    const lista = porDia[data] || [];
    const r = resumoDia(lista, data === hojeISO);
    dias.push({ data, n, sem: SEM[parse(data).getDay()], lista, ...r, futuro: data > hojeISO });
  }
  const fechados = dias.filter((d) => d.estado === 'fechado');
  const total = fechados.reduce((s, d) => s + d.min, 0);
  const previsto = cargaMin ? cargaMin * fechados.length : null;
  return {
    dias, total, diasTrab: fechados.length,
    pendencias: dias.filter((d) => d.estado === 'incompleto' || d.estado === 'ordem').length,
    previsto, saldo: previsto == null ? null : total - previsto,
  };
}

/* "-25.4284, -49.2733" (copiado do Google Maps) → {lat,lng} */
export function lerCoordenadas(txt) {
  const m = String(txt || '').replace(/;/g, ',').match(/(-?\d{1,3}(?:[.,]\d+)?)\s*[, ]\s*(-?\d{1,3}(?:[.,]\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1].replace(',', '.')), lng = Number(m[2].replace(',', '.'));
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

const MSG = {
  conflito_edicao: 'Outra pessoa alterou isto ao mesmo tempo. Nada foi sobrescrito. Feche, abra de novo para ver a versão mais recente e refaça a alteração.',
  pedido_nao_encontrado: 'Este pedido já foi decidido por outra pessoa.',
  sem_ponto: 'O seu cadastro não usa registro de ponto.',
  sem_local: 'O local de trabalho ainda não foi cadastrado. Fale com o administrador.',
  gps_fraco: 'O sinal de GPS está fraco. Vá para um lugar aberto, espere uns segundos e tente de novo.',
  sequencia_invalida: 'Essa batida não é a próxima do dia. Atualize a tela.',
  muito_rapido: 'Você acabou de bater o ponto. Aguarde um minuto.',
  colaborador_nao_vinculado: 'Seu acesso ainda não está ligado a um colaborador. Fale com o administrador.',
  motivo_obrigatorio: 'Explique o motivo do ajuste.',
  data_invalida: 'Escolha uma data entre os últimos 60 dias e hoje.',
  pedido_ja_pendente: 'Já existe um pedido pendente para essa batida nesse dia.',
  usuario_nao_encontrado: 'Não achei esse e-mail em Authentication > Users do Supabase. Crie o usuário lá primeiro.',
  usuario_e_dono: 'Esse e-mail é do administrador e não pode virar colaborador.',
  sem_permissao: 'Você não tem permissão para isso.',
};
export function mensagemErro(e) {
  const t = String(e?.message || e || '');
  const f = t.match(/fora_do_local:(\d+)/);
  if (f) return `Você está a ${Number(f[1]).toLocaleString('pt-BR')} m do local de trabalho. Chegue mais perto para bater o ponto.`;
  const k = Object.keys(MSG).find((c) => t.includes(c));
  return k ? MSG[k] : t || 'Não foi possível concluir. Tente de novo.';
}
