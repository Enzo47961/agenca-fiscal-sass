# Agência Fiscal SaaS — Handoff completo

> Documento de passagem de contexto. Escrito em 06/08/2026 e reescrito em **10/08/2026**,
> quando se descobriu que as seções 3 e 4 descreviam um estado que nunca existiu nesta
> máquina (ver §3.1). A mesma data cobre a pesquisa normativa nas fontes primárias (§5.5)
> e a correção dos privilégios de tabela (§5.6).
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

O usuário está no Windows. O fluxo original nasceu de um incidente antigo — o git travou
por um `.git/index.lock` órfão criado pelo agente — e virou: eu entrego **arquivos
`.patch`** numerados em `_patches/` (via `git format-patch`) e o usuário aplica com
`git am`. **Esse fluxo foi a causa direta do incidente da §3.1**: patches entregues, dados
como aplicados, e nunca aplicados de fato.

**Combinado em 10/08/2026:** rodar git na máquina dele está liberado, com limites.
Autorizado por ele explicitamente, depois de a restauração ter sido verificada:

- **Pode:** `git add`, `git commit` em `main`, e comandos de leitura.
- **Não pode:** `git reset --hard`, `push --force`, apagar migrations ou patches, e
  qualquer coisa que altere histórico remoto. Não empurrar sem ele pedir.
- Os `.patch` continuam sendo versionados em `_patches/` como registro — o valor deles
  agora é histórico e de auditoria, não de entrega.
- **Migrations e tipos: o agente roda.** `npx supabase db reset`, `gen types` e consultas
  ao Postgres local funcionam nesta máquina (armadilha 9). Valide a migration você mesmo
  antes de reportar — a versão anterior deste handoff dizia que não dava, e isso custou
  duas idas e voltas por migration.

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
| `9ba88e0` | — | Atualização deste handoff |
| `810b06f` | — | Fonte oficial versionada do cClassTrib + redução pela tabela (§5.5) |
| `b5a1df8` | — | `NUMERIC(8,5)` na redução oficial — `(7,5)` não comporta 100% |
| `1d2c4eb` | — | UI da classificação por item + **GRANTs de tabela** (§5.6) |
| `b96d667` | — | CLI: código de saída e diff legível |
| `01d6547` | — | Envio de CST, componentes da base e regime do Simples à Focus |
| `ed08f32` | — | Alinhamento de `PENDENCIAS_C5` e da tela |

**DoD no último commit:** typecheck OK · lint OK · **332 testes** em 20 arquivos · build OK,
mais `npx supabase db reset` limpo com 14 migrations.

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

### Migrations (14, aplicam limpas — `db reset` verificado em 10/08/2026, Postgres 17)

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
20260810120000_regime_diferenciado_confirmacao.sql    ← C7: quem confirmou e quando
20260810140000_regime_apuracao_simples_nacional.sql   ← A6: derruba simples_por_fora
20260810160000_fontes_oficiais_cclasstrib.sql         ← texto oficial, vigência, Anexo VIII
20260810180000_grants_de_tabela.sql                   ← §5.6: privilégios que faltavam
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

### Nenhuma migration pendente

Todas as 14 estão aplicadas no banco local e o `database.ts` está regenerado e conferido
(UTF-8 com BOM). Quem valida agora é o próprio agente — ver armadilha 9.

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

### 5.4. Performance (A8/M10)

`listarClientes` trazia **todos** os clientes; `statusDasNotas` trazia **toda** nota e
contava em memória. Além da lentidão que cresce em silêncio, se houver `db-max-rows`
configurado no PostgREST a resposta vem truncada **sem erro** — a lista esconde clientes e
os totais do painel ficam errados sem nada indicar.
Agora: paginação com `range()` + `count: "exact"` e teto no próprio serviço; contagem com
`head: true` (quatro consultas, zero linhas trafegadas); faturamento recortado ao mês.
Telas acompanham, com busca por nome (curingas do LIKE escapados) e aviso quando o
seletor corta.

