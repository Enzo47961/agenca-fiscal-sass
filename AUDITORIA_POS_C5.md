# Auditoria pós-C5 — Agência Fiscal SaaS

**Data:** 05/08/2026 · **Commit auditado:** `cc7d492` (4 commits após `9f9f4ce`)
**Escopo:** o que ainda impede a emissão de uma NFS-e juridicamente válida com o grupo IBSCBS.
**Método:** leitura do código no estado atual, não do relatório anterior. Cada afirmação abaixo foi verificada por busca no repositório; onde a fonte é normativa, é a `ibscbs_modelagem_tecnica.md`.
**Nada foi implementado nesta etapa.**

---

## 0. Uma correção de escopo antes de tudo

O pedido fala em "NF-e válida com IBS/CBS". **O produto não emite NF-e — emite NFS-e**, e essa distinção não é terminológica. O achado estrutural central da pesquisa de modelagem é que o grupo IBSCBS **não é o mesmo objeto** nos dois documentos: na NF-e é um grupo único que o emitente calcula e transmite; na NFS-e ele existe em dois lugares, um **declarado** pelo prestador na DPS e outro **calculado** pelo Ambiente de Dados Nacional. Tudo abaixo trata de NFS-e. Se em algum momento o produto passar a emitir NF-e de mercadoria, praticamente nada desta auditoria se aproveita no domínio tributário.

## 0.1. O que mudou desde a auditoria original

Resolvidos: **C1** (IDOR via migration real), **C2** (já estava — o relatório original auditou um espelho velho), **C3** (SQL solto), **M2** (comparação em tempo constante). Parciais: **C4** (provider existe e é testado; falta credencial e habilitação), **C5** (modelagem existe; falta caminho de dados e a tabela oficial).

Estado do Definition of Done: typecheck, lint, **138 testes** e build passando.

---

## 1. O que impede, hoje, a emissão de uma NFS-e válida com IBS/CBS

Sete bloqueios. Os três primeiros impedem qualquer emissão real; os quatro seguintes impedem que ela saia **correta** com IBS/CBS.

### B1 — Não existe emissor habilitado (bloqueio externo, não de código)

Nenhuma empresa cadastrada na Focus NFe; sem inscrição municipal; sem certificado A1 anexado. NFS-e é ISS, que é municipal: nenhum município autoriza nota — nem em homologação — para prestador sem inscrição municipal. Enquanto isso não existir, nada abaixo pode ser validado ponta a ponta.

### B2 — `provider_fiscal` está fixo em `mock`, sem caminho de produto para trocar

`empresas.provider_fiscal` tem default `'mock'` e **não existe nenhum campo em `dadosFiscaisSchema` nem no formulário de configurações** para alterá-lo. O `FocusNfeProvider` está implementado e registrado, mas nenhum tenant consegue chegar até ele. Verificado: `provider_fiscal` só aparece em `emitir-nfse.ts:98` (leitura) e em comentários.

### B3 — O grupo IBSCBS não tem caminho de dados até o provider

Este é o achado mais relevante desta auditoria e o que redimensiona o que o C5 entregou. `DeclaracaoTributariaIBSCBS` existe como tipo em `provider.ts` e é consumida em `focusnfe.ts`. Fora desses dois arquivos, **não existe em lugar nenhum**:

- `notas_fiscais` não tem coluna para `cst`, `cClassTrib`, `cCredPres`, `gTribRegular` ou `gDif`;
- `solicitarEmissaoSchema` (`services/notas.ts:15-30`) não aceita nenhum desses campos;
- `emitir-nfse.ts` monta `servico.reforma` sem `declaracao` nem `intencao`;
- nenhum formulário coleta CST ou cClassTrib.

Consequência: hoje a declaração só é preenchível chamando o provider diretamente de um teste. **O C5 entregou o vocabulário e a validação, não o fluxo.** Isso não foi omissão silenciosa — a modelagem tinha que vir antes —, mas precisa ser dito com clareza para não se confundir "C5 implementado" com "grupo IBSCBS funcionando".

