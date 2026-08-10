# Agência Fiscal SaaS — Handoff completo

> Documento de passagem de contexto. Escrito em 06/08/2026 e **corrigido em 10/08/2026**,
> quando se descobriu que as seções 3 e 4 descreviam um estado que nunca existiu nesta
> máquina (ver §3.1).
> **Leia `CLAUDE.md` primeiro** — ele tem as 21 regras arquiteturais invioláveis.

---

## 1. O que é o projeto

SaaS multi-tenant de emissão de NFS-e (nota fiscal de serviço municipal) para
prestadores de serviço brasileiros, preparado para a Reforma Tributária (IBS/CBS).

**Stack:** Next.js 14 (App Router) · TypeScript strict · Supabase (Postgres + Auth +
RLS) · Inngest (motor de retry) · Zod · Asaas (cobrança) · Resend (e-mail).

**A proposta de valor** está na landing: a prefeitura cai, a nota não se perde. O motor
de retry insiste com backoff até emitir.

---

## 2. Regras de trabalho combinadas com o usuário

Estas não são preferências, são condições. Quebrar qualquer uma custou retrabalho antes.

1. **Ler `CLAUDE.md` antes de tocar em qualquer coisa.** 21 regras. Seguir o padrão
   existente, não inventar estilo novo.
2. **Nunca hardcode token/segredo.** Toda variável nova entra em `src/lib/env.ts`
   seguindo o padrão Zod já existente.
3. **Nunca editar `src/types/database.ts` à mão.** Sempre regenerar com
   `npx supabase gen types typescript --local`.
4. **Nunca criar `.sql` solto fora de `supabase/migrations/`.**
5. **Onde houver incerteza normativa** (obrigatoriedade do NBS, cronograma de split
   payment, papel do MEI no regime regular), **perguntar ao usuário ou marcar como
   pendência explícita no código** — nunca implementar como se fosse certeza.
6. **Definition of Done após qualquer mudança relevante:**
   `npm run typecheck && npm run lint && npm run test && npm run build`
7. **Passos pequenos, um commit por passo.** Nunca acumular muitas mudanças num commit.
8. **Reportar a cada passo:** o que foi corrigido, o que ficou pendente e por quê, e o
   resultado da DoD.
9. **Fase de testes, não produção.** Itens de segurança **não** podem ser adiados
   (C1 IDOR); itens puramente de escala (fan-out, rate limiting, APM) podem.

### Fluxo de entrega (importante)

O usuário está no Windows. O git na máquina dele travou uma vez por um `.git/index.lock`
órfão que **eu** criei, e o `device_bash` não consegue apagar arquivos. Desde então:

O fluxo original era: eu entrego **arquivos `.patch`** numerados em `_patches/` (via
`git format-patch`) e o usuário aplica com `git am`. **Esse fluxo foi a causa direta do
incidente da §3.1** — patches entregues, dados como aplicados, e nunca aplicados de fato.

**Combinado em 10/08/2026:** rodar git na máquina dele está liberado, com limites.
Autorizado por ele explicitamente, depois de a restauração ter sido verificada:

- **Pode:** `git add`, `git commit` em `main`, e comandos de leitura.
- **Não pode:** `git reset --hard`, `push --force`, apagar migrations ou patches, e
  qualquer coisa que altere histórico remoto. Não empurrar sem ele pedir.
- Os `.patch` continuam sendo versionados em `_patches/` como registro — o valor deles
  agora é histórico e de auditoria, não de entrega.
- Migrations: ele roda `npx supabase db reset` e regenera o `database.ts` (§4).

---

## 3. Estado atual — commits desta sessão

| Commit | Patch | O quê |
|---|---|---|
| `c69e105` | 0008, 0010–0013, 0015 | Aplicação real do código que faltava (ver §3.1) |
| `d3728ee` | — | B7 segunda metade: vBC ligado ao fluxo, da tela ao provider |
| `13c62fd` | 0014 | M4 chaves do Inngest · M3 escape HTML no e-mail · M1 magic bytes A1 · A11 textos |
| `0b63b9d` | — | Correção deste handoff |
| `89bffb0` | — | A1: CI rodando a DoD a cada push e PR |
| `bccd178` | — | C7 confirmação de regime diferenciado · A7 aviso do NBS |
| `b3683f7` | — | C7: persistência do registro da confirmação |
| `6bf3945` | — | A6: regime de apuração no Simples, com vigência |