### 5.5. Pesquisa normativa e a classificação A/B/C

A premissa anterior — "o mapeamento negócio → cClassTrib é decisão contábil" — estava
**parcialmente errada**, e foi a pesquisa nas fontes primárias que mostrou isso.

**Fontes obtidas (todas primárias, nenhum blog fundamenta regra):**

| Documento | Versão | O que trouxe |
|---|---|---|
| [NT SE/CGNFS-e nº 009](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nt-009-se-cgnfse-v1-0-1.pdf) | v1.0.1 | Caminhos XML e ocorrências |
| Anexo VI — Leiautes e RN | V1.04.00 | 774 regras com código de rejeição |
| Anexo VII — cIndOp | V1.02.00 | 40 indicadores de operação |
| Anexo VIII — Correlação | V1.01.00 | **208 itens LC 116 → NBS, cIndOp, cClassTrib** |
| [Portal SVRS](https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributaria) | pub. 22/06/2026 | Base completa em JSON, com vigências |

Os anexos são `.xlsx`; há um leitor de `xlsx` e um extrator de PDF em Python no scratchpad
da sessão, ambos sem dependências externas. **A planilha do Anexo VIII tem 2258 células
mescladas** — sem tratá-las, os itens 04.02–04.21 (saúde) aparecem sem cClassTrib quando
na verdade herdam `200029`. É a mesma classe de erro dos ícones CSS.

**A classificação, e por que a linha foi traçada assim:**

- **A — 86 itens.** Única correlação é `000001` (tributação integral, art. 4º da
  LC 214/2025). Preenchido automaticamente. Três propriedades justificam, e as três
  precisam valer juntas: é a tributação **cheia** (não reivindica benefício, o erro
  possível é pagar a mais), não tem redução (nada para divergir das RN 104/111/118) e não
  exige grupo condicional.
- **B — 121 itens.** A UI oferece **só os códigos correlacionados àquele item** — em geral
  um ou dois. Os `8200xx` foram rebaixados de A para B por decisão consciente: pressupõem
  regime específico do emitente, e **correlação não é elegibilidade**.
- **C — 1 item** (`99.01.01`). Sem sugestão.

**Duas ressalvas da categoria A, encontradas na auditoria e ainda abertas:** o `cIndOp` não
é unívoco (37 dos 86 itens têm mais de um) e não é preenchido; e a coluna `ADQ EXTERIOR` do
Anexo VIII vale `N` em **100%** das linhas — exportação está fora do escopo da correlação, e
a automação preencheria `000001` mesmo assim (erro para o lado de tributar a mais).

**Conferência da nossa tabela:** códigos (164), CST (18) e indicadores deram **zero
divergência** contra a fonte. O que faltava era `descricao_oficial` (as nossas eram
paráfrases — o `200002` omitia "tratores, máquinas e implementos agrícolas"), vigência
(`220001/2/3`, encerrados em 01/01/2026, todos `IndNfse=false`) e procedência.

**Reduções:** as RN 104/111/118 (rejeições E1543/E1547/E1552) exigem que o percentual seja
o da tabela do cClassTrib. `fatoresReducao()` faz a tabela mandar e **lança** quando o
regime afirmado a contradiz. O enum `RegimeIbsCbs` só decide quando não há cClassTrib.

### 5.6. GRANTs de tabela — o defeito que quase passou

Nenhuma migration jamais concedeu privilégio de tabela: o projeto se apoiava só em RLS, e
**RLS não concede acesso, apenas restringe linhas de quem já tem o privilégio**. Funcionava
porque o banco de desenvolvimento era antigo; no Postgres 17 do CLI atual o schema `public`
nasce trancado (`pg_default_acl` concede só `D/x/t/m`). Em qualquer ambiente recriado do
zero, **toda leitura e escrita via PostgREST falhava com "permission denied"** — silencioso
até alguém abrir a aplicação. Mesma classe do C1/C3.