### B4 — A tabela `cclasstrib_ibscbs` está vazia, e ninguém a lê

164 códigos oficiais, zero importados (conferível pela view `cclasstrib_conferencia`). Além disso, `validarDeclaracao()` aceita `cClassTribConhecidos` como opção, mas **nenhum chamador passa esse conjunto** — inclusive o `FocusNfeProvider`. Ou seja: mesmo depois de importar os 164 códigos, a validação continuará sem consultá-los até existir um serviço que leia a tabela e injete o conjunto.

### B5 — Não existe mapeamento negócio → CST/cClassTrib

O `RegimeIbsCbs` tem 5 valores; a tabela oficial tem 164 códigos, cada um amarrado a um artigo da LC 214/2025. Não há função, tabela ou tela que faça essa ponte. É a decisão que a própria pesquisa marca como **contábil, não técnica**.

### B6 — Alíquotas continuam hardcoded para 2026 (item C6, ainda aberto)

`aliquotasReferencia(competencia)` recebe a competência, valida que é um ano, **e devolve `{ cbs: 0.009, ibs: 0.001 }` para qualquer ano**, inclusive 2030. É o risco de subdeclaração silenciosa a partir de 01/01/2027. O parâmetro na assinatura dá a aparência de que a vigência é tratada.

### B7 — A base de cálculo do IBS/CBS não segue a fórmula da NT-004

`services/notas.ts:42` usa `baseCentavos: dados.valorServicoCentavos` — o valor bruto do serviço. A fórmula confirmada por transcrição literal é:

```
vBC = vServ − descIncond − vCalcReeRepRes − vISSQN − vPIS − vCOFINS   (até 2026)
vBC = vServ − descIncond − vCalcReeRepRes − vISSQN                    (até 2032)
```

A dedução do ISSQN é permanente durante toda a transição. Hoje o sistema **superestima a base**, e portanto o IBS/CBS destacado. Em 2026 isso é informativo; a partir de 2027 passa a ser recolhimento a maior.

---

## 2. Pendências do `PENDENCIAS_C5` — por que cada uma não foi implementada

As sete pendências foram escritas em código de propósito, para não virarem "resolvido" por esquecimento. Nenhuma delas é dívida acidental.

**P1 — Importar os 164 cClassTrib.** Não implementada porque **os dados não existem no material entregue**. A pesquisa confirmou a contagem ("Exibindo 164 de 164 registros") e a distribuição por CST, mas as 164 linhas ficaram no relatório de origem. Semear parcialmente uma tabela de enquadramento fiscal seria pior que deixá-la vazia: alguém leria as poucas linhas presentes como se fossem a tabela inteira. Depende só de dado.

**P2 — Mapeamento negócio → CST/cClassTrib.** Não implementada porque é **decisão contábil**. Escolher que uma consultoria de TI cai no cClassTrib X e uma clínica no Y exige interpretar qual artigo da LC 214/2025 se aplica a cada atividade. Um palpite meu aqui viraria enquadramento fiscal errado com aparência de funcionalidade — exatamente o risco #2 da auditoria original. A própria `reforma.ts` já alertava "confirme com um contador antes de usar em produção".

**P3 — Papel real do NBS.** Não implementada porque **a fonte primária não pôde ser lida**: o Anexo VIII (correlação NBS ↔ cIndOp ↔ cClassTrib) e o Anexo VI foram bloqueados por proxy no `.zip` do gov.br. A hipótese mais sustentada é que existe um `cTribNac` de 6 dígitos e que o NBS funciona como tabela de correlação/validação cruzada, não campo livre. Hoje `codigoNbs` é string opcional. Mudar isso sem o Anexo seria trocar uma incerteza por outra.