**DoD no último commit:** typecheck OK · lint OK · **298 testes** em 19 arquivos · build OK.

**Nada foi empurrado.** Todos estes commits estão só em `main` local.

### 3.1. ⚠️ Por que a tabela acima foi reescrita — leia antes de confiar em qualquer handoff

A versão anterior desta seção listava cinco commits (`f1b5c5c`, `cd51aba`, `b4d8189`,
`379f896`, `409b759`) que **não existem no repositório**. O que existia de verdade eram
dois commits com mensagem que não correspondia ao conteúdo:

| Commit | Mensagem | Conteúdo real |
|---|---|---|
| `004f632` | "persiste grupo IBSCBS nas notas fiscais" | só os **arquivos** `.patch` 0008 e 0009 + `database.ts` |
| `6bd85c4` | "conecta grupo IBSCBS ao fluxo de emissão" | **só o arquivo** `_patches/0010-*.patch` |

O código estava parado na saída do patch 0007 — provado pelo hash do blob de
`src/lib/fiscal/ibscbs.ts` (`fd3521b`, que é o post-image do 0007). Seis patches de
código nunca tinham entrado. Consequências que ficaram ativas por dias: `aliquotasReferencia()`
devolvendo 0,9%/0,1% para qualquer ano (C6 dado como fechado), grupo IBSCBS gravando
colunas que ninguém escrevia, e nenhum middleware de sessão.

**A lição, que vale mais que o incidente:** mensagem de commit não é evidência. Um
handoff que diz "aplicado" também não. A verificação barata que teria pego isso em trinta
segundos:

```powershell
git rev-parse HEAD:src/lib/fiscal/ibscbs.ts   # compare com o `index` do patch
git show --stat <commit>                      # o commit toca código ou só _patches/?
```

Os patches, por sinal, estavam íntegros: a cadeia de blobs
`fd3521b → a9b8739 → 8caf05b → …` fechava, e os seis aplicaram em sequência sem um único
conflito. O `git am` do 0013 falhava porque a **pilha inteira** faltava, não por
divergência de conteúdo — diagnóstico que custou uma sessão inteira por ter sido lido
como "conflito no 0013".

### Migrations (10, todas aplicam limpas num Postgres 16 real)

```
20260705000000_init.sql
20260718000000_excedente_faturamento.sql
20260720000000_reforma_tributaria.sql
20260805120000_seguranca_transicao_e_onboarding.sql   ← C1 (IDOR) + C3
20260805180000_ibscbs_dominio.sql                     ← cst_ibscbs (18) + cclasstrib vazia
20260805200000_ibscbs_seed_tabelas_oficiais.sql       ← 164 cClassTrib + 13 cCredPres
20260805220000_ibscbs_complemento_colunas.sql         ← reduções, indicadores, aplica_nfse
20260806120000_notas_grupo_ibscbs.sql                 ← 8 colunas IBSCBS + FK composta
20260806140000_notas_base_calculo_ibscbs.sql          ← B7: componentes do vBC
20260806160000_indices_listagem.sql                   ← M10: índices
```

---

## 4. ✅ BLOQUEIO RESOLVIDO (10/08/2026) — e a regra de encoding que fica

O bloqueio anterior (`database.ts` fora de sincronia com as migrations) **não existe
mais**. O arquivo foi regenerado corretamente pelo usuário e verificado aqui: contém
`ibscbs_base_centavos`, `desconto_incondicionado_centavos`, `ajuste_base_centavos`,
`ajuste_base_tipo`, `issqn_centavos`, `pis_centavos`, `cofins_centavos` e o enum
`tipo_ajuste_base_ibscbs`. Está em **UTF-8 com BOM** (`EF BB BF`), não UTF-16.

