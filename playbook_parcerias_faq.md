# Playbook de Parcerias — FAQ para reuniões

> Guia de bolso para reuniões comerciais com escritórios de contabilidade e integradores.
> As perguntas são as que eles realmente fazem antes de assinar.
>
> **Regra de ouro deste documento:** onde a resposta depende de algo que ainda não existe,
> a resposta sugerida diz isso. Prometer o que não temos destrói a parceria no primeiro
> erro — e escritório de contabilidade cobra promessa.

---

## Comissionamento

### "Como exatamente vocês calculam a minha comissão?"

Depende do modelo escolhido, e a diferença é grande:

**Indicação:** 20% da mensalidade de cada cliente que você trouxe, todo mês, enquanto ele
estiver ativo e em dia. A base é a mensalidade do plano — não incide sobre notas
excedentes, e explico por quê logo abaixo.

**Revenda:** não há comissão. Você compra com desconto e revende pelo preço que quiser; sua
margem é a diferença, e ela é maior que qualquer comissão que eu conseguiria pagar. Com 20
clientes, o desconto é de 35% — R$ 33,95 por cliente por mês, contra R$ 19,40 da comissão.

### "Por que a comissão não incide sobre as notas excedentes?"

Porque o excedente é o que paga a infraestrutura de emissão. A mensalidade tem margem
larga; o excedente cobre o custo variável de cada nota junto ao provedor fiscal.

É melhor eu ser transparente sobre isso do que oferecer um percentual sobre tudo e ter que
reduzi-lo depois. **Se você preferir participar do excedente, o caminho é a revenda** —
ali você define o próprio preço de nota extra e fica com a diferença inteira.

### "E se eu trouxer 50 clientes de uma vez?"

Aí a conversa muda, e a favor. Meu custo com o provedor fiscal tem um degrau: até uns 15
CNPJs o custo por cliente fica alto; a partir daí ele desaba, porque o plano de volume
cobre CNPJs ilimitados com uma franquia global de notas.

Um parceiro que traz 40+ clientes me leva direto para a faixa boa. Por isso o desconto de
revenda chega a 45% nessa faixa — **não é generosidade, é a economia de escala sendo
repartida.**

### "Quando eu recebo?"

Até o dia 10 do mês seguinte, com relatório dos clientes ativos e do que gerou comissão. Na
revenda não há repasse: você já fica com a diferença na origem, porque quem cobra o cliente
final é você.

### "E se meu cliente atrasar o pagamento?"

Na indicação, a comissão acompanha o pagamento: recebeu, comissionou. Não pago sobre
inadimplência, e não desconto de meses anteriores.

Na revenda, o risco de crédito é seu — você paga por licença ativa independentemente de o
cliente ter pago. É a contrapartida de ficar com margem maior e com a relação.

---

## Exclusividade

### "Vocês vão vender direto para os meus clientes?"

Não, e isso está no contrato — não é promessa verbal.

Na revenda, o cliente é **seu**, formalmente. Nós não abordamos sua carteira, não fazemos
prospecção nela e não temos interesse comercial em fazer: você faz o atendimento de
primeiro nível, o que reduz meu custo. Canibalizar seu cliente destruiria isso.

Vale dizer que essa mesma proteção existe no contrato do nosso provedor fiscal conosco. É o
modelo padrão de revenda no setor, não uma concessão especial.

### "Tenho exclusividade na minha cidade?"

Exclusividade territorial não faz sentido em software de emissão fiscal — o sistema atende
o país inteiro e a concorrência entre escritórios não é geográfica.

O que ofereço, e vale mais: **exclusividade sobre a sua carteira**. Cliente que entrou pela
sua indicação fica marcado como seu, permanentemente. Se ele nos procurar direto depois, a
comissão continua sendo sua.

Se você atende um nicho específico e quiser exclusividade nele, é conversa possível — mas
com contrapartida de volume mínimo. Exclusividade sem compromisso é bloqueio de mercado
sem contrapartida.