Apareceu porque o CLI de sincronização, rodando com `service_role`, não conseguiu ler
`cclasstrib_ibscbs`. Corrigido espelhando as policies, sem ampliar nada. Duas escolhas que
não devem ser afrouxadas: `notas_fiscais` tem `SELECT`+`INSERT` mas **não `UPDATE`** — um
UPDATE direto contornaria a máquina de estados onde mora a correção do IDOR; e
`authenticated` fica **fora** das default privileges, para que tabela nova nasça
inacessível e receba grant explícito junto da policy dela.

---

## 6. O que falta — por prioridade

### ✅ Fechado em 10/08/2026

**B7 segunda metade — o vBC está ligado ao fluxo** (commit `d3728ee`).
`solicitarEmissaoSchema` recebe os seis componentes, `solicitarEmissao` chama
`calcularBaseIbsCbs()` e grava resultado e termos nas colunas, o formulário de emissão
manual os coleta num `<details>` recolhido, `baseDeColunas()` reconstrói a base e o motor
a envia ao provider em `servico.reforma.baseCalculo`. O destaque de CBS/IBS passou a
incidir sobre o vBC, não mais sobre o valor bruto.

**A ponta que sobrava foi resolvida — e o diagnóstico anterior estava errado.** O vBC
**não deve** ser enviado: no Anexo VI ele mora em `NFSe/infNFSe/IBSCBS/valores/vBC`, lado
NFS-e, **calculado pelo Ambiente de Dados Nacional**. A DPS manda os componentes, e agora
mandamos (`01d6547`): CST, `cCredPres`, desconto incondicionado, PIS, COFINS, `opSimpNac`
e `regApTribSN`. `valor_servicos` segue sendo o vServ **bruto** — não trocar pelo vBC, e há
teste garantindo que ele não vaza para o payload.

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

**UI do grupo IBSCBS** (`1d2c4eb`). Feita, e melhor do que o plano original: em vez de
oferecer os 71 códigos, oferece **só os correlacionados ao item de serviço** — um ou dois
na prática. Ver §5.5.

**Sincronização das tabelas oficiais** (`810b06f`, `b96d667`). `npm run fiscal:sync` faz
diff lógico contra o banco e só grava com `--apply`. Idempotente, verificado com fonte
simulada em cinco cenários. Código ausente na fonte **não é apagado** — nota já emitida
precisa continuar resolvível — e ausências não contam para o código de saída, senão um
portão de CI ficaria vermelho para sempre.

### 🟠 Alto — o que resta

**Três dependem de uma única conversa com a Focus na homologação:**

- **Ajuste de base** (`vCalcAjusteBCIBSCBS` / `vCalcAjusteBCLocImoveis`) não aparece na
  referência de campos deles. Segue sem envio: quem trabalha com reembolso/repasse ou
  locação de imóvel tem o ajuste **ignorado pelo Fisco**.
- **Lado calculado do retorno** (`gTribSN` com `pIBSSN`/`vIBSSN`/`pCBSSN`, e
  `vReceitaBrutaSN`). É o que prova quanto de crédito o tomador aproveita (art. 47 §9º II
  da LC 214/2025). Os campos existem no Anexo VI, mas a referência de **retorno** da Focus
  respondeu **HTTP 403**. **Nenhuma coluna foi criada** para isso de propósito: coluna sem
  quem a preencha é o defeito que o A6 corrigiu.
- **`cIndOp`** não é preenchido, e 37 dos 86 itens da categoria A têm mais de um possível.
  É `0-1` no leiaute, então não gera rejeição hoje.

**Dois são decisão contábil, não técnica:**

- **`cClassTribReg`** — qual par declarar no `gTribRegular`. Sem isso, `550016` (Reidi) e
  `550022` (Rehidro) são **recusados na criação da nota** (falha fechada). Nenhum dos dois
  é correlacionado pelo Anexo VIII, então a UI nunca os oferece.
- **Correlação atividade ↔ regime diferenciado** (a outra metade do C7) e a **regra de
  crédito do Simples** (a outra metade do A6).