O diagnóstico da versão anterior estava errado no alvo: o problema nunca foi o `db reset`
nem o encoding — era que o **código** do 0013 não tinha sido aplicado (§3.1). A migration
sempre esteve certa.

### Regra de ambiente (Windows/PowerShell) — não regride

`npx supabase gen types typescript --local > src/types/database.ts` grava **UTF-16LE**, e
o git passa a tratar o arquivo quase como binário. Use sempre:

```powershell
npx supabase gen types typescript --local | Set-Content -Encoding utf8 src/types/database.ts
```

Depois de regenerar, **confira**:

```powershell
$b=[IO.File]::ReadAllBytes('src/types/database.ts'); ($b[0..3] | % { $_.ToString('X2') }) -join ' '
# EF BB BF ... = UTF-8 (ok) | FF FE ... = UTF-16 (errado, regenerar)
```

Nunca "consertar" o arquivo à mão — ele é gerado (regra 3). Se outro arquivo gerado pelo
Supabase sofrer do mesmo problema, avisar o usuário antes de regenerá-lo.

### Migration pendente de aplicação local

`20260806160000_indices_listagem.sql` (M10) chegou com o 0015 e exige
`npx supabase db reset`. Ela **só cria índices**: não altera tipos e **não** pede
regeneração do `database.ts`.

---

## 5. O que já foi feito, em detalhe

### 5.1. Segurança

**C1 — IDOR na transição de status (crítico, fechado).** `transicionar_status_nota()`
passou a checar o tenant. Provado comportamentalmente num Postgres 16 real com shim de
auth/storage: `anon` negado, cross-tenant negado, dono permitido, `service_role`
permitido, transição inválida recusada, e `anon=false` em todas as funções
`SECURITY DEFINER`. Detalhe que quase passou: o Supabase concede privilégios direto ao
`anon`, então foi preciso `REVOKE ... FROM anon` nominalmente.

**C3 — onboarding atômico.** `criar_minha_empresa()` cria empresa + vínculo owner +
assinatura beta numa transação, `SECURITY DEFINER`, só em nome do próprio `auth.uid()`.

**A3 — `src/middleware.ts`.** Não existia, apesar de `lib/supabase/server.ts` engolir a
exceção do `setAll` com o comentário *"middleware cuida do refresh"* — promessa não
cumprida: o token de 1h nunca era renovado e o usuário era deslogado sozinho. O matcher
**exclui `api/**` de propósito**: webhooks (Focus, Asaas) e Inngest autenticam por token,
e um 307 para `/login` seria lido pelo provedor como falha de entrega. A decisão de rota
mora em `lib/rotas.ts`, fora do Edge Runtime, para ser testável direto.

**A4 — open redirect em `/auth/callback?next=`.** O agravante é o momento: a sessão **já
existe** quando o redirect acontece, então um destino externo recebe um usuário
autenticado vindo de um link que ostenta o nosso domínio. `destinoSeguro()` só aceita
caminho relativo à raiz, recusando `//host`, barra invertida em qualquer posição e
caracteres de controle inclusive percent-encoded (`/%09/`, `/%5c`, `/%2f%2f`) — decodifica
para inspecionar, nunca para devolver. `urlDeRedirecionamento()` confere a origem depois
da resolução.

**A5 — MEI × `simples_por_fora`.** `dadosFiscaisSchema` recusa a marcação fora do Simples
Nacional, e o campo some da tela nos outros regimes. **A questão normativa não foi
decidida por mim**: se o MEI pode em alguma hipótese optar pelo regime regular está
marcado como `PENDENTE` no schema. O que a validação sustenta é consistência do *modelo*.
A constante mora em `lib/fiscal/regimes.ts` porque `services/empresas.ts` importa
`node:crypto` e não pode entrar no bundle do browser.

**M2 — comparação de token do webhook em tempo constante** (`lib/webhook-token.ts`,
`crypto.timingSafeEqual`).

