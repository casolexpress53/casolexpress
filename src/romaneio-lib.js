import { norm } from './lib.js';

/*
  Leitura da lista da plataforma (Excel/CSV). Sem depender do nome exato das colunas:
  primeiro pelo cabeçalho; o endereço, se o cabeçalho não ajudar, é descoberto pelo CONTEÚDO
  (ex.: a J&T põe o endereço numa coluna chamada "Complemento").
*/
const COL = [
  ['entregador', /(entregador|motorista|courier|driver|responsavel pel)/],
  ['codigo', /(codigo|cod\b|rastreio|tracking|awb|barcode|waybill|pedido|pacote)/],
  ['cidade', /(cidade|city|municipio)/],
  ['bairro', /(bairro|district|distrito)/],
  ['endereco', /(endereco|address|logradouro|\brua\b)/],
  ['cliente', /(cliente|destinat|receiver|nome)/],
  ['situacao', /(marca de assinatura|situacao|status)/],
  ['carregadoEm', /(tempo de entrega|horario de (criacao|carregamento)|carregamento)/],
  ['horaEntrega', /(horario da entrega|data da entrega|entregue em|delivered)/],
];
const INICIO_ENDERECO = /^(rua|avenida|rod|rodovia|estrada|estr|travessa|tv|alameda|al|praca|pca|linha|vila|sitio|chacara|loteamento|servidao|beco|largo)\b/;

/* acha a coluna cujos valores parecem endereço (começam com rua/avenida/rodovia…) */
function detectarEndereco(linhas, cab, usadas) {
  let melhor = null, nota = 0;
  for (const c of cab) {
    if (usadas.has(c)) continue;
    const vals = linhas.slice(0, 300).map((l) => norm(l[c])).filter(Boolean);
    if (vals.length < Math.min(5, linhas.length)) continue;
    const pontos = vals.filter((v) => v.length >= 6 && INICIO_ENDERECO.test(v)).length / vals.length;   // siglas como "PR" não são endereço
    if (pontos > nota) { nota = pontos; melhor = c; }
  }
  return nota >= 0.4 ? melhor : null;
}

export function mapear(linhas) {
  const cab = Object.keys(linhas[0] || {}), usadas = new Set(), m = {};
  for (const [k, rx] of COL) { const c = cab.find((x) => !usadas.has(x) && rx.test(norm(x))); if (c) { m[k] = c; usadas.add(c); } }
  if (!m.endereco) { const c = detectarEndereco(linhas, cab, usadas); if (c) { m.endereco = c; m.enderecoPorConteudo = true; } }
  return m;
}