### "E se eu quiser sair da parceria?"

Sem fidelidade e sem multa, nos dois modelos. Na revenda, seus clientes continuam sendo
seus: ou você migra para outro fornecedor, ou eles passam a contratar direto. Não retenho
carteira por contrato — retenho por o produto valer a pena.

---

## Onboarding de clientes

### "Como é o passo a passo, do meu sim até o cliente emitindo?"

**1. Você entra na plataforma.** Uma conta para o escritório, não uma por cliente.

**2. Você cadastra o cliente na sua carteira.** CNPJ, endereço, regime tributário. Leva
menos de dois minutos e não precisa da nossa participação.

**3. O certificado digital A1 é enviado.** Aqui vale a pena entender o desenho: o
certificado vai direto ao provedor fiscal, que já precisa dele para assinar. **Nós não
guardamos cópia** do arquivo nem da senha — só a data de validade, para avisar antes do
vencimento.

Isso importa para você: você está entregando o certificado de um cliente seu, e o
certificado assina documentos com valor legal. Quanto menos lugares o guardarem, melhor.

**4. Primeira nota de teste** em ambiente de homologação, para conferir alíquota, código de
serviço e o layout do município.

**5. Produção.** O cliente emite pela sua conta ou por acesso próprio, como você preferir.

Da assinatura à primeira nota real: **um dia útil**, sendo a maior parte espera do
certificado, não nossa.

### "Como o sistema sabe que aquele cliente é meu?"

O vínculo é estrutural, não uma anotação. Cada empresa da sua carteira fica ligada ao seu
usuário com um papel definido, e é isso que faz o painel único funcionar: você troca de
empresa em um clique, sem trocar de login.

É também o que sustenta o relatório de comissão — a atribuição não depende de alguém
lembrar de marcar.

### "Meu cliente pode ter acesso próprio?"

Pode. O modelo de papéis prevê dono, administrador e operador **por empresa**. Você pode
dar ao cliente um acesso que emite mas não mexe em configuração fiscal, mantendo controle
sobre o que importa.

---

## Suporte e SLA

### "Meu cliente teve um problema. Quem ele aciona?"

**Você, primeiro.** E não é para empurrar trabalho: na maioria dos casos você resolve mais
rápido do que nós. "Qual código de serviço uso?", "o cliente mudou de endereço", "essa nota
foi para o tomador errado" — isso é conhecimento do contador, não do fornecedor de
software.

**Nós, no segundo nível.** Erro de emissão, rejeição da prefeitura, comportamento estranho
do sistema, dúvida técnica. Você abre um chamado e acompanhamos.

**O provedor fiscal, no terceiro.** Indisponibilidade da infraestrutura ou do portal do
município. **Você não fala com eles** — nós abrimos e acompanhamos o chamado.

### "Que prazo vocês garantem?"

Sejamos honestos sobre o estágio: hoje somos uma operação pequena, e prometer SLA de
minutos seria mentira.

O que ofereço e cumpro: **primeira resposta em até 4 horas úteis**, canal direto (não fila
de tíquete anônimo), e escalonamento imediato para o provedor quando o problema for de
infraestrutura.

Conforme a base crescer, o SLA se formaliza. Prefiro combinar um prazo que eu cumpro do que
anunciar um que eu quebro no terceiro mês.

### "E se uma nota simplesmente não sair?"

Aqui a arquitetura ajuda mais que o suporte. Se a prefeitura estiver fora do ar, **o sistema
reprocessa sozinho** — 5 minutos, 15 minutos, 1 hora. Ninguém precisa abrir chamado, e a
nota não se perde.

Toda tentativa fica registrada com a resposta bruta da prefeitura. Quando você abrir um
chamado, eu não pergunto "o que aconteceu?" — eu já vejo.

