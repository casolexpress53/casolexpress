/* O que o dono pode liberar para quem opera o sistema (não inclui caixa, comissão, ajustes nem painel financeiro). */
export const ABAS_EQUIPE = [
  ['romaneio', 'Romaneio', 'Importar a lista da plataforma e distribuir as paradas'],
  ['entregas', 'Entregas', 'Ver as paradas e o que já foi baixado'],
  ['motorista', 'Motorista', 'Ver como o motorista vê e dar baixa'],
  ['sla', 'SLA', 'Acompanhar o reporte hora a hora dos motoristas'],
];
export const ids_ABAS = ABAS_EQUIPE.map((a) => a[0]);
