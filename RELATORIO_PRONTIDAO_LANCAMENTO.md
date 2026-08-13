# Relatório de prontidão para lançamento

**Data:** 12/08/2026 · **Commit auditado:** `0a05bfb` · **Banco de produção:** `spxiaucinjsgbipaormf`

> Método: nada aqui foi concluído por leitura de código apenas. Onde havia como medir, medi —
> no banco local, no banco de produção e nas fontes oficiais. Onde não deu para provar, está
> dito que não deu.

---

## Veredito em uma linha

**O sistema não está pronto para lançar.** A engenharia é sólida e a modelagem fiscal é boa;
o que impede o lançamento são cinco defeitos concretos, três deles capazes de causar dano ao
cliente — e um com prazo em **19 dias**.

---

## 1. Bloqueadores de lançamento

### B1 — Empresa nova nasce emitindo nota falsa 🔴

`criar_minha_empresa()` grava `provider_fiscal = 'mock'` **literalmente** (migration
`20260811140000`, linha 76 — não é default de coluna, é valor fixo na função). O provider mock
devolve:

```ts
numeroNfse: String(Math.floor(Math.random() * 1_000_000))
```

O aviso "sem validade jurídica" existe e é bem escrito — mas `ehSimulacao` é consumido em **um
único lugar**: a tela de configurações. Verificado por varredura: não aparece no formulário de
emissão, na lista de notas, no dashboard, nem no e-mail ao cliente.

**Consequência:** quem se cadastra, não abre configurações e emite, vê "Emitida — nº 483920" e
acredita ter cumprido obrigação fiscal. Num produto fiscal, esse é o pior modo de falha possível.

**Correção mínima:** faixa persistente de simulação em toda tela que mostre nota, e bloqueio da
emissão até o provider ser escolhido conscientemente.

### B2 — `FOCUSNFE_TOKEN` não existe em produção 🔴

Levantado com `vercel env ls production`. Produção tem 9 variáveis. **Faltam:**

| Variável | Efeito da ausência |
|---|---|
| `FOCUSNFE_TOKEN` | Emissão real impossível — `focusNfeEnv()` lança |
| `FOCUSNFE_AMBIENTE` | Cai no default `homologacao` (nota sem validade) |
| `RESEND_API_KEY` | **Nenhum e-mail é enviado**; pulado com log |
| `ASAAS_API_KEY` | Cobrança inativa |

B1 e B2 se compõem: hoje não há caminho para emitir uma nota válida em produção.

### B3 — Nota travada em `reprocessando` não tem saída 🔴

Provado no banco local:

```
>>> o que o botão REPROCESSAR do usuário tenta (reprocessando -> pendente):
ERROR:  Transição inválida: reprocessando -> pendente
```

A máquina permite `reprocessando → emitida | falhou | reprocessando`. Não há
`reprocessando → pendente`, que é justamente o que o botão do usuário pede.

Como uma nota chega lá: `emitir-nfse` roda com `retries: 0` (correto, regra 13). Qualquer step
que lance depois da transição para `reprocessando` — queda do Inngest, deploy no meio da
execução, falha do banco dentro de `registrarTentativa`, erro em `gravar-emissao` — mata a
função. E existem **apenas duas** funções Inngest (`emitir-nfse`, `cobrar-excedentes`): não há
vigia que reconcilie notas presas.

Saída hoje: intervenção manual com `service_role`. Num produto vendido como "sua nota sai mesmo
quando a prefeitura cai", é a contradição mais cara do sistema.

### B4 — Competência sai errada 3 horas por dia 🔴

`src/app/dashboard/notas/nova/actions.ts:73`:

```ts
competencia: new Date().toISOString().slice(0, 10),
```

UTC cru, sem fuso. Provado:

| Emissão real (BRT) | Competência gravada |
|---|---|
| 31/08/2026 22:00 | **2026-09-01** → apuração no mês errado |
| 31/12/2026 21:30 | **2027-01-01** → bloqueio 2h30 antes da virada |

