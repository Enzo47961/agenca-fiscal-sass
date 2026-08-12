# Visão Executiva de Arquitetura e Operações

> Documento para o fundador. Traduz a arquitetura em linguagem de negócio, sem código.
> Escrito em 12/08/2026, a partir da leitura completa do sistema.
> Onde algo **ainda não existe**, está dito com todas as letras — um documento executivo
> que esconde lacunas é pior que documento nenhum, porque leva a promessas que a
> engenharia não sustenta.

---

## 1. Visão geral do funcionamento

O sistema resolve um problema específico: **emitir nota fiscal de serviço sem que ela se
perca quando a prefeitura falha**, e sem que o cliente precise entender a Reforma
Tributária.

São quatro peças, e a separação entre elas é o que sustenta a promessa:

**A aplicação web** é onde o usuário trabalha — cadastra clientes, preenche uma nota,
acompanha o painel. Ela é rápida porque **não espera a prefeitura**: registra a intenção e
devolve o controle.

**O motor de emissão** é um serviço separado que trabalha em segundo plano. Ele pega as
notas registradas e conversa com a prefeitura. Se falhar por instabilidade, ele mesmo
reagenda: 5 minutos, 15 minutos, 1 hora. Se falhar por erro de dado — CNPJ inválido,
código inexistente — ele para na hora, porque insistir não conserta dado errado.

**O provedor fiscal** é a empresa que fala a língua de cada prefeitura do país. Nós
falamos com um só interlocutor em vez de com 5.500 municípios.

**O banco de dados** guarda tudo e, mais importante, **impõe as regras**. Não é um depósito
passivo: ele recusa combinações fiscais inválidas mesmo que a aplicação tenha um bug.

### A decisão de arquitetura que define o produto

Emitir nota é lento e instável por natureza. A maioria dos concorrentes trata isso como
problema do usuário: tentou, falhou, mostre o erro e que ele tente de novo.

Aqui a emissão é **assíncrona por princípio**. A tela nunca espera. Isso não é detalhe
técnico — é o produto. É o que permite dizer "a prefeitura cai, a nota não se perde" e
sustentar a frase.

---

## 2. Fluxo de dados

O caminho de uma nota, do clique à entrega:

**1. O usuário preenche.** Ao digitar o código do serviço, o sistema consulta a
classificação tributária oficial daquele item e mostra apenas as opções que a tabela
nacional permite — em geral uma ou duas, nunca uma lista de 164 códigos.

**2. A fronteira valida.** Antes de qualquer coisa ser gravada, os dados passam por uma
camada de validação: formato, coerência fiscal, base de cálculo. Um erro aqui volta para a
tela **enquanto o usuário ainda está nela**, e nenhuma nota chega a existir.

**3. A nota é criada como "pendente"** e o usuário é liberado. Nesse mesmo instante o
sistema publica um evento — um recado para o motor — e responde à tela.

**4. O motor assume.** Ele carrega a nota, muda o status para "reprocessando", monta o
documento fiscal e chama o provedor. Cada tentativa é registrada com a resposta bruta da
prefeitura, inclusive as que falham.

**5. Desfecho.** Autorizada, a nota recebe número, código de verificação e links de PDF e
XML, e o cliente final recebe um e-mail. Esgotadas as tentativas, ela vai para "falhou" e
o usuário pode reprocessar manualmente.

### Por que o status não é um campo comum

A mudança de status **não pode ser feita por atualização direta no banco**. Ela passa
obrigatoriamente por uma função que valida a transição: de "pendente" só se vai para
"reprocessando"; de "reprocessando" para "emitida", "falhou" ou "reprocessando" de novo.

Isso impede o estado impossível — uma nota "emitida" que volta para "pendente" e é emitida
duas vezes na prefeitura. E a permissão de escrita direta na tabela foi **deliberadamente
não concedida** ao usuário logado, para que não haja atalho.

---

## 3. Infraestrutura e deploy

### Onde roda

| Camada | Serviço | Papel |
|---|---|---|
| Aplicação web | Vercel | Hospedagem da interface e das ações de servidor |
| Banco + autenticação + arquivos | Supabase | Postgres gerenciado |
| Motor de emissão | Inngest | Execução em segundo plano, com retentativas |
| E-mail | Resend | Entrega da nota ao cliente final |
| Emissão fiscal | Focus NFe | Conversa com as prefeituras |
| Cobrança | Asaas | Boletos e cartões das assinaturas |

Nenhum servidor é administrado por nós. Não há máquina para atualizar, nem sistema
operacional para corrigir. Isso reduz custo fixo e, principalmente, **reduz o que pode dar
errado sem ninguém perceber**.