**Com prazo:** as empresas precisam comunicar **em setembro de 2026** se ficam no regime
unificado ou migram para o híbrido (art. 41 §3º da LC 214/2025). O modelo do A6 já
comporta as duas respostas; falta a tela avisar quem ainda não decidiu.

### 🟡 Médio

- **M7** — `regime_ibscbs` de texto para enum (precisa de migration + types).
- **M8** — totais de CBS/IBS no dashboard.
- **RPC com `SUM()`** para o faturamento do mês (hoje ainda traz linhas do mês).
- Parse e persistência do **lado calculado** do retorno — promovido para Alto (§6) depois
  da pesquisa: os campos oficiais são conhecidos, o que falta são os nomes na resposta da
  Focus.

### 🔵 Depende só de dado oficial (implementação mecânica depois)

**Resolvidos em 10/08/2026 pela pesquisa (§5.5):** Anexo VIII (correlação, agora em
`item_lc116_cclasstrib`) · Anexo VII (`cIndOp`, baixado) · `dIniVig`/`dFimVig` por
cClassTrib (colunas `vigencia_*`) · caminho XML de `opSimpNac`/`regApIBSCBSSN` (fica em
`prest/regTrib/`, **fora** do grupo IBSCBS; `opSimpNac` é `1-1`).

**Ainda abertos:** alíquotas de referência de 2027+ (Resolução do Senado) · **XSD
oficial** — o `.gov.br` responde normalmente agora, então os `.xlsx` e o PDF foram
baixados sem problema; o XSD segue por baixar.

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

## 6.1 Processo de trabalho e ambiente de homologação (decidido em 14/08/2026)

### A partir de agora: branch + Pull Request

Até hoje **todos os commits foram direto na `main`** — nenhum branch jamais existiu no
repositório. O `.github/workflows/ci.yml` já estava configurado para rodar nos dois gatilhos:

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

Só que, sem PR nenhum, ele só rodava **depois** do push — com o código já em produção. Avisava
que quebrou; não impedia de quebrar. Metade do arquivo nunca foi exercitada.

**Fluxo combinado:** trabalhar em branch, abrir PR, deixar o CI passar, então mesclar. O CI vira
portão, e não relatório póstumo.

### Homologação fica para o lançamento — e o motivo

A decisão foi do usuário, e o raciocínio dele é o correto: **Vercel Pro e Supabase Pro serão
assinados de qualquer forma no lançamento** — o primeiro porque o plano Hobby proíbe uso
comercial, o segundo porque o Free não tem backup.

E o **Supabase branching é recurso do plano Pro**. Montar homologação agora exigiria um segundo
projeto Free como banco de teste, que viraria descarte no dia da assinatura — o branching
entrega a mesma coisa melhor: banco efêmero por PR, criado e destruído sozinho, sem um segundo
projeto para manter sincronizado com as migrations.

**Portanto: não criar ambiente duplicado.** No lançamento, ligar o branching do Supabase ao
fluxo de PR que já estará em uso.

### Enquanto isso, o preview aponta para o banco de produção

Aceitável **hoje** — a base tem um usuário de teste e nenhuma nota real. Deixa de ser aceitável
no primeiro cliente de verdade, e é esse o gatilho para ligar o branching.

### Variáveis de ambiente por escopo (conferido em 14/08/2026)

As três `NEXT_PUBLIC_*` que o build exige estão em **Production e Preview** — preview não
quebra no build, que era o risco.

`RESEND_API_KEY` e `EMAIL_ALERTAS` estão **só em Production**, e isso é **deliberado**: são
opcionais no schema, então não quebram o build, e a ausência impede que um teste em branch
dispare e-mail para um tomador real. **Não acrescentar essas duas ao escopo Preview.**

---

## 6.2 O que foi entregue em 14–15/08/2026

Fecha as sete lacunas listadas na auditoria de prontidão. Todas com DoD verde e
verificação no banco, não só typecheck.