**P4 — Caminho XML de `opSimpNac`/`regApIBSCBSSN`.** Os tipos e os códigos (1..4 e 1..3) estão modelados e testados, mas **não vão ao payload** porque não se confirmou se esses campos ficam dentro ou fora do grupo IBSCBS. Enviar num caminho errado é rejeição de schema.

**P5 — Fórmula de base de cálculo da NT-009 vs. NT-004.** Não resolvida porque as duas fórmulas são diferentes e **não se confirmou se a NT-009 substitui ou coexiste** com a NT-004. Implementar a errada erra a base de todo o cálculo — ver B7.

**P6 — Data de obrigatoriedade do preenchimento do grupo.** Não implementada porque **não existe.** O Ato Conjunto RFB/CGIBS nº 4/2026 rege a obrigatoriedade de **emissão do documento** (1º/10/2026 para serviços em geral, 1º/01/2027 para Simples), não a de **preenchimento do IBSCBS**; e a NF-e teve as datas de produção **suspensas** na NT 2025.002 v1.51. Por isso o grupo ficou opcional e controlado por flag, e não por calendário. Travar numa data inventada seria pior que não travar.

**P7 — Validação contra o XSD oficial.** Não feita porque **o ambiente de pesquisa teve acesso direto a domínios `.gov.br` bloqueado** nas três pesquisas. Toda a informação oficial veio por fetch mediado ou extração de DOM. Exige alguém baixar o XSD manualmente fora deste ambiente.

---

## 3. Campos, regras e validações da reforma ainda ausentes

### 3.1. Campos da DPS não modelados

Comparando com a estrutura confirmada (`.../DPS/infDPS/IBSCBS/`):

| Campo/grupo | O que é | Estado |
|---|---|---|
| `finNFSe` | 0=regular · 1=crédito · 2=débito | Ausente |
| `indFinal` | uso/consumo pessoal | Ausente |
| `cIndOp` | código indicador da operação (Anexo VII) | Ausente |
| `tpOper` / `tpEnteGov` / `xTpEnteGov` | operações com entes governamentais | Ausente |
| `gRefNFSe` | NFS-e referenciadas (até 99) | Ausente |
| `indZFMALC` | alíquota zero de CBS na ZFM/ALC | Ausente |
| `dest/` | **destinatário para fins de IBS/CBS** | Ausente |
| `imovel/` | inscrição imobiliária, cCIB | Ausente |
| `gReeRepRes` | reembolsos/repasses já tributados | Ausente |
| `cCredPres` | código de crédito presumido | Tipo existe, sem tabela |
| `gPgtoVinc` | vinculação com a transação de pagamento | Ausente |
| `opSimpNac` / `regApIBSCBSSN` | Simples Nacional / regime híbrido | Tipos existem, não vão ao payload |
| `cTribNac` | Código de Tributação Nacional (6 dígitos) | Ausente |
| CST de PIS/COFINS (2 dígitos) | ramo **paralelo**, fora do IBSCBS | Ausente |

Dois merecem destaque por serem armadilhas silenciosas. **`dest/` não é o `tomador`**: a estrutura oficial prevê que o destinatário para fins de IBS/CBS pode divergir de quem contratou o serviço, e o sistema hoje trata os dois como a mesma entidade. E **`gReeRepRes`** entra na fórmula da base de cálculo via `vCalcReeRepRes` — sem ele, a base de quem trabalha com reembolso/repasse sai errada por construção.

### 3.2. Campos do lado calculado (retorno) não persistidos

`ResultadoCalculoIBSCBS` existe como tipo, mas o `FocusNfeProvider` **não faz parse** desses campos no retorno e **não há colunas** para eles. Ficam perdidos: município de incidência, `vBC` efetivo, e por esfera (IBS-UF, IBS-Município, CBS) a alíquota parametrizada, o percentual de redução, a alíquota efetiva e o valor. São o dado de auditoria que prova o que o Fisco calculou.

### 3.3. Validações ausentes

