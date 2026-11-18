-- =====================================================================
-- Casol Express · Metas de SLA dos motoristas  |  Rode depois do schema.sql (repetível)
-- Meta padrão em ajustes.sla e regra própria em motoristas.sla (jsonb). RLS já cobre as duas tabelas
-- (só o dono lê e altera). Formato: {"modo":"padrao|proprio|nenhuma","taxaEntrega":95,"ocorrencias":3,"noPrazo":90,"pacotesDia":40}
-- Nenhuma meta vem pré-definida: valores em branco (null) não são avaliados.
-- =====================================================================
alter table public.ajustes    add column if not exists sla jsonb not null default '{}'::jsonb;
alter table public.motoristas add column if not exists sla jsonb not null default '{}'::jsonb;
