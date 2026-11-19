/* O que o dono pode liberar para quem trabalha no sistema. Fica de fora só o cadastro de funcionários
   (criar acessos e dar permissões), que é sempre do dono. As regras valem também no banco (RLS), não só na tela. */
export const ABAS_EQUIPE = [
  ['painel', 'Painel', 'Resultados, metas e avisos da operação (inclui valores e caixa)'],
  ['romaneio', 'Romaneio', 'Importar a lista da plataforma e distribuir as paradas'],
  ['entregas', 'Entregas', 'Ver as paradas e o que já foi baixado'],
  ['motorista', 'Motorista', 'Ver como o motorista vê e dar baixa'],
  ['sla', 'SLA', 'Reporte hora a hora e metas dos motoristas'],
  ['notas', 'Notas fiscais', 'Abrir e baixar as notas enviadas pelos motoristas'],
  ['comissao', 'Comissão', 'Acerto quinzenal: ver, descontar, aprovar e lançar no caixa'],
  ['caixa', 'Caixa', 'Entradas, saídas e previsão'],
  ['ponto', 'Ponto', 'Gestão do ponto da equipe: folhas, pedidos de ajuste e correções'],
  ['rastreador', 'Rastreador', 'Veículos e integração com rastreamento'],
  ['ajustes', 'Ajustes', 'Motoristas, valores, prazos, metas e regras (sem o cadastro de acessos)'],
];
export const ids_ABAS = ABAS_EQUIPE.map((a) => a[0]);