| Entrega | Migrations | O ponto que decidiu o desenho |
|---|---|---|
| Convites + papéis com efeito | 20260814120000 | O papel passou a valer na POLICY, não no código |
| Cancelamento de NFS-e | 140000, 150000 | Recusa devolve a nota a `emitida` — ela continua válida |
| Importação em massa (CSV) | — | Não é tudo ou nada; relatório completo na primeira passada |
| Painel de parceiro / relatórios | 170000 | `LEFT JOIN`: empresa sem nota PRECISA aparecer |
| LGPD | 190000 | Anonimizar NÃO apaga nota fiscal |
| Monitoramento | 200000 | Alerta por PROPORÇÃO de falha, não contagem |

### As três decisões que mais importam

**Papel vale no banco.** A prática de mercado é checar papel na aplicação. Aqui a
regra está na policy do Postgres: um operador que contorne a tela — Server Action
chamada direto, cliente HTTP próprio — continua barrado. Verificado com dois
usuários e JWT: trocar regime devolve `UPDATE 0`; apagar cliente, `DELETE 0`.

**Prazo de cancelamento não é validado, de propósito.** Ele é MUNICIPAL (DF até o
dia 15 do mês seguinte, Recife 60 dias, Jundiaí veda após 180). O sistema tenta e
reporta a resposta da prefeitura, com a mensagem original. Prazo chutado
bloquearia cancelamento legítimo num município e daria falsa esperança em outro.

**LGPD não apaga nota fiscal.** O titular tem direito à eliminação (art. 18, VI),
e a nota tem de ser guardada (CTN art. 195). O art. 16, I da própria LGPD resolve:
conserva-se para cumprir obrigação legal. Anonimiza o cadastro, preserva o
documento. Apagar a nota para "atender à LGPD" criaria problema fiscal maior —
e para o CONTRIBUINTE, não para nós.

---

## 6.3 O incidente de 15/08/2026 e o que ele mudou no processo

**Sintoma:** `/dashboard/relatorios` em produção com *"server-side exception,
Digest 1958706302"*.

**Causa:** produção estava com 21 migrations; local com 27. As seis das últimas
três entregas nunca foram aplicadas. O código foi ao ar dependendo de
`relatorio_carteira()`, que não existia lá.

**A causa não foi técnica, foi humana:** `db push` dependia de alguém lembrar, e
a lembrança falhou depois de três entregas seguidas.

### O que mudou

1. **CI aplica migrations** (job `migrations` no `ci.yml`), só em push na `main` e
   só depois do DoD passar. Deixou de depender de memória.
2. **Branch + PR obrigatório** — o CI vira portão, não relatório póstumo.

### Dois defeitos que o teste ponta a ponta revelou, e a leitura de código não

- **Botão de cancelar invisível:** a condição da coluna de detalhe era
  `status === "emitida" && (urlPdf || urlXml)`, e o botão morava dentro. Toda
  nota sem anexo — ou seja, TODA nota do provider em simulação — ficava sem como
  cancelar.
- **Botão de cancelar parecia estático:** era cinza até o hover. Virou vermelho
  delineado. Contorno e não preenchido de propósito: sólido teria o peso de
  "Emitir nota" e convidaria clique distraído numa ação irreversível.

### Erro de desenho meu, registrado para não repetir

Pedi que o `SUPABASE_PROJECT_REF` fosse guardado como **secret**. Ele não é
segredo — já é público em `NEXT_PUBLIC_SUPABASE_URL`, embutido no bundle do
browser. Isso não protegia nada e criou um modo de falha que só apareceu no
merge (`Invalid project ref format`). Virou constante no workflow.

**Regra que fica:** secret é para o que precisa ser secreto. Dado público em
secret é fricção com aparência de segurança.

### Secrets realmente necessários no GitHub

`SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD`. Só isso.

### A corrida entre deploy e migration — FECHADA em 15/08/2026

Havia uma janela: a Vercel publicava pelo gatilho de git **em paralelo** ao job de
migrations, e nada garantia a ordem. Era a mesma classe de problema que quebrou a
tela de relatórios.

