# O que o sistema faz, tela por tela

**Levantado do código em 13/08/2026**, commit `77b84b4`. Onde uma funcionalidade não existe,
está dito que não existe — documento que descreve o que se pretendia construir, em vez do que
está construído, vira promessa quebrada na primeira demonstração.

---

## Antes de tudo: "cliente" significa duas coisas diferentes

Metade da confusão sobre como o escritório usaria o sistema vem daqui. O sistema tem **duas
camadas** de cadastro, e as duas costumam ser chamadas de "cliente":

| No sistema | O que é | Exemplo |
|---|---|---|
| **Empresa** | Um **CNPJ que emite** nota. É o "cliente" do escritório de contabilidade. | Padaria do João LTDA |
| **Cliente** | O **tomador** do serviço, quem recebe a nota. É o cliente do seu cliente. | Quem comprou da padaria |

Quando você diz "o escritório tem 600 clientes", no sistema isso são **600 empresas**. Cada uma
delas tem a própria lista de clientes (tomadores).

Guardar isso resolve a leitura do resto.

---

## A resposta direta: quem faz login?

**Só o escritório. Hoje o cliente final não tem como entrar no sistema — nem se você quiser.**

O escritório cria uma conta, e a partir dela cadastra e opera **todos** os CNPJs da carteira.
Um login, uma carteira, todas as empresas.

### Por que "nem se você quiser"

Verifiquei no banco: **a única forma de alguém virar membro de uma empresa é criá-la.** A função
`criar_minha_empresa()` insere o vínculo e sempre em nome de quem chamou. A tabela
`empresa_membros` tem apenas policy de **SELECT** — nenhum caminho de INSERT existe para usuário
logado, e não há tela, ação ou endpoint de convite em lugar nenhum do código.

Consequência prática: quem criou a empresa é o único que a enxerga, para sempre.

### Sobre os papéis (owner / admin / operador)

Eles **existem no banco** — o enum `membro_papel` está lá. Mas hoje o papel é apenas **exibido**
no seletor de empresa, ao lado do CNPJ. Ele não autoriza nem impede nada: não há um único ponto
do código que decida algo com base nele.

> ⚠️ **Correção importante ao `playbook_parcerias_faq.md`.** Aquele documento responde
> *"Meu cliente pode ter acesso próprio?"* com *"Pode."* — **isso está errado** e não deve ser
> dito em reunião. A infraestrutura existe no schema; a funcionalidade, não. Vou corrigir o
> playbook se você quiser, mas o importante é você não prometer isso amanhã.

### O que isso significa comercialmente

**A favor:** é exatamente o modelo que o escritório quer. Ele não vai administrar 600 logins, e
o argumento de venda "uma conta, a carteira inteira, troca de empresa em um clique" é real e
está funcionando.

**Contra:** se algum escritório pedir que o cliente final emita sozinho, a resposta hoje é não.
E se você quiser cobrar por acesso do cliente final no futuro, isso é desenvolvimento novo — não
é configuração.

---

## Tela por tela

### Cadastro e primeiro acesso

**`/cadastro`** → cria a conta (e-mail e senha, via Supabase Auth).
**`/login`**, **`/recuperar-senha`**, **`/redefinir-senha`** → o de sempre.

**`/onboarding`** → aparece logo após o cadastro, quando o usuário ainda não tem empresa
nenhuma. Pede razão social, CNPJ, município (código IBGE), inscrição municipal, e-mail de
contato e regime tributário.

Ao salvar, três coisas acontecem numa transação só: cria a **empresa**, cria o **vínculo** de
owner e cria a **assinatura** no plano `starter` em `trial`, com limite de 100 notas/mês.

### Painel — `/dashboard`

A tela inicial. Mostra:

- **Situação das notas do mês** — quantas emitidas, pendentes, reprocessando, falhadas.
- **Notas recentes**, com status. Quando uma está reprocessando, mostra a tentativa atual e
  **o horário da próxima**, no fuso de São Paulo.
- **Resumo de cobrança** — plano, limite de notas do mês e quanto já foi usado.
- **Seletor de empresa** — o coração do multi-empresa. Só aparece quando você gerencia mais de
  uma. Troca a empresa ativa em um clique, sem trocar de login.