Não é caso de borda anual: **todo dia**, das 21h à meia-noite, a competência sai um dia à
frente. Em fim de mês, muda o período de apuração. O único código com consciência de fuso no
projeto é um formatador de exibição no dashboard.

Agrava: a competência é **sempre hoje** — o usuário não pode escolher. Emitir no dia 2 uma nota
de serviço do mês anterior é impossível.

### B5 — Prazo do Simples: a tela contradiz a norma nova 🟠 *(19 dias)*

`prazoOpcaoAberto()` trata a janela como "aberta desde sempre até 30/09/2026". As
**Resoluções CGSN nº 190 e 191/2026** estabelecem:

- janela de opção: **1 a 30 de setembro de 2026** (tem abertura, que não modelamos)
- arrependimento: até **30/11/2026** (não existe no sistema)
- segunda janela: **1 a 31 de março de 2027** (não existe no sistema)

Hoje, 12/08, a tela diz ao usuário que o prazo está **aberto** e mostra contagem regressiva —
antes de a janela existir.

> **Ressalva de fonte, e ela importa:** li isso no anúncio oficial da Receita Federal, não no
> texto das resoluções no DOU. É fonte oficial, mas é notícia, não norma. **Confirmar contra o
> texto publicado antes de alterar o código** — pela mesma regra que aplicamos ao resto:
> anúncio oficial não é norma lida na fonte.

---

## 2. O que foi verificado e está correto

### Isolamento entre empresas — testado, não presumido

Simulei dois tenants no banco local com JWT real (`request.jwt.claims`), quatro vetores:

| Ataque | Resultado |
|---|---|
| Listar notas | Só as da própria empresa |
| Ler nota alheia por id direto (IDOR) | **0 linhas** |
| Alterar nota alheia | `ERROR: permission denied for table notas_fiscais` |
| Inserir nota com `empresa_id` forjado | `ERROR: new row violates row-level security policy` |

O UPDATE é barrado no nível de **privilégio**, antes do RLS — a segunda camada restaurada hoje
pela migration `20260812140000`. Vale registrar que essa camada estava ausente em produção até
hoje: o banco hospedado nasceu em 05/07 com as default privileges antigas do Supabase e
carregava `UPDATE`/`DELETE` indevidos em 14 das 15 relações.

### Modelagem fiscal

- **Base de cálculo (NT SE/CGNFS-e 009/2026)** — fórmula correta, com PIS/COFINS dedutíveis só
  até 2026 e ISSQN permanente. Base negativa e PIS/COFINS pós-2026 **lançam** em vez de serem
  silenciosamente ajustados. Decisões nossas, marcadas como nossas no código.
- **Alíquotas 2027** — `VIGENCIAS` traz IBS = 0,1%. Conferido hoje em fonte primária: IBS 2027 é
  0,05% estadual + 0,05% municipal. **Correto.**
- **CBS 2027 = `null`** — correto e ainda atual. A fixação depende de Resolução do Senado com
  cálculo do TCU, não publicada. A Resolução CGIBS nº 14 (29/07/2026, DOU 31/07) usa 18,7% para
  IBS, mas é projeção orçamentária declarada — não é fixação, e acertadamente não está na tabela.
- **Máquina de estados, idempotência, classificação de erro, backoff 5m/15m/1h** — conforme as
  regras 5 a 13.
- **E-mail** — escape de HTML e validação de esquema de URL contra `javascript:`. Falha de envio
  é não-fatal e logada, nunca reverte emissão.
- **`cliente_id ON DELETE RESTRICT`** — apagar cliente não apaga nota fiscal.

### Saúde do código

`typecheck` ✔ · `lint` ✔ · **377 testes / 22 arquivos** ✔ · `build` ✔ · `db reset` com 19
migrations ✔ · produção e local com privilégios idênticos, relação a relação ✔

---

## 3. Como a virada para 2027 está programada

**Resposta curta:** as travas ativam sozinhas pela data **da nota** (competência), não por deploy
nem por data do servidor. Mas uma delas trava demais, e a válvula de escape não está ligada.

### O que vira sozinho ✔

```ts
const deduzPisCofins = ano <= ULTIMO_ANO_PIS_COFINS; // 2026
```

