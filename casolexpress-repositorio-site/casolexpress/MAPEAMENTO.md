# Mapeamento do sistema de referência → base para a Casol Express

Origem: sistema de gestão logística em produção (React + Vite, backend Supabase, hospedado no Cloudflare Pages).
Método: leitura da tela e do arquivo público do site, **somente leitura**. Nenhum dado real (nomes, valores, endereços) foi copiado para este documento.

## 1. Arquitetura observada
- SPA React/Vite. Bibliotecas: jsPDF + autotable (PDF), html2canvas, xlsx (importar planilhas).
- Backend: Supabase (Auth, Postgres, Realtime). Selo "Salvo na nuvem" = dados no servidor. Na demo, "salvo neste navegador".
- Tabelas vistas no código: `dados` e `perfis`. Funções RPC: `motorista_meus_dados`, `motorista_baixar`, `uso_banco`, `definir_acesso`, `limpar_copias`.
- Hipótese (não verificada, colunas não vistas): `dados` guarda o estado em documentos JSON; `perfis` guarda o papel de cada usuário.
- Preferências locais: aba atual e tema (claro/escuro). Atributos no HTML: `data-theme`, `data-fx`.
- Dois papéis: **dono** (computador) e **motorista** (celular).

## 2. Módulos (menu lateral)
1. **Painel**: filtros Hoje, 7 dias, Quinzena, Quinzena passada, Este mês, 3 meses; por parceira e por motorista; relatório em PDF.
   Indicadores: pacotes entregues (vs. período anterior), entregas no prazo, ocorrências %, resultado do caixa, custo por pacote, receita por motorista, saldo previsto em 30 dias, "precisa de você" (acertos a aprovar, paradas sem motorista), meta do mês, fôlego de caixa (dias, no ritmo de saída dos últimos 30), evolução de 6 meses, ranking de motoristas, dependência de parceiras, onde está falhando (cidade, bairro, motivo), vencimentos por idade (a pagar e a receber, 6 faixas).
2. **Romaneio**: importa .xlsx/.xls/.csv por empresa e data da rota; remove pacotes repetidos pelo código; junta pelo mesmo endereço (ignora "Rua"/"R.", maiúsculas, acentos, "nº"); uma parada pode ter vários pacotes; se a planilha traz o entregador, já atribui; "Distribuir rotas" por cidade; "Reanalisar com planilha nova"; cadastro de empresa; arquivo de exemplo fictício.
3. **Entregas**: todas as paradas, filtros por status (Pendente, Entregue, Cliente ausente, Recusado, Avaria, Endereço errado, Reagendar), por romaneio e por motorista (inclui "sem motorista"); tela de detalhe da parada.
4. **Motorista** (celular): abas "Minha rota" e "Meu extrato"; progresso de pacotes entregues; paradas pendentes agrupadas por cidade; baixa de entrega com GPS do celular como posição de apoio; histórico "já baixadas" com desfazer; "Ver como" para o dono simular a visão de um motorista.
5. **Comissão**: acerto quinzenal com descontos; total líquido; "falta aprovar"; aprovar lança a saída no caixa (categoria "Comissão de motorista"); fechamento da quinzena e do mês em PDF; lista de acertos por motorista com ficha.
6. **Caixa**: saldo em conta (com saldo inicial), lançamento de entrada/saída, boleto, compra parcelada, valores "previstos"; categorias personalizáveis; previsão de saldo em 30/60/90 dias que já desconta comissões geradas e ainda não pagas; quanto a empresa ganha no mês (receita − motoristas − despesas pagas).
7. **Rastreador**: cadastro de veículos (placa, motorista, ID do rastreador); integração com rastreador externo ainda pendente; enquanto isso usa o GPS do celular.
8. **Ajustes**: motoristas (fixo ou por pacote), valor padrão por pacote, empresas (valor que cada uma paga por pacote e prazo de entrega), categorias do caixa, meta.

## 3. Regras de negócio observadas
- **Motorista fixo**: salário mensal; a quinzena paga metade; no painel aparece como "salário proporcional aos dias".
- **Motorista por pacote**: recebe valor por pacote entregue, com **valor individual por motorista** e valor padrão como fallback.
- **Acerto**: quinzenal (dia 1–15 e 16–fim do mês), com descontos; só vira saída no caixa depois que o dono aprova.
- **Receita**: pacotes entregues × "recebe por pacote" de cada empresa. Sem esse valor, receita e margem não aparecem (o sistema avisa).
- **Taxa de entrega** = entregues ÷ (entregues + com ocorrência). **Ocorrência** = ausente, recusado, avaria, endereço errado, reagendar.
- **Entrega no prazo** depende do prazo configurado por empresa.
- **Fica para a empresa** = receita − motoristas (− despesas pagas, no Caixa).
- **Regra de comissão exata, descontos e prazos**: não observáveis só pela tela. A Casol precisa definir.

## 4. Visual (tokens do original, para referência)
- Fontes: Bricolage Grotesque (títulos) e Geist (texto). Números tabulares.
- Layout: menu lateral em pílula com ícones, cartões grandes escuros e claros, um cartão de destaque na cor da marca, brilho que segue o mouse nos cartões escuros, tema escuro/claro.
- Cores do original: preto #050505, cinzas quentes (#f7f6f3 a #151413), destaque amarelo #ffc21a, sucesso #0f8a46, alerta #a86200, erro #c42f2f.

## 5. Adaptação para a Casol Express
- Logos: `public/logo-dark.png` (circular, vermelha) no tema escuro e `public/logo-light.png` (horizontal, dourada) no tema claro.
- Destaque da marca: **vermelho** no tema escuro e **dourado** no claro (segue as duas logos). Trocar o amarelo do original.
- Não levar: nomes de motoristas, valores, empresas cadastradas, planilhas de exemplo, nome "Primo" e a integração TagPro (deixar o Rastreador genérico).
- Parceiro logístico da Casol: J&T. Empresas/plataformas serão cadastradas pelo dono em Ajustes.

## 6. Proposta de banco para a Casol (Supabase, RLS sempre ligado)
Em vez de um documento único, tabelas separadas: `perfis` (papel dono/motorista), `motoristas`, `empresas`, `romaneios`, `paradas`, `pacotes`, `baixas`, `lancamentos`, `categorias`, `acertos`, `ajustes`.
- Dono: acesso total aos dados da operação dele.
- Motorista: lê e baixa **apenas as próprias paradas**, por funções RPC (como no original), nunca por leitura direta das tabelas.
- Dados de destinatários (nome, endereço) são pessoais: acesso mínimo e RLS testado antes de produção.

## 7. Cuidados
- O código original não foi recuperado: o Cloudflare só guarda o compilado e a cópia do Vercel é uma versão de demonstração. O novo sistema é uma **reconstrução** guiada por este mapa.
- O esquema real do banco do original não foi verificado. A proposta da seção 6 é nova.
- A conta do original não foi alterada em nada.
