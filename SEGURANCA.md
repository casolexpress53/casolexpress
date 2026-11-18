# Segurança e backup · Casol Express

Revisão feita em 18/11/2026. Marcado **[feito]** o que já está no código; **[você]** o que depende de um painel (Supabase, Cloudflare, Google) ou de uma decisão.

## 1. Código
- **[feito]** Nenhum segredo no código nem no histórico do Git. `.env` ignorado. Só a chave *publicável* vai ao navegador.
- **[feito]** Sem pontos de XSS (`dangerouslySetInnerHTML`, `eval`, `innerHTML`: nenhum).
- **[feito]** jsPDF atualizado para 4.2.x (havia vulnerabilidade crítica). `npm audit` agora só aponta o `xlsx`.
- **[você]** `xlsx` 0.18.5 tem 2 falhas altas (poluição de protótipo e ReDoS) ao **ler** planilhas, e o npm não tem versão corrigida. Corrigir no seu computador:
  `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` e testar o Romaneio. Até lá, só importe planilhas de origem conhecida (a plataforma parceira).
- **[feito]** Trava de produção: sem `VITE_SUPABASE_*`, o build de produção **não abre** (antes entregava a tela de demonstração sem senha). Para publicar uma demonstração de propósito: `VITE_PERMITIR_DEMO=sim`.

## 2. Hospedagem (Cloudflare)
- **[feito]** `public/_headers`: CSP estrita (só o próprio domínio + Supabase + fontes Google), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS, `Permissions-Policy` (geolocalização só no próprio site, câmera/microfone bloqueados). Testado com um servidor que aplica os mesmos cabeçalhos: 3D, login, PDF e rotas funcionam, sem violação de CSP.
- **[feito]** `public/_redirects`: rotas do app caem no `index.html`.
- **[você]** No projeto do Cloudflare, em variáveis de ambiente de **build**: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Comando `npm run build`, pasta `dist`. Se as variáveis faltarem, o sistema mostra "Sistema não configurado" (por segurança).
- **[você]** Em produção use domínio próprio com HTTPS (o Cloudflare já força). Se trocar de domínio, ajuste o *Site URL* no Supabase.
- Fontes vêm do Google Fonts (permitido na CSP). Se quiser zero terceiros, dá para hospedar as fontes no próprio projeto.

## 3. Supabase (projeto da Casol)
Estado em 18/11/2026 (projeto `peyesvlhklyqngwzggem`, São Paulo): **banco aplicado** (`schema`, `ponto`, `sla` e `endurecimento`), 12 tabelas, **RLS ligado em todas**.
- Testado no banco real (transação desfeita): anônimo não acessa nada; logado sem perfil vê 0 linhas e não grava; dono lê e grava; ninguém apaga perfis pela API.
- Avisos do Supabase: sobram só os 10 "função SECURITY DEFINER executável por logado", que são as RPCs de propósito (cada uma confere a permissão por dentro). O gatilho `novo_usuario` foi fechado.
- Neste projeto as tabelas **não vêm liberadas para a API**: foi preciso conceder SELECT/INSERT/UPDATE/DELETE ao `authenticated` (o RLS decide quem é dono). Tabela nova precisa dos mesmos GRANTs (ver `endurecimento.sql`).
- Ordem do SQL: `schema.sql` → `ponto.sql` → `sla.sql` → `endurecimento.sql` → `sincronizacao.sql` → `concorrencia.sql`. O colaborador e o motorista só acessam o que é deles por funções. Testado em Postgres real (ver `supabase/`).
- **[você]** Authentication → desativar **Allow new users to sign up** (a chave publicável é pública: sem isso qualquer pessoa cria conta).
- **[você]** Authentication → Password: tamanho mínimo **10+**; ativar proteção contra senhas vazadas (plano Pro); ativar **MFA (TOTP)** para o dono.
- **[você]** Nunca usar a `service_role` no front. Ela só entra em tarefas do servidor (backup), como segredo.
- Depois de aplicar o SQL, rodar os avisos de segurança do Supabase de novo e conferir que não há tabela sem RLS.
- **Dado pessoal (LGPD):** nome e endereço de destinatários, localização de colaboradores. Acesso mínimo, sem logs de localização contínua (o ponto lê a posição só na batida).
- **Dados no navegador:** em modo servidor nada da operação vai para `localStorage` (a memória é limpa no logout). Dados de demonstração antigos que existirem no navegador não são usados nem enviados.
- **Travas:** *Apagar tudo* e *Carregar dados fictícios* ficam bloqueados com dados reais.
- **Criação de contas:** a função `criar-acesso` (Edge Function) só aceita chamadas de quem é dono (`eh_dono()`); cria o usuário já confirmado, define o papel e liga ao cadastro. Senha mínima de 10 caracteres exigida na função. A `service_role` fica só dentro do Supabase.
- **Horário do ponto:** sempre no horário de Brasília (não depende do fuso do aparelho).
- **Edição simultânea:** travada por versão em cada linha (`concorrencia.sql`): a segunda pessoa é barrada e avisada, nada é sobrescrito. Excluir uma linha não confere versão. Atualização por consulta a cada 30 s, não em tempo real.

## 4. Backup
Camadas, da mais para a menos importante:
1. **Backup nativo do Supabase** **[você]**: confirme o plano no painel. Backups diários restauráveis dependem do plano pago (Pro); no gratuito não há, e o projeto pausa após uma semana sem uso. Para uma operação de entregas, use plano pago. PITR (restauração por minuto) é opcional.
2. **Cópia independente no Drive da Casol** (proposta, ainda **não implementada**): tarefa diária no Cloudflare (Cron Trigger) que exporta as tabelas e envia um arquivo datado, **criptografado**, para uma pasta do Drive da Casol, mantendo 30 dias. A chave `service_role` e o acesso ao Drive ficam como segredos da tarefa, nunca no front. Depende de: (a) acesso à conta Google da **Casol** (o conector desta sessão enxerga o Drive da Astrovia, não o da Casol); (b) o schema aplicado.
3. **Código**: no GitHub (`astroviasolutions/CassolExpress`). O modelo 3D original fica em `assets-src/` (fora do Git) e no zip enviado ao Drive.
4. **Teste de restauração**: um backup que nunca foi restaurado não vale. Fazer 1 restauração de teste antes de operar com dado real.