**M4 — chaves do Inngest.** `INNGEST_SIGNING_KEY` e `INNGEST_EVENT_KEY` não existiam em
lugar nenhum. Li o SDK (v3.54) em vez de supor: o modo é *inferido* de sinais de
plataforma, e em `validateSignature` há
`if (this._mode && !this._mode.isCloud) return { success: true }`. Num deploy sem esses
sinais (container simples, VM própria), a **verificação de assinatura é pulada por
completo** e `/api/inngest` — que executa a máquina de estados — aceita POST de qualquer
origem. A checagem agora é nossa e explícita.
**Detalhe de implementação que importa:** ela é *preguiçosa*. No topo do módulo quebrava
o `npm run build` em "Failed to collect page data", porque o Next importa o route handler
durante o build, quando `NODE_ENV` já é `production` mas as variáveis de runtime não
estão presentes. Foi adiada para a primeira requisição.

**M3 — escape de HTML no e-mail.** `nomeCliente` e `nomeEmpresa` iam crus para o template.
Vêm do banco, preenchidos por usuário, e o e-mail vai para um **terceiro** — o cliente do
nosso cliente. `href` tem tratamento à parte (escape não pega `javascript:`; ali a
checagem é de esquema, e URL recusada **omite** o botão). O assunto segue sem entidades
de propósito: é texto puro no cliente de e-mail.

**M1 — magic bytes do `.pfx`.** PKCS#12 é DER: `0x30` + comprimento em forma longa. Pega
`.pem`, `.cer`, PDF, ZIP renomeado. **Não** valida certificado nem senha — está escrito
no comentário para ninguém confundir com atestado.

### 5.2. Reforma tributária (IBS/CBS)

**Distinção que orienta tudo:** na NFS-e o grupo IBSCBS existe em **dois** lugares —
*declarado* pelo prestador na DPS, e *calculado* pelo Ambiente de Dados Nacional. Quem
calcula o valor final é o Fisco, a partir do CST/cClassTrib declarado. Empurrar valor
pronto pode divergir.

**Tabelas oficiais no banco.** 18 CST-IBS/CBS, 164 cClassTrib, 13 cCredPres.
Descobertas relevantes:
- Os quatro indicadores do cClassTrib são **ícones CSS** (`fa-check-circle`/
  `fa-minus-circle`), não texto — extração textual os perdia em silêncio.
- **Só 71 dos 164 valem para NFS-e.** Isso é imposto **no banco** por um truque de coluna
  gerada + FK composta em `(codigo, aplica_nfse)`.
- `200025` é o único código com redução assimétrica IBS/CBS (60% vs 100%) — foi o que
  justificou colunas separadas.

**C6 — vigência de alíquota.** `aliquotasReferencia()` lança `AliquotaNaoFixadaError` nos
anos sem Resolução do Senado, em vez de devolver o par de teste de 2026. **Consequência
que precisa estar clara: a emissão PARA a partir de 01/01/2027** até alguém configurar o
valor publicado (há o parâmetro `overridesAliquotas` para isso, sem deploy). Existe uma
proposta interna do Comitê Gestor (Resolução CGIBS 14, de 29/07/2026, IBS ~18,7%) que
**não** é fixação legal e por isso **não** está na tabela.

**B7 — fórmula da base de cálculo (vBC).** Resolvido nesta sessão lendo as NTs na fonte
(`gov.br/nfse` respondeu, depois de ter sido bloqueado por proxy em três pesquisas
anteriores).

> **P5 resolvida: NT-004 e NT-009 não divergem.** A NT-009 *atualiza* a NT-004 — mesma
> estrutura, com `vCalcReeRepRes` renomeado para `vCalcAjusteBCIBSCBS` e a alternativa
> `vCalcAjusteBCLocImoveis` acrescentada (locação de imóveis, subitem 99.03). A NT-009
> diz complementar/ajustar as anteriores, sem revogá-las.

```
até 2026:    vBC = vServ − descIncond − ajusteBC − vISSQN − vPIS − vCOFINS
2027 a 2032: vBC = vServ − descIncond − ajusteBC − vISSQN
```