**Como a empresa ativa é escolhida, e por que isso importa para segurança:** a escolha vem de um
cookie do navegador, que é território hostil. A regra implementada é *o cookie sugere, a tabela
decide* — o id só é aceito se estiver entre os vínculos reais do usuário. Qualquer outro valor
cai na empresa padrão em silêncio. Isso não é firula: o `empresaId` daí é usado para **gravar**
nota e cliente, e aceitar um id não conferido significaria escrever no CNPJ errado.

### Clientes — `/dashboard/clientes`

Onde o escritório cadastra os **tomadores** de cada empresa. Cadastro completo: nome, CPF/CNPJ,
e-mail, telefone e endereço (logradouro, número, bairro, município, UF, CEP).

A lista é **por empresa ativa** — trocar de empresa no seletor troca a lista inteira. Os clientes
de uma empresa nunca aparecem para outra.

O e-mail é o que recebe a nota fiscal automaticamente quando ela é emitida.

### Nova cobrança — `/dashboard/cobrancas/nova`

O fluxo "receber e faturar junto". Gera uma cobrança (Pix, boleto ou cartão) via **Asaas** e
manda o link ao cliente.

Quando o pagamento é confirmado, o Asaas avisa por webhook e o sistema **cria a nota fiscal
sozinho** — sem ninguém digitar nada. É o caminho automático: pagou, emitiu.

> **Estado hoje:** a chave do Asaas ainda não está em produção, então esta tela avisa que a
> cobrança está indisponível em vez de quebrar.

### Nova nota — `/dashboard/notas/nova`

Emissão manual, para quem já recebeu por fora. Pede cliente, descrição, valor, **competência**,
código de serviço (LC 116) e alíquota de ISS.

A parte da Reforma Tributária fica aqui:

- Ao digitar o código de serviço, o sistema **consulta a correlação oficial** (Anexo VIII) e
  sugere o `cClassTrib` — a classificação tributária do IBS/CBS.
- Calcula a **base de cálculo** conforme a Nota Técnica 009/2026, com as deduções certas para o
  ano: até 2026 desconta PIS e COFINS; de 2027 em diante, não.
- Permite lançar **documentos de ajuste** (reembolso, repasse, ressarcimento) que reduzem a base.
- Onde a norma depende de julgamento contábil, o sistema **pede confirmação em vez de decidir** —
  e em alguns casos recusa a emissão e explica o porquê.

### Configurações — `/dashboard/configuracoes`

Três blocos:

**Dados fiscais da empresa** — razão social, CNPJ, inscrição municipal, município, CNAE, regime
tributário.

**Apuração de IBS/CBS** — para optantes do Simples: se apura dentro do Simples ou pelo regime
regular. A tela mostra em que fase da janela de opção estamos (abre 01/09/2026, fecha 30/09,
arrependimento até 30/11, nova janela em março/2027) e avisa que **quem não se manifestar
permanece no regime unificado** — o silêncio tem efeito.

**Emissor fiscal** — escolha entre simulação (mock) e Focus NFe, com aviso claro de qual não tem
validade jurídica. É aqui também que se envia o **certificado digital A1**.

**Sobre o certificado, e vale dizer em reunião:** ele vai **direto para o provedor fiscal** e
**não guardamos cópia** do arquivo nem da senha — só a data de validade, para avisar 45 dias
antes de vencer. O certificado assina documento em nome da empresa; quanto menos lugares o
tiverem, melhor. Para o escritório, que entrega certificado de terceiros, isso importa.

---

## O que roda sozinho, sem ninguém clicar

Esta é a parte que diferencia o produto, e ela é invisível na tela.

### Emissão nunca é síncrona

Quando você manda emitir, o sistema **grava a nota como pendente e responde na hora**. Quem fala
com a prefeitura é um motor em segundo plano. Você não fica esperando a prefeitura.

### O motor de retentativa

Se a prefeitura estiver fora do ar, o motor tenta de novo: **5 minutos → 15 minutos → 1 hora**,
quatro tentativas no total. Ninguém precisa abrir chamado, e a nota não se perde.