- Regra granular obrigatório/vedado por campo para cada CST (lacuna 10 da pesquisa — documento de "Regras de Validação" não acessado). Hoje só os indicadores de alto nível estão implementados.
- Coerência entre `codigo_servico`/NBS e o `cClassTrib` declarado (depende do Anexo VIII).
- Elegibilidade de regime diferenciado — item **C7** da auditoria original, **ainda 100% aberto**: qualquer operador marca "redução de 60%" para qualquer nota.
- Bloqueio de `simples_por_fora = true` quando `regimeTributario = 'mei'` — item **A5**, verificado como ainda ausente (`dadosFiscaisSchema` não tem `.refine()`).
- Obrigatoriedade do NBS por regime tributário — item **A7**, ainda opcional para todos.
- Vigência de alíquota por competência — item **C6**, ver B6.
- `simples_por_fora` continua **decorativo**: verificado que aparece só em schema, CRUD e UI, nunca em cálculo. Item **A6**.

### 3.4. Limitações estruturais

Nota de **item único** — não há array de itens de serviço, então nada de `vBC` por item nem totalizadores. Nenhuma **geração ou validação de XML** local: dependemos inteiramente de o provider devolver a URL pronta. E não existe **feature flag por competência** para ligar o preenchimento do grupo, que é o mecanismo que P6 exige.

---

## 4. Depende só de dado oficial × exige desenvolvimento

**Só dado oficial** (a implementação é mecânica depois que o dado chega): importar os 164 cClassTrib; tabela de `cCredPres` (Anexo IV); tabela de `cIndOp` (Anexo VII); correlação NBS ↔ cClassTrib (Anexo VIII); `dIniVig`/`dFimVig` por cClassTrib; alíquotas de referência de 2027+; caminho XML de `opSimpNac`/`regApIBSCBSSN`; resolução NT-004 vs. NT-009; XSD oficial.

**Exige desenvolvimento** (nenhum dado externo trava): caminho de dados do IBSCBS ponta a ponta (B3); serviço que leia a tabela de domínio e injete em `validarDeclaracao` (B4); seletor de `provider_fiscal` (B2); fórmula da base de cálculo (B7 — a fórmula até 2026 já está confirmada); parametrização de vigência (B6 — a estrutura, não os números); parse e persistência do resultado calculado; feature flag; bloqueio MEI × por fora; efeito real de `simples_por_fora`; itens múltiplos.

**Exige decisão de negócio/contábil**: o mapeamento negócio → CST/cClassTrib (B5) e a política de elegibilidade de regime diferenciado (C7).

---

## 5. Plano de execução por prioridade

Esforço: **P** ≈ até 1 dia · **M** ≈ 1 a 3 dias · **G** ≈ 1 semana ou mais.

### Crítico — sem isto não há emissão válida com IBS/CBS

| # | Item | Esforço | Depende de |
|---|---|---|---|
| 1 | Cadastrar emissor na Focus + inscrição municipal + certificado A1 + habilitar homologação | M | Empresa de testes ou real |
| 2 | Caminho de dados do IBSCBS ponta a ponta: migration com colunas, `solicitarEmissaoSchema`, motor, UI (B3) | M | — |
| 3 | Importar os 164 cClassTrib + serviço que lê a tabela e injeta em `validarDeclaracao` (B4) | P após o dado | Dado oficial |
| 4 | Fórmula da base de cálculo `vBC` com dedução de ISSQN (B7) | P | Resolver NT-004 × NT-009 para o caso completo |
| 5 | Parametrizar `aliquotasReferencia()` por vigência (B6 / C6) | P | Estrutura sim; números de 2027+ não |
| 6 | Seletor de `provider_fiscal` nas configurações (B2) | P | — |
| 7 | Mapeamento negócio → CST/cClassTrib (B5) | G | **Contador** |
| 8 | Validação de elegibilidade de regime diferenciado (C7) | M | Política de negócio |

### Alto — antes de qualquer tráfego real