Duas decisões que a NT **não** toma e ficaram marcadas como nossas: base negativa
**lança** em vez de grampear em zero; PIS/COFINS não-zero a partir de 2027 **lança** em
vez de ser descartado. O `vISSQN`, quando não informado, é derivado de
`(vServ − descIncond) × alíquota` (LC 116/2003 art. 7º) e o resultado carrega a flag
`issqnDerivado`. **Informar zero é diferente de não informar** — tem teste.

### 5.3. Providers e motor

`FiscalProvider` + registry por nome de `empresas.provider_fiscal` (regra 21).
`FocusNfeProvider` implementado (~470 linhas) com short polling, classificação
transiente/permanente, fallback para consulta quando a referência já existe, e
`validarGrupoIbsCbs()`. `MockFiscalProvider` para testar o motor.
`providersDisponiveis()` avalia disponibilidade pelo ambiente — a tela **não deixa
escolher provider sem credencial**, porque a escolha seria salva sem erro e só quebraria
depois, dentro do motor, com a nota já criada e o usuário fora da tela.

`carregarCClassTribConhecidos()` (`services/dominio-fiscal.ts`) tem cache de 10 min e
**falha apontando o seed** quando a tabela está vazia — devolver conjunto vazio faria toda
declaração ser recusada com a mensagem errada.

Webhook da Focus (`/api/webhook/focusnfe`) **reconsulta a API antes de gravar** e **não
faz transição de status** — decisão explícita do usuário, para preservar a consistência do
motor e evitar transições duplicadas.

### 5.4. Performance (A8/M10, último commit)

`listarClientes` trazia **todos** os clientes; `statusDasNotas` trazia **toda** nota e
contava em memória. Além da lentidão que cresce em silêncio, se houver `db-max-rows`
configurado no PostgREST a resposta vem truncada **sem erro** — a lista esconde clientes e
os totais do painel ficam errados sem nada indicar.
Agora: paginação com `range()` + `count: "exact"` e teto no próprio serviço; contagem com
`head: true` (quatro consultas, zero linhas trafegadas); faturamento recortado ao mês.
Telas acompanham, com busca por nome (curingas do LIKE escapados) e aviso quando o
seletor corta.

---

## 6. O que falta — por prioridade

### ✅ Fechado em 10/08/2026

**B7 segunda metade — o vBC está ligado ao fluxo** (commit `d3728ee`).
`solicitarEmissaoSchema` recebe os seis componentes, `solicitarEmissao` chama
`calcularBaseIbsCbs()` e grava resultado e termos nas colunas, o formulário de emissão
manual os coleta num `<details>` recolhido, `baseDeColunas()` reconstrói a base e o motor
a envia ao provider em `servico.reforma.baseCalculo`. O destaque de CBS/IBS passou a
incidir sobre o vBC, não mais sobre o valor bruto.

**Sobra uma ponta, registrada em `PENDENCIAS_C5` e no docstring de `montarPayload`:** o
vBC **chega** ao `FocusNfeProvider` mas **não é enviado** à API. Os nomes dos campos de
desconto incondicionado, ajuste de base e vBC não estão na documentação a que tivemos
acesso, e inventar nome de campo é pior que omitir — a nota sairia com o valor no lugar
errado em vez de sair sem ele. `valor_servicos` segue sendo o vServ **bruto**, que é o
que aquele campo pede; não trocar pelo vBC. Confirmar na homologação, junto da mesma
dúvida sobre o campo do CST.

**A1 — CI/CD** (`89bffb0`). `.github/workflows/ci.yml` roda a DoD a cada push e PR.
Ressalva registrada no próprio arquivo: garante que todo commit em `main` é verde, mas
**não** teria pego o incidente da §3.1 — o código antigo também compilava e passava.

**C7 — confirmação de regime diferenciado** (`bccd178` + `b3683f7`). Decisão do usuário:
confirmação explícita com registro, em vez de amarrar a CNAE. **Não valida
elegibilidade** — isso exige a correlação atividade ↔ regime, que é decisão contábil e
segue aberta. O que faz é tirar o "cliquei sem ver" e gravar quem confirmou e quando.