**Como foi fechado:** `vercel.json` desliga o deploy automático da `main`
(`git.deploymentEnabled.main = false`), e o CI ganhou um job `deploy` com
`needs: migrations`. A garantia deixou de ser de tempo e passou a ser
estrutural — o deploy nem começa se a migration não terminar bem.

**A ordem é migration primeiro, código depois**, e não o contrário: banco novo
aguenta código velho (coluna a mais não incomoda quem não a lê); código novo
contra banco velho é a tela de erro.

**Se o deploy falhar**, produção fica na versão anterior, funcionando, com o banco
já migrado — o desfecho seguro dos dois possíveis.

Branch de PR continua gerando preview normalmente: preview não toca em produção.

**Secret necessário:** `VERCEL_TOKEN`. `VERCEL_ORG_ID` e `VERCEL_PROJECT_ID` estão
em claro no workflow de propósito — não são segredos, aparecem na URL do painel, e
guardar dado público em secret já quebrou o CI uma vez.

---

## 6.4 Pendência de segurança: Next 14 → 16 (adiada em 15/08/2026)

**Decisão do usuário: fica para depois.** Registrada aqui porque é a única
pendência técnica com data para vencer.

### O que é

`npm audit` acusa 10 vulnerabilidades. **Oito delas não alcançam produção** —
são `vitest`, `esbuild`, `vite` e `eslint-config-next`, todas dependências de
desenvolvimento. Inclusive a "crítica" (CVSS 9.8 do Vitest), que exige
`vitest --ui` ligado, coisa que este projeto nunca roda.

**A que importa é o `next`.** Estamos em 14.2.35; as correções estão em 15.5.21+.
Entre os 21 avisos, quatro batem no que este sistema faz:

| Vulnerabilidade | Por que importa aqui |
|---|---|
| SSRF em Server Actions | o sistema usa Server Actions em tudo |
| Exposição não autenticada de endpoints de Server Function | app com login e dado fiscal |
| Bypass de Middleware | há middleware de sessão |
| Cache poisoning em respostas RSC | painel multi-tenant |

### Por que foi adiado, e quando deixa de ser adiável

Hoje o sistema **não tem cliente real e não emite nota com validade jurídica** —
o provider está em simulação. O risco é teórico enquanto isso for verdade.

**O gatilho é o lançamento.** No dia em que houver dado de contribuinte no ar,
rodar um framework com SSRF conhecido em Server Actions deixa de ser dívida e
vira exposição. Fazer na mesma janela da assinatura dos planos Pro, **antes de
entrar cliente**.

### Como fazer

PR próprio, nunca emendado em outra entrega: é mudança de major num sistema que
emite documento fiscal. Depois do merge, refazer o teste ponta a ponta no site —
não basta o DoD verde, porque major de framework quebra em runtime, não em
compilação.

---

## 6.5 Integração com a Focus: respostas oficiais e lacunas (26–27/08/2026)

Perguntas que estavam abertas há semanas, respondidas pelo suporte e pela
documentação. **Ficam aqui porque cada uma custou uma rodada de e-mail** — e
porque três delas mudaram decisão de código.

### Confirmado pelo suporte da Focus

| Pergunta | Resposta |
|---|---|
| A franquia de 4.000 notas é por conta ou por CNPJ? | **Por conta** — soma todas as empresas |
| Há limite de CNPJs no Growth? | **Não há** |
| Recebimento de documento consome franquia? | **Sim.** Vira custo, não só risco |
| O teste de 30 dias é por CNPJ? | **Não: por conta/cadastro principal.** Uma vez só |
| Limite de requisições? | **100 créditos/min por token**, 1 por requisição. HTTP 429 + `Rate-Limit-Reset` |
| Campos obrigatórios no cadastro? | **CNPJ + Inscrição Municipal**, mais habilitação da empresa junto à prefeitura para webservice |
| Certificado A1 é sempre exigido? | **A maioria das prefeituras exige**, mas varia. Só a página do município diz |
| E-mail automático ao tomador | Enviado quando há e-mail válido e a config está ligada no cadastro. **O leiaute NÃO pode ser alterado** |