### Como uma novidade entra no ar

Toda alteração passa por uma verificação automática antes de poder ser publicada:
checagem de tipos, análise estática, a suíte de testes e a compilação de produção. **Se
qualquer um falhar, a alteração não entra.**

A publicação em si é automática: o código aprovado vira uma nova versão do site em
minutos, sem interrupção para quem está usando.

### Mudanças no banco

Alterações de estrutura são **versionadas e imutáveis**: cada uma é um arquivo numerado
que descreve exatamente o que muda. Nunca se edita uma antiga — cria-se outra. Isso
garante que qualquer ambiente pode ser reconstruído do zero, na ordem certa, com resultado
idêntico.

> **Lacuna conhecida.** Não existe ambiente de homologação separado do de produção. Hoje
> não há impacto — o produto ainda não tem clientes reais — mas isso precisa existir antes
> do primeiro cliente pagante.

---

## 4. Banco de dados

### Como os dados estão organizados

O centro é a **empresa** — cada CNPJ atendido. Tudo pendura nela: clientes, notas,
tentativas de emissão, assinatura, faturas. Um usuário se liga a empresas por um vínculo
que carrega um papel (dono, administrador, operador), e é isso que permite ao escritório de
contabilidade gerenciar dezenas de CNPJs com um login só.

Ao lado, tabelas de **domínio nacional**: as classificações tributárias oficiais, os
códigos de situação tributária e a correlação entre item de serviço e classificação. São
dados públicos, iguais para todos, sincronizados a partir da fonte oficial e **versionados
com data e verificação de integridade** — dá para provar de qual publicação veio cada
número.

### Garantias de integridade

O banco não confia na aplicação. Ele impõe:

- **Dinheiro é inteiro em centavos.** Nunca decimal quebrado, nunca arredondamento
  surpresa.
- **Regras fiscais como restrições.** Base de cálculo não pode ser negativa. PIS/COFINS não
  pode ser deduzido a partir de 2027, quando os tributos deixam de existir. Classificação
  tributária tem que ser coerente com o código de situação.
- **Ajuste de base exige documento.** Não dá para declarar um desconto na base sem
  referenciar os documentos que o justificam — os dois existem juntos ou não existem.
- **Confirmação de enquadramento é obrigatória.** Nota com regime tributário diferenciado
  só é aceita se alguém confirmou explicitamente, e fica registrado quem e quando.

Cada uma dessas regras existe também na aplicação. A duplicação é intencional: **a
aplicação erra, o banco não deixa passar.**

---

## 5. Segurança e autenticação

### Login

Autenticação por e-mail e senha, gerenciada pelo Supabase — não armazenamos senha, nem
temos como ver a de ninguém. A sessão é renovada automaticamente a cada navegação; sem
isso o usuário seria desconectado sozinho depois de uma hora.

### Isolamento entre empresas

Esta é a garantia mais importante do produto, e ela é aplicada em **três camadas
independentes**:

**No banco.** Cada tabela tem uma política que filtra as linhas pelo vínculo do usuário. Um
usuário não consegue ler dados de uma empresa que não é dele nem que a aplicação peça —
o banco simplesmente não devolve.

**Nos privilégios.** Ler e escrever são permissões separadas e concedidas tabela a tabela.
O usuário logado pode criar nota, mas **não pode alterar nota** — porque alterar nota
significaria contornar a máquina de estados.

**Na aplicação.** A empresa ativa nunca vem do navegador sem conferência. O usuário pode
sugerir qual empresa quer ver, mas o sistema só aceita se ela estiver de fato na carteira
dele. Isso é testado explicitamente, com casos hostis.

### Dados sensíveis

**Certificado digital A1:** não é armazenado por nós. Ele é repassado ao provedor fiscal,
que já precisa dele para assinar as notas, e nenhuma cópia fica aqui. Guardamos apenas a
data de validade, para avisar antes do vencimento.

Essa foi uma decisão consciente, tomada quando o produto passou a atender escritórios de
contabilidade: passaríamos a guardar certificados de **terceiros**, e o certificado assina
documentos com valor legal. O risco não é técnico, é jurídico — e a melhor mitigação foi
deixar de criar um segundo lugar de onde ele pode vazar.

**Segredos e chaves:** ficam em variáveis de ambiente validadas na inicialização, nunca no
código. O endpoint que executa o motor exige assinatura criptográfica — sem ela, recusa
servir.

**Webhooks:** comparam credenciais em tempo constante, o que impede um tipo de ataque que
descobre a chave medindo o tempo de resposta. E o webhook fiscal **reconsulta a API antes
de gravar qualquer coisa**: não confia no que chega.