**A7 — NBS** (`bccd178`). Decisão do usuário: continua **opcional para todos**, com aviso
na tela para lucro presumido/real. As fontes divergem, e exigir o campo com base em fonte
não confirmada bloquearia emissão legítima de quem não tem o código em mãos.

**A6 — regime de apuração no Simples** (`6bf3945`). O booleano `simples_por_fora` foi
**removido**: não representava o que a NT-009 pede (regime de apuração POR TRIBUTO, com o
caso híbrido CBS-SN/IBS-regular). Agora são `situacao_simples_nacional` +
`regime_apuracao_ibscbs_sn` + `data_opcao_regime_regular`, e `intencaoDeColunas()` faz a
intenção chegar ao provider recortada pela vigência — nota anterior à opção sai como
`ambos_pelo_sn`. **O cálculo do crédito ao tomador NÃO foi feito**, de propósito: a regra
de crédito do Simples sob a LC 214/2025 é decisão contábil. A tela deixou de prometê-lo.

### 🟠 Alto — o que resta

- **UI do grupo IBSCBS** no formulário de nota, usando a view `cclasstrib_nfse` para
  oferecer só os 71 códigos válidos (e não os 164). **Atenção antes de codificar:**
  `PENDENCIAS_C5` registra que o mapeamento negócio → CST/cClassTrib é **decisão
  contábil**. Uma lista de 71 códigos sem orientação de escolha recria, em escala maior,
  exatamente o problema que o C7 acabou de mitigar — só que com 71 opções em vez de 5.
- **Correlação atividade ↔ regime diferenciado** (a outra metade do C7) e **regra de
  crédito do Simples** (a outra metade do A6). As duas são decisão contábil, não técnica.

### 🟡 Médio

- **M7** — `regime_ibscbs` de texto para enum (precisa de migration + types).
- **M8** — totais de CBS/IBS no dashboard.
- **RPC com `SUM()`** para o faturamento do mês (hoje ainda traz linhas do mês).
- Parse e persistência do **lado calculado** do retorno (`ResultadoCalculoIBSCBS`):
  município de incidência, `vBC` efetivo, alíquotas e valores por esfera. É o dado de
  auditoria que prova o que o Fisco calculou. Hoje se perde.

### 🔵 Depende só de dado oficial (implementação mecânica depois)

Alíquotas de referência de 2027+ (Resolução do Senado) · Anexo VIII (correlação NBS ↔
cClassTrib) · Anexo VII (`cIndOp`) · `dIniVig`/`dFimVig` por cClassTrib · caminho XML de
`opSimpNac`/`regApIBSCBSSN` · **XSD oficial** (nunca foi possível baixar: `.gov.br`
bloqueado por proxy nas pesquisas; exige alguém baixar manualmente).

### ⚫ Campos da DPS ainda não modelados

`finNFSe` · `indFinal` · `cIndOp` · `tpOper`/`tpEnteGov` · `gRefNFSe` · `indZFMALC` ·
**`dest/`** · `imovel/` · **`gReeRepRes`** · `gPgtoVinc` · `cTribNac` · CST de PIS/COFINS.

Dois merecem destaque por serem armadilhas silenciosas: **`dest/` não é o `tomador`** — o
destinatário para fins de IBS/CBS pode divergir de quem contratou, e o sistema hoje trata
os dois como a mesma entidade. E **`gReeRepRes`** entra na fórmula da base via ajuste —
sem ele, a base de quem trabalha com reembolso/repasse sai errada por construção.

### 🚫 Bloqueado pelo usuário (não insistir)

- **Focus NFe** — credenciais e homologação. Ele cuida depois. A integração está pronta
  até o ponto em que o `FOCUSNFE_TOKEN` é necessário. Ele não tem empresa constituída nem
  inscrição municipal; combinamos pessoa física / empresa fictícia para homologação.
- **Asaas** — o SMS de verificação do sandbox não chega no celular dele. Toda a
  integração está pronta até onde a API Key é necessária, com testes por mock.