### O que isso mudou no código

**`enviar_email_destinatario: false`** (e `enviar_email_homologacao`). Nós já
enviamos a nota ao tomador com PDF e XML. Com os dois ligados, o cliente do
escritório receberia a MESMA nota duas vezes, uma delas com a marca do
provedor — vazamento de fornecedor na caixa de entrada de quem revende sob
marca própria. Setado explicitamente, não herdado do default: default é decisão
do provedor e muda sem aviso.

**Aviso de inscrição municipal ausente** no painel de prontidão. Não barra, e
não deve barrar: existe a exceção da NFS-e Nacional, em que a prefeitura não
registrou a IM no ambiente nacional e o campo **deve ser suprimido**
(`inscricao_municipal_prestador`). Como não dá para decidir localmente, a Focus
continua sendo a autoridade — mas avisar antes evita gastar crédito para
descobrir o óbvio.

**`regime_tributario` como CRT numérico e `habilita_nfse`** — ver PR #13.

### ⚫ Lacunas conhecidas, deliberadamente não implementadas

**`certificado_especifico`.** O guia da NFS-e Nacional exige certificado
*"específico da empresa emissora"* e diz que *"não é permitido utilizar apenas
a raiz do certificado"*. Um escritório que tente usar o certificado da matriz
para as filiais será recusado. **Não modelamos.** Só passa a importar quando
aparecer um cliente com filiais — e aí o sintoma será recusa do provedor com
mensagem clara, não erro silencioso.

**`codigo_tributacao_municipal_iss`.** O mesmo guia avisa que *"alguns campos
que são opcionais no schema nacional podem se tornar obrigatórios para aquele
município específico"*, e usa justamente este como exemplo. **Não enviamos.**
Implementar antes de saber quais municípios da carteira o exigem seria
adivinhar; a informação está na página individual de cada município.

**`codigo_nbs`.** O guia trata como *"essencial para o correto preenchimento"*.
A decisão A7 (§6) manteve o campo **opcional para todos**, porque as fontes
divergiam. Esta é uma fonte a mais do lado "exigir", mas é guia de fornecedor,
não norma — **a decisão segue de pé e é do usuário.** Registrado para não se
perder.

### A consequência comercial que não é técnica

A regra de autenticação — certificado, ou login e senha da prefeitura — **só
existe na página individual de cada município**. A lista de municípios
integrados tem apenas código IBGE, nome, estado e adesão ao ambiente nacional.

Não há como saber de antemão, em lote, o que cada CNPJ da carteira vai exigir.
Isso dá custo mensurável à pergunta de qualificação *"em quantos municípios
diferentes eles emitem?"*: emitir em 3 municípios é pesquisa de uma tarde;
em 80, é projeto.