Se o erro for de **dado** (CNPJ irregular, campo inválido), ele **falha na hora** em vez de
insistir — e a mensagem diz o que está errado. Insistir com dado errado só queima tentativa e
atrasa a descoberta.

**Toda tentativa fica registrada** com a resposta bruta da prefeitura. Quando você abrir um
chamado, ninguém pergunta "o que aconteceu?" — está tudo gravado.

### Três vigias automáticos

| Vigia | Quando roda | O que faz |
|---|---|---|
| **Resgate de notas presas** | de hora em hora | Se o motor morrer no meio (queda, deploy), a nota fica parada. Ele devolve à fila depois de 2h sem atividade. |
| **Cobrança de excedentes** | dia 1 de cada mês | Soma as notas acima do limite do plano e gera uma cobrança agregada. |
| **Vigia da franquia** | todo dia | Projeta o consumo de notas contra a franquia contratada e avisa por e-mail antes de estourar. |

O último é interno — protege a **sua** margem, não é funcionalidade do cliente.

### E-mail automático ao tomador

Emitida a nota, o cliente final recebe um e-mail com o número, o **PDF** e o **XML**. O envio não
pode derrubar a emissão: se o e-mail falhar, a nota continua válida e a falha fica registrada.

**Sobre o XML.** Ele vem do provedor, fica gravado e aparece tanto no e-mail quanto no painel,
ao lado do PDF. Para o escritório é o que importa — é o XML que entra na escrituração, e com a
Reforma o crédito de IBS/CBS se apoia no documento, não na via de leitura.

Vale ser preciso sobre o motivo: **não localizei, nas fontes oficiais, obrigação do prestador de
enviar o XML ao tomador na NFS-e.** O Ambiente de Dados Nacional já disponibiliza o documento às
partes da nota — o tomador tem menu próprio de "NFS-e recebidas", onde baixa XML e DANFSe e ainda
aceita ou rejeita. Entregar por e-mail é conveniência nossa, não cumprimento de dever legal, e
não deve ser vendido como tal.

---

## Isolamento entre empresas

Testei isso no banco, com dois usuários reais, e não por leitura de código:

| Tentativa | Resultado |
|---|---|
| Listar notas de outra empresa | Só vê as próprias |
| Abrir nota alheia pelo id direto | **Zero linhas** |
| Alterar nota de outra empresa | Recusado no nível de privilégio |
| Criar nota gravando o CNPJ de outra empresa | Recusado pela política de segurança |

São duas camadas independentes: o banco filtra as linhas, e o privilégio impede a operação. Uma
falha na primeira não abre a segunda.

---

## O que NÃO existe hoje

Dito aqui para você não descobrir numa reunião:

- **Acesso do cliente final** — não há convite; só quem cria a empresa a enxerga.
- **Papéis com efeito** — owner/admin/operador existem, mas não restringem nada.
- **Painel de parceiro** — o escritório não vê relatório de comissão dentro do sistema.
- **Emissão real** — depende do `FOCUSNFE_TOKEN`, que só faz sentido quando houver CNPJ e
  certificado. Até lá tudo opera em simulação, com faixa de aviso em todas as telas.
- **Cobrança ativa** — a chave do Asaas ainda é de teste.
- **Cancelamento de nota** — o sistema emite; cancelar ainda é fora dele.
- **Importação em massa** — cadastrar 600 CNPJs hoje é um a um. Para uma carteira grande, isso
  é trabalho real e deve entrar na conversa de implantação.
- **Relatórios e exportação** — não há exportação de notas para contabilidade.
- **Monitoramento, ambiente de homologação e rotinas de LGPD** — ausentes.

---

## Resumindo o fluxo do escritório

1. Cria a conta e a primeira empresa no onboarding.
2. Para cada CNPJ da carteira, cria uma empresa e envia o certificado A1.
3. Cadastra os tomadores de cada empresa.
4. Emite: manual, ou automático quando o cliente paga uma cobrança.
5. O motor cuida da prefeitura, incluindo quando ela cai.
6. O tomador recebe a nota por e-mail.
7. O escritório acompanha tudo trocando de empresa no seletor, com um login só.
