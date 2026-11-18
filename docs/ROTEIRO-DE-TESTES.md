# Casol Express · Roteiro de testes

**Endereço do sistema:** https://casolexpress.casolexpress53.workers.dev
**Login do gestor:** casolexpress53@gmail.com (a senha é a que você definiu)

> O sistema está **vazio**, sem nenhum dado de exemplo. Tudo o que for cadastrado aqui é gravado de verdade. Os números abaixo são **exemplos de teste**: use as metas e os valores que foram realmente combinados.
> Use um celular para o motorista e para o colaborador (o ponto usa a localização do aparelho; precisa estar com a localização ligada e permitida no navegador).

---

## Parte 0 · Preparação (5 minutos, no computador do gestor)

1. Entre com o e-mail e a senha do gestor.
2. **Ajustes → Empresas:** cadastre uma empresa parceira (nome, quanto ela paga por pacote, prazo em dias).
3. **Ajustes → Motoristas:** cadastre um motorista de teste (nome, tipo e valor por pacote).
4. No cadastro desse motorista, em **Acesso**, preencha o **e-mail** dele, clique **Gerar senha** e **Criar acesso**.
   - Aparece uma caixa com o e-mail e a senha. **Anote**: a senha não aparece de novo (dá para clicar em *Redefinir senha* depois).
   - Não precisa de e-mail de confirmação nem de liberar nada no Supabase.
5. **Ponto → Equipe e locais → Novo colaborador:** cadastre um colaborador de teste (veja a Parte B).

---

## Parte A · SLA do motorista (metas)

**A1. Definir as metas.** Ajustes → *Metas de SLA dos motoristas*. Exemplo de teste: taxa de entrega mínima **95**, ocorrências máximas **3**, entregas no prazo mínimo **90**. Deixe em branco o que não for avaliar.

**A2. Colocar entregas no sistema.** Romaneio → traga a planilha da plataforma (ou use *Usar arquivo de exemplo*, que é fictício) → *Importar romaneio*.

**A3. Distribuir ao motorista.** Entregas → toque numa parada → escolha o motorista de teste. Faça isso com 6 paradas.

**A4. Motorista no celular.** Abra o endereço do sistema no celular e entre com o e-mail e a senha criados na Parte 0.
- Ele vê só as paradas dele, em *Minha rota*.
- Dê baixa em **5 paradas como "Entregue"** e em **1 como "Ocorrência → Cliente ausente"**.

**A5. Ver as metas no celular do motorista.** Aba **Metas**.
- *Esperado* (se cada parada tem 1 pacote): taxa de entrega **83,3%** (5 de 6), ocorrências **16,7%**, e a indicação de que está **abaixo** da meta de 95%.
- Conta: pacotes entregues ÷ (entregues + com ocorrência).

**A6. Ver pelo gestor.** No computador: menu **SLA**.
- *Esperado:* o motorista aparece como **Abaixo da meta**, com cada número ao lado da meta. As baixas do motorista chegam ao gestor em **até 30 segundos**.
- Troque o período (Hoje, 7 dias, Quinzena, Este mês) e veja os números mudarem.

**A7. Regra própria.** Ajustes → *Regra de cada motorista* → escolha **Regra própria** para o motorista de teste e coloque outra meta (por exemplo taxa mínima 80). Volte ao menu SLA: ele deve passar a **Cumprindo**. Teste também **Sem meta** (ele deixa de ser avaliado).

**Anote:** os números batem com a conta que você faria na mão? As metas estão como combinado?

---

## Parte B · Ponto (colaborador)

**B1. Cadastrar o colaborador.** Ponto → *Equipe e locais* → *Novo colaborador*.
- Nome, função (Operacional, Ajudante…) e carga diária em horas (opcional).
- **Local do ponto:** estando **no local de trabalho**, com o celular, clique **Usar minha localização atual**. (Ou cole as coordenadas do Google Maps.) Raio padrão: **100 metros**.
- Se a pessoa **não bate ponto**, desmarque **Bate ponto**: ela não aparece na folha e não consegue bater.

**B2. Criar o acesso.** Reabra o colaborador (*Editar*) → em **Acesso**, e-mail → **Gerar senha** → **Criar acesso**. Anote e envie ao colaborador.

**B3. Colaborador no celular.** Entre com o e-mail e a senha. Quando o navegador pedir, **permita a localização**.

**B4. Bater ponto dentro do local.** Aba *Hoje* → botão **Entrada**.
- *Esperado:* "Entrada registrada (a X m do local)".

**B5. Teste fora do local.** Afaste-se mais de 100 m e tente bater de novo.
- *Esperado:* "Você está a X m do local de trabalho. Chegue mais perto…" e **não registra**.

**B6. Sequência do dia.** Entrada → Saída para o intervalo → Volta do intervalo → Saída. Quem não faz intervalo vai direto de Entrada para Saída.
- Existe uma **trava de 1 minuto** entre duas batidas (evita toque duplo): se bater de novo na hora, o sistema pede para aguardar.
- Depois da Saída, o dia fecha.

**B7. Pedir ajuste.** No celular, aba **Ajustes**: dia, qual batida, horário certo e o motivo → *Enviar pedido*.

**B8. Gestor aprova.** Ponto → **Pedidos de ajuste** → *Aprovar* (ou *Recusar*, com uma resposta opcional). O colaborador vê o resultado na aba Ajustes.

**B9. Folha do mês.** Ponto → **Folha do mês** → escolha o colaborador e o mês.
- Veja os horários de cada dia, o total de horas e os dias com pendência.
- Botões **PDF** e **Planilha** para baixar.
- *Editar* num dia permite o gestor ajustar um horário direto (fica marcado como "ajustado").

**B10. Visão do dia.** Ponto → **Hoje**: quem está trabalhando, em intervalo ou ainda não bateu.

**B11. Esqueceu a senha.** No cadastro (Ajustes ou Ponto → Editar) → *Redefinir senha* → anote a nova e envie.

**Anote:** o horário está certo (horário de Brasília)? A distância informada faz sentido? O GPS dentro do galpão precisou de um raio maior?

---

## Parte C · Duas pessoas ao mesmo tempo

1. Abra o sistema em **dois navegadores** (ou dois computadores) com o login do gestor.
2. Nos dois, abra o cadastro do mesmo motorista. Em um, mude o nome. No outro, sem recarregar, mude o valor.
3. *Esperado:* o segundo recebe o aviso **"Outra pessoa alterou esta informação ao mesmo tempo. A sua alteração NÃO foi salva…"**, a tela se atualiza e nada é sobrescrito.
4. Quem está só olhando recebe um aviso em até 30 segundos quando outra pessoa muda algo.

---

## O que ainda não está pronto (já sabemos)
- O motorista no celular vê **Minha rota** e **Metas**. O *extrato* dele ainda é só na visão do gestor.
- As baixas do motorista chegam ao gestor em até 30 segundos (não é na hora).
- O GPS dentro de galpão pode errar mais: se precisar, aumente o raio do colaborador.
- O ponto é um controle interno por localização, **não** um registrador homologado. Vale confirmar com o contador se é exigido. Regras de feriado, hora extra e banco de horas **não** estão incluídas.
- O backup automático para o Drive ainda não existe.

## Se algo der errado
Mande uma **captura de tela** e diga: o que você estava fazendo, qual aparelho (computador ou celular) e a hora aproximada.