---

## 7. Armadilhas conhecidas (não repita)

1. **`declaracaoDaNota` escrita dentro da função Inngest sem teste** foi reconhecida como
   a "ponte de falha silenciosa" e movida para `ibscbs.ts` como `declaracaoDeColunas`,
   com 5 testes incluindo o caso de percentual zero. **Não escreva lógica de domínio
   dentro do motor.**
2. **`z.input` vs `z.infer`** — schemas com `.default()` precisam de `z.input` no tipo de
   entrada, senão o typecheck dos testes quebra.
3. **`import type`** para manter módulos server-only fora do bundle do cliente
   (`ProviderInfo` é o exemplo).
4. **Idempotência de migration** — uma quebrou porque um `DROP CONSTRAINT` tinha FK
   dependente. Derrube a FK primeiro.
5. **Nunca confie em "está aplicado" — de ninguém, nem de um commit.** Já aconteceu com
   "sincronização concluída" (duas vezes), com este próprio handoff (§3.1) e com duas
   mensagens de commit. Verifique: `git show --stat <commit>` mostra se o commit tocou
   código ou só `_patches/`, e `git rev-parse HEAD:<arquivo>` comparado ao `index` do
   patch diz em qual patch o arquivo realmente parou.
6. **Patch que não aplica raramente é conflito de conteúdo.** O 0013 foi diagnosticado
   como "conflito" e custou uma sessão; na verdade faltavam os quatro patches abaixo
   dele. Antes de reimplementar à mão, cheque a cadeia de blobs `index aaaa..bbbb` dos
   patches — se o post-image de um é o pre-image do seguinte, a pilha está íntegra e
   aplica em ordem. Teste numa cópia isolada antes de tocar no repositório.
7. **Ao aplicar patches, exclua o que é gerado ou já existe:**
   `git apply --exclude=src/types/database.ts --exclude=<migration já presente>`. O
   `database.ts` regenerado pelo usuário é a versão correta (regra 3), e uma migration já
   no disco costuma ser byte a byte idêntica à do patch — conferir antes com um diff.
8. **Patch entregue como anexo de chat pode nunca ter chegado ao disco.** Foi o caso do
   0014, que existia só como citação neste handoff. Se um patch é citado mas
   `ls _patches/` não o mostra, ele **não** foi aplicado — procure o arquivo antes de
   reimplementar do zero.
6. **Sem Docker neste ambiente.** `supabase gen types` não roda nem com `--db-url`. Dá
   para subir um **Postgres 16 local** (`initdb` como usuário não-root — o Postgres recusa
   rodar como root) com um shim de `auth`/`storage` e validar as migrations de verdade.
   Foi assim que os CHECKs do vBC e os índices foram verificados.

---

## 8. Como continuar

Toda a lista da versão anterior foi concluída em 10/08/2026: estado verificado (§3.1),
`database.ts` destravado (§4), B7 (`d3728ee`), 0014 recuperado (`13c62fd`), A1
(`89bffb0`), C7 (`bccd178`+`b3683f7`), A7 (`bccd178`) e A6 (`6bf3945`).

O que resta está em §6. A regra que não muda: **A7 e C7 mostraram que perguntar custa uma
mensagem e escolher errado custa uma migration.** Os itens que sobraram — mapeamento
negócio → cClassTrib, correlação atividade ↔ regime, regra de crédito do Simples — são
todos decisão contábil. Perguntar, não escolher sozinho.

### Migrations que exigem `db reset` + regeneração de tipos

Quando uma migration mexe em COLUNA, o código que escreve nela só typecheca depois que o
usuário roda os dois comandos da §4. Nesta sessão isso aconteceu duas vezes (C7 e A6) e o
fluxo que funcionou foi: escrever a migration → pedir os dois comandos → **verificar** o
BOM e as colunas em `database.ts` → só então escrever o código. Não commitar migration
que derruba coluna separada do código que parava de usá-la: deixa `main` num estado em
que o código contradiz o banco.