> **Lacunas conhecidas.** Não há limitação de taxa nas rotas públicas. Não há exportação
> nem exclusão de dados pessoais a pedido do titular (LGPD). Nenhuma das duas bloqueia os
> primeiros clientes, mas ambas precisam existir antes de escala.

---

## 6. Integrações e APIs

### Com quem falamos

**Focus NFe** — emissão fiscal. A comunicação é isolada atrás de uma interface: o resto do
sistema não sabe o nome do provedor. Trocar de fornecedor é escrever uma nova
implementação, sem tocar no motor nem nas telas. Existe também uma implementação
simulada, usada para testar o motor sem depender de rede.

**Asaas** — cobrança. Boletos e cartões das assinaturas, com webhook para confirmação de
pagamento. **Verificado contra o ambiente de testes real em 12/08/2026:** criação de
cliente, geração de boleto, consulta e cancelamento funcionam.

**Resend** — entrega da nota por e-mail ao cliente final. Se não estiver configurado, o
sistema segue funcionando e registra o aviso: e-mail não pode derrubar uma nota já emitida.

**Inngest** — o motor. Garante que cada nota é processada uma vez por vez, com histórico
de execução.

### Como tratamos erro externo

Todo erro de fornecedor é classificado em **temporário** ou **definitivo**. Temporário
(prefeitura fora do ar, timeout, limite de requisições) merece nova tentativa. Definitivo
(dado inválido, CNPJ irregular) falha na hora.

Essa distinção é o que separa um sistema que insiste inteligentemente de um que insiste à
toa — ou de um que desiste cedo demais.

### Como outros poderiam se conectar a nós

O sistema já é construído em camadas separadas, com a lógica de negócio isolada das telas.
Uma API pública para parceiros seria **expor o que já existe**, não reescrever.

> Hoje **não existe API pública**. Um parceiro que quisesse integrar o próprio sistema ao
> nosso não tem como. Isso é decisão de produto, não limitação técnica.

---

## 7. Backups e contingência

### O que existe hoje

**Banco de dados:** o Supabase mantém backup automático diário, com retenção conforme o
plano contratado, e permite restaurar para um ponto no tempo nos planos pagos.

**Código:** versionado no GitHub, com histórico completo. Qualquer versão anterior pode ser
republicada.

**Estrutura do banco:** reconstruível do zero pelos arquivos de migração. Isso já foi
exercitado dezenas de vezes durante o desenvolvimento — não é teoria.

**Documentos fiscais emitidos:** ficam também no provedor fiscal e no ambiente nacional da
NFS-e. Mesmo numa perda total do nosso banco, **as notas emitidas continuam existindo** —
elas são documentos oficiais registrados fora daqui.

### Se algo cair

| O que cai | O que acontece | Impacto |
|---|---|---|
| A prefeitura | O motor reagenda sozinho | Atraso, sem perda |
| O provedor fiscal | Erro temporário, motor tenta depois | Atraso, sem perda |
| O e-mail | Nota emitida normalmente, envio registrado como falho | Baixo |
| A aplicação web | Ninguém acessa; notas na fila continuam sendo processadas | Médio |
| O banco de dados | Parada total | Alto |

O banco é o **ponto único de falha** — e é o componente com maior garantia contratual de
disponibilidade, o que é a mitigação adequada nesta escala.

### Lacunas que precisam ser fechadas antes de escala

1. **Não há monitoramento ativo.** Se uma nota falhar às 3h da manhã, ninguém é avisado. É
   a lacuna operacional mais séria hoje.
2. **O backup nunca foi restaurado em teste.** Backup não testado é hipótese, não garantia.
3. **Não há plano de contingência escrito** para indisponibilidade prolongada de um
   fornecedor.
4. **Não há ambiente de homologação** separado.

Nenhuma delas impede começar. Todas precisam existir antes de haver dinheiro de terceiros
e obrigação fiscal em jogo.

---

## Resumo em uma página

**O que é sólido:** a arquitetura de emissão resiliente, o isolamento entre empresas em
três camadas, a conformidade fiscal apoiada em fonte oficial versionada, e a disciplina de
que o banco impõe as regras em vez de confiar na aplicação.

**O que falta:** monitoramento, teste de restauração de backup, ambiente de homologação,
limitação de taxa, e as rotinas de LGPD.

**O que é honesto dizer a um parceiro:** o produto está construído e testado; a emissão
real depende da homologação junto ao provedor fiscal, que é etapa de documentação, não de
desenvolvimento.