Se for erro de dado, o sistema **falha na hora** em vez de insistir, e a mensagem diz o que
está errado. Isso é deliberado: insistir com dado errado só queima tentativa e atrasa a
descoberta.

---

## Transparência

### "Como acompanho meus clientes e minhas comissões?"

Hoje, com relatório mensal enviado por e-mail: clientes ativos, notas emitidas por cliente,
e o cálculo da comissão ou do faturamento de revenda.

**Sendo direto: o painel de parceiro dentro do sistema ainda não existe.** Está no roadmap,
e quem entra agora tem prioridade e voz sobre o que ele mostra.

Não vou dizer que existe. Você descobriria no primeiro acesso, e aí eu teria perdido algo
mais caro que uma funcionalidade.

### "Como sei que o número que vocês mandam está certo?"

Três coisas:

O relatório é **por cliente e por nota**, não um total agregado. Dá para conferir contra o
que você conhece da carteira.

Você vê as notas dos seus clientes no próprio painel — o painel único é a sua auditoria.

Na revenda, a conferência é trivial: você sabe quantos clientes ativos tem e qual sua faixa
de desconto. A fatura tem que bater com uma multiplicação.

### "E se eu discordar de um valor?"

Você aponta, eu conferio nos registros e corrijo no mesmo ciclo. Toda emissão tem registro
com data, hora e resultado — não há espaço para "achismo" dos dois lados.

---

## As perguntas difíceis

### "Vocês são novos. E se fecharem as portas?"

Justa, e a resposta não é "não vamos fechar".

**Suas notas não dependem de nós.** Documento fiscal emitido fica registrado no ambiente
nacional da NFS-e e no provedor fiscal. Se eu desaparecer amanhã, as notas dos seus
clientes continuam existindo e acessíveis.

**O certificado não está comigo.** Ele está no provedor. Você não depende de eu devolver
nada.

**Seus dados cadastrais são exportáveis** e você pode contratar o provedor fiscal
diretamente — o mesmo que uso — e seguir emitindo. O que você perde é a camada de
conveniência, não a capacidade de operar.

Isso é mais do que a maioria dos fornecedores oferece, e é consequência de uma escolha de
arquitetura: **não somos um ponto de aprisionamento entre você e o Fisco.**

### "Já posso ver funcionando?"

O sistema está construído e testado. A emissão real depende da liberação do ambiente
oficial de testes junto ao provedor fiscal, que é etapa de documentação — não de
desenvolvimento.

Prefiro te dizer isso agora do que marcar uma demonstração e improvisar. **O que proponho é
um piloto:** os primeiros clientes seus, sem custo, assim que a homologação sair. Você vê
com dados reais, e só depois decide.

### "Por que eu confiaria a Reforma Tributária a vocês?"

Porque não improvisamos nela.

As regras de cálculo vêm das notas técnicas oficiais, lidas na fonte. A classificação
tributária vem da tabela nacional, sincronizada com registro de versão e data — dá para
provar de qual publicação veio cada número. As reduções de alíquota vêm da tabela oficial,
não de um palpite.

E o mais importante: **onde a norma não é clara, o sistema recusa e explica, em vez de
inventar.** Tem caso em que ele se nega a emitir porque falta uma definição que só um
contador pode dar. Isso é escolha de projeto — nota rejeitada custa retrabalho, nota errada
autorizada custa muito mais, e quem responde por ela é você.

---

## Antes da reunião: pergunte você

Vale mais que qualquer resposta ensaiada.

1. Quantos clientes emitem NFS-e hoje, e quantas notas por mês em média?
2. O que usam hoje, quanto custa, e **o que mais irrita**?
3. Quem emite: o cliente ou o escritório?
4. Já perderam nota por prefeitura fora do ar? O que fizeram?
5. Como estão se preparando para a Reforma? Quem no escritório domina o assunto?
6. Querem revender ou só indicar?

A resposta da 1 define qual proposta apresentar. A da 4 é onde o produto brilha. A da 6
decide o modelo.