/* "F CARLOS MIGUEL DOS SANTOS" -> "Carlos Miguel dos Santos" (tira o prefixo de uma letra que a plataforma põe) */
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
export function limparNome(s) {
  const t = String(s ?? '').trim().replace(/^[A-Za-z]\s+(?=\S{2,})/, '').replace(/\s+/g, ' ');
  return t.toLowerCase().split(' ').map((p, i) => (i && PARTICULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}
export const chaveNome = (s) => norm(limparNome(s));

/* "FRANCISCO BELTRAO" e "Francisco Beltrão" viram a mesma cidade (fica a forma melhor escrita) */
function cidadesCanonicas(linhas, col) {
  const por = new Map();
  for (const l of linhas) {
    const v = String(l[col] ?? '').trim(); if (!v) continue;
    const k = norm(v), e = por.get(k) || new Map();
    e.set(v, (e.get(v) || 0) + 1); por.set(k, e);
  }
  const nota = (v, n) => (/[a-z]/.test(v) ? 1000 : 0) + (/[^\x00-\x7f]/.test(v) ? 500 : 0) + n;
  const out = new Map();
  for (const [k, vars] of por) out.set(k, [...vars].sort((a, b) => nota(b[0], b[1]) - nota(a[0], a[1]))[0][0]);
  return out;
}

const foiEntregue = (v) => { const t = norm(v); return !!t && !/^nao\b|nao entreg|pendente|aguard/.test(t) && /(entregue|recebimento|assinatura|delivered)/.test(t); };

/* "2026-11-19 11:23:30" (horário de Brasília) -> instante ISO; aceita também número de série do Excel */
function instante(v, dataRota) {
  if (typeof v === 'number' && v > 30000) return new Date(Math.round((v - 25569) * 864e5)).toISOString();
  const m = String(v ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/);
  if (m) return new Date(`${m[1]}T${m[2]}:${m[3] || '00'}-03:00`).toISOString();
  return dataRota ? new Date(`${dataRota}T12:00:00-03:00`).toISOString() : null;
}

export function analisar(linhas, S, empresaId, data) {
  const m = mapear(linhas);
  if (!m.codigo || !m.endereco) {
    const cab = Object.keys(linhas[0] || {}).slice(0, 12).join(', ');
    return { erro: `Não achei as colunas de ${!m.codigo ? 'código' : 'endereço'}. A planilha precisa ter uma coluna com o código do pacote e outra com o endereço. Colunas que encontrei: ${cab}${Object.keys(linhas[0] || {}).length > 12 ? '…' : ''}.` };
  }
  // pacotes que já estão no sistema (mesma empresa, de qualquer dia: um pacote de ontem que segue pendente não duplica):
  // em vez de ignorar, atualizam a parada (entrega, motorista)
  const existentes = new Map();
  const romPor = new Map(S.romaneios.map((x) => [x.id, x]));
  for (const p of S.paradas) {
    const r = romPor.get(p.romaneioId);
    if (r && r.empresaId === empresaId) for (const c of p.pacotes) existentes.set(c, p);
  }
  const cidades = m.cidade ? cidadesCanonicas(linhas, m.cidade) : new Map();
  const porNome = new Map(S.motoristas.map((x) => [chaveNome(x.nome), x]));
  const vistos = new Set(), vistosEx = new Set(), grupos = new Map(), faltam = new Map();
  const entNovas = new Map(), atribuir = new Map();   // paradaId -> [{cod, baixaEm}] / motoristaId
  let repetidos = 0, entreguesPlat = 0, jaExistiam = 0;
  for (const l of linhas) {
    const cod = String(l[m.codigo] ?? '').trim(), end = String(l[m.endereco] ?? '').trim();
    if (!cod || !end) continue;
    const nomeEnt = m.entregador ? String(l[m.entregador] ?? '').trim() : '';
    const mo = nomeEnt ? porNome.get(chaveNome(nomeEnt)) : null;
    if (nomeEnt && !mo) faltam.set(chaveNome(nomeEnt), limparNome(nomeEnt));
    const entregue = m.situacao ? foiEntregue(l[m.situacao]) : false;
    const ex = existentes.get(cod);
    if (ex) {
      if (vistosEx.has(cod)) { repetidos++; continue; }
      vistosEx.add(cod); jaExistiam++;
      if (!ex.motoristaId && mo) atribuir.set(ex.id, mo.id);
      if (entregue && ex.status === 'pendente') { const a = entNovas.get(ex.id) || []; a.push({ cod, baixaEm: instante(m.horaEntrega ? l[m.horaEntrega] : '', data) }); entNovas.set(ex.id, a); }
      continue;
    }
    if (vistos.has(cod)) { repetidos++; continue; }
    vistos.add(cod);
    const bruta = String(m.cidade ? l[m.cidade] : '').trim(), cidade = cidades.get(norm(bruta)) || bruta;
    // mesmo endereço só junta se for o mesmo entregador e a mesma situação (entregues e pendentes ficam em paradas separadas)
    const key = `${norm(end)}|${norm(cidade)}|${entregue ? 'e' : 'p'}|${nomeEnt ? chaveNome(nomeEnt) : ''}`;
    let g = grupos.get(key);
    if (!g) {
      const bairro = m.bairro ? String(l[m.bairro]).trim() : '';
      g = { endereco: end, bairro: /^[.\-\s]*$/.test(bairro) ? '' : bairro, cidade, cliente: m.cliente ? String(l[m.cliente]).trim() : '', pacotes: [], motoristaId: null, gps: null };
      if (entregue) { g.status = 'entregue'; g.baixaEm = instante(m.horaEntrega ? l[m.horaEntrega] : '', data); }
      if (m.carregadoEm) { const c = instante(l[m.carregadoEm], ''); if (c) g.carregadoEm = c; }
      if (mo) g.motoristaId = mo.id;
      grupos.set(key, g);
    }
    g.pacotes.push(cod);
    if (entregue) entreguesPlat++;
  }
  // operações sobre paradas que já existiam
  const atualizacoes = []; let entregasAtualizadas = 0;
  for (const [id, mid] of atribuir) atualizacoes.push({ tipo: 'motorista', paradaId: id, motoristaId: mid });
  for (const [id, lista] of entNovas) {
    const p = S.paradas.find((x) => x.id === id), baixaEm = lista.map((x) => x.baixaEm).sort().pop();
    atualizacoes.push(lista.length >= p.pacotes.length ? { tipo: 'status', paradaId: id, baixaEm } : { tipo: 'dividir', paradaId: id, codigos: lista.map((x) => x.cod), baixaEm });
    entregasAtualizadas += lista.length;
  }
  const paradas = [...grupos.values()];
  return {
    paradas, pacotes: vistos.size, repetidos, jaExistiam, atualizacoes, entregasAtualizadas, motoristasAtribuidos: atribuir.size, entreguesPlat, atribuidas: paradas.filter((p) => p.motoristaId).length,
    semCad: [...faltam.values()], colunas: m,
  };
}