| # | Item | Esforço |
|---|---|---|
| 9 | Bloquear MEI + `simples_por_fora` (A5) | P |
| 10 | Parse e persistência do `ResultadoCalculoIBSCBS` (3.2) | M |
| 11 | Feature flag por competência para o grupo IBSCBS (P6) | P |
| 12 | Efeito real de `simples_por_fora` no crédito B2B, com data de opção (A6) | M |
| 13 | Modelar `dest/` separado do tomador (3.1) | M |
| 14 | CI/CD rodando o DoD a cada PR (A1) — verificado: `.github/workflows` ausente | P |
| 15 | `middleware.ts` para refresh de sessão (A3) — verificado ausente, apesar do comentário no código | P |
| 16 | Open redirect em `/auth/callback?next=` (A4) — verificado ainda aberto | P |
| 17 | Obrigatoriedade do NBS por regime (A7) | P | 
| 18 | Corrigir textos: landing "validação automática de CST" e ajuda "NBS substitui o código municipal" (A11) — ambos verificados ainda presentes | P |
| 19 | Paginação em `listarClientes`/`statusDasNotas` e `GROUP BY` no banco (A8) — verificado: `statusDasNotas` ainda carrega todas as notas do tenant | P |
| 20 | Rate limiting nas rotas expostas (A10) | M |

### Médio

| # | Item | Esforço |
|---|---|---|
| 21 | `gReeRepRes` (reembolsos/repasses) e efeito na base | M |
| 22 | `cIndOp`, `indZFMALC`, `finNFSe`, `indFinal` | M |
| 23 | `opSimpNac`/`regApIBSCBSSN` no payload | P após P4 |
| 24 | Magic bytes do certificado A1 (M1) — verificado: valida só extensão | P |
| 25 | Escapar HTML no template de e-mail (M3) — verificado: interpolação crua | P |
| 26 | `INNGEST_SIGNING_KEY`/`INNGEST_EVENT_KEY` no schema Zod (M4) — verificado ausente em `env.ts` e `.env.example` | P |
| 27 | Totais de CBS/IBS no dashboard (M8) | P |
| 28 | Índice `notas_fiscais(empresa_id, created_at DESC)` (M10) — verificado ausente | P |
| 29 | `regime_ibscbs` de TEXT+CHECK para enum (M7) | P |
| 30 | Split payment / `gPgtoVinc` (M5) | M |
| 31 | Observabilidade estruturada (M6) | M |
| 32 | Fan-out do job de excedentes (A9) | G |
| 33 | LGPD: exportação/exclusão a pedido do titular (M9) | M |

### Baixo

| # | Item | Esforço |
|---|---|---|
| 34 | Itens múltiplos por nota | G |
| 35 | Geração/validação local de XML contra XSD | G |
| 36 | `imovel/`, `gRefNFSe`, `tpEnteGov` | M |
| 37 | Testes de `emitir-nfse.ts` e `cobrar-excedentes.ts` (B1 original) | M |
| 38 | Descartar formalmente Imposto Seletivo (B2 original) | P |
| 39 | `catch` genérico mais defensivo nas Server Actions (B3 original) | P |
| 40 | Processo de monitoramento de novas Notas Técnicas (B4 original) | — |

---

## 6. Caminho mais curto até uma NFS-e de homologação com IBS/CBS

Se o objetivo for provar o fluxo o quanto antes, a ordem é: **1 → 6 → 2 → 3 → 4/5**. Os itens 7 e 8 podem esperar, desde que a primeira emissão use um cClassTrib escolhido manualmente e conferido por contador, em vez de um mapeamento automático.

Duas coisas não devem ser antecipadas de jeito nenhum: **ligar o grupo IBSCBS em produção** antes de fechar P1, P2 e P7, e **tratar o mapeamento negócio → cClassTrib como problema de engenharia**. É o ponto onde um palpite errado vira enquadramento fiscal indevido com cara de funcionalidade pronta.