**Fontes:** [municípios integrados](https://focusnfe.com.br/guides/nfse/municipios-integrados/) ·
[municípios da NFS-e Nacional](https://focusnfe.com.br/guides/nfse/municipios-integrados/municipios-da-nfse-nacional/) ·
[criar empresa](https://doc.focusnfe.com.br/reference/criar_empresa.md)

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
9. **~~Sem Docker neste ambiente~~ — isso mudou.** A restrição valia para o ambiente do
   agente anterior. Na máquina do usuário o stack local roda, e o agente **consegue**
   executar `npx supabase db reset`, `gen types` e consultar o Postgres via
   `docker exec -i supabase_db_agenca-fiscal-saas psql -U postgres -d postgres`. Isso
   encurta o ciclo: valide a migration você mesmo antes de devolver a bola.
10. **RLS não é privilégio.** Ver §5.6. Policy sem `GRANT` dá "permission denied" em banco
    novo, e o sintoma aparece longe da causa. Toda tabela nova precisa de policy **e** de
    grant explícito.
11. **`.xlsx` oficial tem células mescladas.** O Anexo VIII tem 2258. Leitura ingênua
    devolve vazio onde há valor herdado, e a saúde inteira (04.02–04.21) somiria da
    correlação. Expanda os `mergeCells` antes de concluir qualquer coisa — e desconfie de
    "este item não tem regra".
12. **`NUMERIC(p,s)` com percentual.** `NUMERIC(7,5)` só vai até 99,99999 e a tabela tem
    reduções de 100%. Um `db reset` morreu nisso. Se a coluna guarda percentual, trave o
    intervalo com CHECK — fração e percentual são ambos números plausíveis, e trocar um
    pelo outro passa despercebido.
13. **`.select()` do supabase-js precisa de string LITERAL.** Concatenar com `+` devolve
    `string` e o resultado vira `GenericStringError`, com erro de tipo em cada campo.
14. **`upsert` em lote exige satisfazer os NOT NULL** mesmo quando o desfecho é UPDATE — o
    PostgREST monta `INSERT ... ON CONFLICT`. Se a tabela tem coluna NOT NULL que a fonte
    não fornece, separe UPDATE de INSERT.
15. **`process.exit()` em script Node no Windows** com handles HTTP abertos dispara
    assertion do libuv e o processo morre com `0xC0000409`, engolindo o código de saída.
    Use `process.exitCode` e deixe o loop drenar.

---

## 8. Como continuar

Toda a lista da versão anterior foi concluída em 10/08/2026: estado verificado (§3.1),
`database.ts` destravado (§4), B7 (`d3728ee`), 0014 recuperado (`13c62fd`), A1
(`89bffb0`), C7 (`bccd178`+`b3683f7`), A7 (`bccd178`) e A6 (`6bf3945`).

Depois vieram a pesquisa normativa e a classificação A/B/C (§5.5), os GRANTs (§5.6), a
sincronização das tabelas oficiais e o envio dos componentes à Focus.

O que resta está em §6, e a fronteira ficou nítida:

- **Três itens dependem da Focus** (ajuste de base, lado calculado do retorno, `cIndOp`).
  Uma conversa na homologação resolve os dois primeiros.
- **Dois são decisão contábil** (`cClassTribReg`, correlação atividade ↔ regime e regra de
  crédito do Simples). **Perguntar, não escolher sozinho** — A7 e C7 mostraram que
  perguntar custa uma mensagem e escolher errado custa uma migration.

### A distinção que organiza o resto do trabalho fiscal

**Correlação ≠ elegibilidade.** O Anexo VIII diz quais códigos se relacionam ao SERVIÇO —
regra técnica, publicada, rastreável. Se AQUELE contribuinte pode usar um deles depende do
enquadramento dele, e o sistema não determina isso. Foi essa distinção que permitiu
automatizar 86 itens com segurança e que impede automatizar os outros. Antes de "facilitar"
qualquer escolha fiscal, pergunte de que lado da linha ela está.

Corolário prático: **nunca crie coluna sem quem a preencha.** Foi o defeito do A6
(`simples_por_fora` decorativo) e foi o motivo de o lado calculado do retorno ter ficado
sem storage — a fonte não deu os nomes dos campos, então a pendência ficou honesta em vez
de virar schema vazio.

### Migrations que exigem `db reset` + regeneração de tipos

Quando uma migration mexe em COLUNA, o código que escreve nela só typecheca depois do
`db reset` + `gen types`. **O agente consegue rodar os dois** (armadilha 9) — valide você
mesmo antes de devolver a bola. Sequência que funcionou: escrever a migration → aplicar →
**verificar** BOM e colunas em `database.ts` → só então escrever o código. Não commitar
migration que derruba coluna separada do código que parava de usá-la: deixa `main` num
estado em que o código contradiz o banco.

### Manter as tabelas fiscais em dia

```bash
npm run fiscal:sync          # dry-run: mostra o diff, sai 10 se houver pendência
npm run fiscal:sync:apply    # grava
```

Vale rodar o dry-run periodicamente: a SVRS republica sem changelog, e o código de saída 10
serve para um job de CI avisar. Ausências nunca são apagadas e não contam como pendência.
