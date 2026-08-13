# Custo real por cliente e proposta do piloto

**Apurado em 13/08/2026.** Câmbio USD/BRL 5,17. Todo número aqui foi conferido na fonte —
onde não foi, está marcado **(confirmar)**.

---

## A conclusão que muda a pergunta

Você perguntou "quantos **clientes** posso dar de graça". A estrutura de custo responde outra
coisa:

> **No plano Growth da Focus, um cliente a mais custa R$ 0.** O que custa é **nota**.

O Growth dá **CNPJs ilimitados** com uma franquia **global** de 4.000 notas. Então o teto do
piloto não é número de clientes — é o total de notas emitidas por todos eles somados.

E isso inverte a intuição: **quanto mais clientes no piloto, mais barato fica cada um.**

| Clientes no piloto | Custo total do mês | Custo por cliente |
|---:|---:|---:|
| 3 | R$ 349,88 | **R$ 116,63** |
| 6 | R$ 463,58 | R$ 77,26 |
| 15 | R$ 783,98 | R$ 52,27 |
| 40 | R$ 783,98 | **R$ 19,60** |
| 80 | R$ 783,98 | R$ 9,80 |

Fazer 3 clientes de graça custa quase o mesmo por cliente que **não ter escala nenhuma**. Fazer
40 custa R$ 19,60 cada. O piloto pequeno é caro por cliente, não barato.

---

## De onde vem cada real

### Infra fixa — R$ 235,98/mês, não depende de quantos clientes

| Item | Custo | Por que é obrigatório |
|---|---:|---|
| Vercel Pro (US$ 20) | R$ 103,40 | **O plano atual proíbe uso comercial** — ver abaixo |
| Supabase Pro (US$ 25) | R$ 129,25 | O Free **não tem backup** e pausa após 7 dias |
| Domínio .com.br | R$ 3,33 | R$ 40/ano **(confirmar)** |

**Dois achados que você precisa saber antes da reunião:**

A documentação da Vercel diz, literalmente: *"the Hobby plan restricts users to non-commercial,
personal use only."* Você está hoje no Hobby. **Cobrar de um cliente rodando nesse plano viola
os termos** e o risco é a conta ser suspensa — com o site fora do ar, em cima dos clientes do
escritório. R$ 103,40/mês resolve.

O Supabase Free, na página oficial: *"Automatic backups: Not included"* e pausa *"after 1 week
of inactivity"*. Guardar dado fiscal de terceiros sem backup não é economia, é risco
transferido para o seu cliente. O Pro traz *"Daily backups stored for 7 days"*.

**Asaas: R$ 0 no mês gratuito.** Ele só cobra quando há cobrança paga — Pix e boleto R$ 0,99 nos
3 primeiros meses, depois R$ 1,99; cartão R$ 0,49 + 1,99% (depois 2,99%). Sem mensalidade.
**Resend e Inngest** ficam no free tier nesta escala.

### Focus NFe — onde trocar de plano

| | Start | Growth |
|---|---|---|
| Mensalidade | R$ 113,90 | R$ 548,00 |
| CNPJs | 3 (+R$ 37,90 cada) | **ilimitados** |
| Notas | 100 **por CNPJ** | 4.000 **no total** |
| Nota extra | R$ 0,10 | R$ 0,12 (decrescente por faixa) |

**Ponto de virada: 15 CNPJs.** Até 14, o Start sai mais barato (em 15 ele custaria R$ 568,70
contra R$ 548,00 do Growth). De 15 em diante, Growth — e a partir daí a conta congela.

⚠️ **Atenção a uma pegadinha do contrato deles:** *"Cada nota emitida ou recebida conta como uma
unidade no plano."* **Recebimento também consome franquia.** Se o escritório usar a conta para
receber XML de fornecedor, isso queima nota do seu pacote.

---

## O risco que você levantou: o cliente que emite 1.000 notas

Você estava certo em se preocupar — e o tamanho do problema depende do plano:

| Cenário | Franquia | Emitidas | Excedente | Total do mês |
|---|---:|---:|---:|---:|
| 3 clientes (Start), um emite 1.000 | 300 | 1.100 | **R$ 80,00** | R$ 429,88 |
| 6 clientes (Start), um emite 1.000 | 600 | 1.250 | R$ 65,00 | R$ 528,58 |
| 40 clientes (Growth), um emite 1.000 | 4.000 | 2.950 | **R$ 0,00** | R$ 783,98 |

No piloto pequeno, **um único cliente grande estoura sua franquia sozinho**. No Growth, ele é
absorvido. Mais um motivo para o piloto ser maior, não menor.

### Quantas notas oferecer por cliente

O teto de notas é o que de fato limita o piloto:

| Teto por cliente | Clientes que cabem em 4.000 | Custo por cliente |
|---:|---:|---:|
| 25 notas | 160 | R$ 4,90 |
| 50 notas | 80 | R$ 9,80 |
| **100 notas** | **40** | **R$ 19,60** |
| 150 notas | 26 | R$ 30,15 |
| 200 notas | 20 | R$ 39,20 |

**Recomendação: 100 notas por cliente no mês de teste.** É o mesmo número que a Focus dá por
CNPJ no Start, então é defensável em qualquer conversa, e cabe 40 clientes dentro da franquia.