Lido da competência da nota. Em 01/01/2027 a fórmula passa a ser
`vBC = vServ − descIncond − ajusteBC − vISSQN`, sem intervenção. E PIS/COFINS informados numa
nota de 2027 **lançam erro** em vez de serem descartados em silêncio — o usuário fica sabendo.
Nota de 2026 lançada com atraso continua usando a regra de 2026, porque o que manda é a
competência. Está certo.

### O que trava e **não** destrava sozinho 🔴

`aliquotasReferencia()` lança `AliquotaNaoFixadaError` quando a alíquota não foi fixada. Como a
CBS de 2027 é `null`, **em 01/01/2027 toda emissão para. Para todos os clientes, ao mesmo tempo.**

Isso é deliberado e defensável — emitir com alíquota inventada é subdeclaração com aparência de
conformidade. O problema é a saída. O código promete:

> *"`overrides` é o caminho para destravar sem deploy assim que a Resolução do Senado sair"*

**A promessa não se cumpre.** Rastreei a cadeia inteira: `notas.ts:277` chama
`calcularTributosReforma` **sem** `overridesAliquotas`. Não há tabela, env var nem tela que
alimente esse parâmetro. Ele existe na assinatura e nada o preenche.

Consequência prática: quando o Senado publicar — provavelmente entre novembro e dezembro de 2026
— destravar exige **editar `VIGENCIAS` em `reforma.ts` e fazer deploy**, sob pressão de tempo,
possivelmente durante o recesso.

O erro pelo menos chega ao usuário como mensagem legível, não como tela branca: é capturado em
`actions.ts:128` e vira `{ ok: false, erro }`. A mensagem diz o que houve e o que fazer.

**Recomendação:** mover as alíquotas para tabela no banco, com vigência e fundamento, alimentando
`overrides`. Vira operação de configuração, não de engenharia — e com B4 corrigido, deixa de
disparar 3 horas antes da hora.

---

## 4. Ordem sugerida

| # | Item | Por quê agora |
|---|---|---|
| 1 | **B5** — confirmar CGSN 190/191 no DOU e corrigir a janela | Prazo abre em 19 dias |
| 2 | **B1** — faixa de simulação em toda tela + bloqueio de emissão | Risco de dano ao cliente |
| 3 | **B4** — competência no fuso de São Paulo, e deixar o usuário escolhê-la | Erra todo dia |
| 4 | **B2** — configurar as 4 variáveis em produção | Destrava emissão real |
| 5 | **B3** — vigia de notas presas + permitir `reprocessando → pendente` com guarda | Contradiz a promessa do produto |
| 6 | Alíquotas em tabela com vigência | Antes de dezembro |

Fora do escopo desta auditoria, mas seguem valendo: sem monitoramento ativo, backup nunca
restaurado em teste, sem homologação, sem rate limiting, sem rotinas de LGPD, webhook do Asaas
não cadastrado.

---

## Fontes primárias consultadas hoje

- [LC 214/2025 — Planalto](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm)
- [Resolução CGIBS nº 14, de 29/07/2026 (DOU 31/07/2026)](https://www.cgibs.gov.br/upload/arquivos/202607/31144942-resoluc-ao-cgibs-n-14-de-29-de-julho-de-2026-proposta-percentual-ibs-cgibs-2027.pdf)
- [CGSN atualiza regras do Simples Nacional — Receita Federal](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/cgsn-atualiza-regras-do-simples-nacional-para-adequacao-a-reforma-tributaria-do-consumo)
- [Alíquotas de Referência CBS e IBS — TCU](https://sites.tcu.gov.br/reforma-tributaria/aliquotas-referencia.html)
- [Nota técnica de alíquotas — Ministério da Fazenda](https://www.gov.br/fazenda/pt-br/acesso-a-informacao/acoes-e-programas/reforma-tributaria/regulamentacao-da-reforma-tributaria/lei-geral-do-ibs-da-cbs-e-do-imposto-seletivo/notas/nota-tecnica-aliquotas_2024-07-01_sertmf-1.pdf)