Ponha isso **por escrito na proposta**: *"até 100 notas por CNPJ no mês de avaliação; acima
disso, R$ 0,15 por nota."* Sem esse teto, um cliente com 1.000 notas transforma um piloto de
R$ 784 num de R$ 1.100+.

---

## Quanto cobrar a partir do mês 2

Aqui está o número que mais importa e que quase passou despercebido:

| Clientes | Custo/mês | Preço mínimo p/ empatar | A R$ 97 sobra | A R$ 67 sobra |
|---:|---:|---:|---:|---:|
| 3 | R$ 349,88 | R$ 116,63 | **−R$ 58,88** | −R$ 148,88 |
| 6 | R$ 463,58 | R$ 77,26 | +R$ 118,42 | −R$ 61,58 |
| 9 | R$ 577,28 | R$ 64,14 | +R$ 295,72 | +R$ 25,72 |
| 15 | R$ 783,98 | R$ 52,27 | +R$ 671,02 | +R$ 221,02 |
| 40 | R$ 783,98 | **R$ 19,60** | +R$ 3.096,02 | +R$ 1.896,02 |

**Três clientes pagando R$ 97 ainda dão prejuízo de R$ 58,88/mês.** O piloto de 3 não se paga
nem depois de virar pago — ele só faz sentido como custo de aquisição, para provar o produto e
abrir a porta dos outros 597 CNPJs.

- A **R$ 97**, você empata com **4 clientes** e lucra de verdade a partir de 6.
- A **R$ 67**, precisa de **9 clientes** para empatar.

---

## Como apresentar a primeira proposta

**Não abra com preço.** Abra com o teto e o prazo, porque é o que protege os dois lados.

> **Piloto sem custo — 30 dias**
> - Até **10 CNPJs** da carteira de vocês, escolhidos por vocês
> - Até **100 notas por CNPJ** no período
> - Emissão real de NFS-e, com o certificado A1 indo direto ao provedor — **nós não guardamos cópia**
> - Suporte direto comigo, sem fila
> - **Sem contrato, sem cartão, sem multa.** Ao fim dos 30 dias vocês decidem
>
> **Depois do piloto:** R$ 97/CNPJ/mês, com 100 notas incluídas. Nota extra R$ 0,15.
> Para a carteira inteira, a partir de 20 CNPJs a conversa vira revenda, com desconto por faixa.

**Por que 10 e não 3:** custa praticamente o mesmo (R$ 783,98 já cobre até 40 clientes) e um
piloto de 10 gera evidência que um de 3 não gera. Com 3, um caso ruim é 33% da amostra.

**Por que 30 dias:** é o prazo do teste gratuito da própria Focus **(confirmar se vale para
conta de revenda e se é uma vez só)** — se valer, seu custo de Focus no mês 1 cai a zero e o
piloto sai por R$ 235,98.

**O que não prometer:** painel de parceiro (não existe), SLA em minutos, e emissão em qualquer
município sem antes testar o município deles.

---

## Perguntas a fazer na reunião

As quatro primeiras mudam a proposta. Sem elas, você está chutando.

**1. Dos ~600 CNPJs, quantos emitem NFS-e hoje?**
É a pergunta que define tudo. Se forem 200, a receita potencial a R$ 97 é R$ 19.400/mês.

**2. Quantas notas por mês, em média, e qual o maior emissor?**
O maior emissor define seu risco de franquia. Se houver um com 1.000 notas/mês, ele sozinho
consome 25% do Growth — e precisa entrar numa faixa própria, não no preço padrão.

**3. Em quantos municípios diferentes eles emitem?**
Cada prefeitura tem particularidade. Emitir em 3 municípios é diferente de emitir em 80. Isso
define quanto tempo de homologação você vai gastar.

**4. Quem emite hoje: o escritório ou o cliente final?**
Se é o escritório, você vende produtividade e o multi-empresa é o argumento. Se é o cliente
final, você precisa treinar 200 pessoas — e o piloto tem que ser desenhado para isso.

**5. O que usam hoje, quanto pagam, e o que mais irrita?**
O preço atual é sua âncora. O que irrita é seu roteiro de demonstração.

**6. Já perderam nota por prefeitura fora do ar? O que fizeram?**
É onde seu motor de retry brilha. Se a resposta for "nunca aconteceu", não force o argumento.

**7. Vocês querem revender ou indicar?**
Revenda: você fatura o escritório, ele fatura o cliente, margem maior para ele. Indicação:
20% de comissão. **Não ofereça os dois na mesma reunião** — confunde e derruba seu preço.

**8. Quem decide? Tem sócio que precisa aprovar?**
Descobrir isso no fim da segunda reunião custa um mês.

---

## Antes da reunião — o que fazer

1. **Subir Vercel para Pro** (R$ 103,40/mês). Sem isso você está fora dos termos de uso ao cobrar.
2. **Subir Supabase para Pro** (R$ 129,25/mês). Sem backup não se guarda dado fiscal de terceiro.
3. **Confirmar com a Focus:** o teste de 30 dias vale para conta de revenda? Uma vez só ou por CNPJ?
4. **Configurar `FOCUSNFE_TOKEN` em produção** — hoje o sistema não emite nota real (item B2 da auditoria).
5. **Testar a emissão num município real** antes de prometer qualquer coisa.

Os itens 1, 2 e 4 somam R$ 232,65/mês e são o que separa "demonstração" de "produto".
