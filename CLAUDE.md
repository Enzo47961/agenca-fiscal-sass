# CLAUDE.md — Agência Fiscal SaaS

SaaS multi-tenant de Faturamento e Emissão de NFS-e Resiliente.
Stack: **Next.js 14+ (App Router) · TypeScript strict · Supabase (Postgres + Auth + RLS) · Inngest (jobs/retries) · Zod**.

> Este arquivo é a fonte de verdade da arquitetura. Se uma mudança violar uma regra daqui, a mudança está errada — não a regra. Em caso de dúvida, pare e pergunte ao usuário antes de improvisar.

---

## Comandos

```bash
npm run dev          # Next.js dev server (porta 3000)
npx inngest-cli@latest dev   # Inngest Dev Server (porta 8288) — rodar em paralelo ao dev
npm run build        # Build de produção (falha em erro de tipo = correto, não silenciar)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest (unit)
npm run test:watch   # Vitest watch mode
npx supabase db reset            # Recria banco local aplicando migrations + seed
npx supabase migration new NOME  # Nova migration (NUNCA editar migrations antigas)
npx supabase gen types typescript --local > src/types/database.ts  # Regenerar tipos após mudança de schema
```

**Definition of Done para qualquer PR/mudança:** `npm run typecheck && npm run lint && npm run test && npm run build` passam. Sem exceções.

---

## Estrutura de diretórios

```
src/
├── app/                    # App Router. Páginas e route handlers APENAS. Zero lógica de negócio.
│   └── api/inngest/route.ts  # Endpoint único do Inngest (serve handler)
├── inngest/
│   ├── client.ts           # Instância única do cliente Inngest
│   ├── events.ts           # Schemas Zod de TODOS os eventos (fonte de verdade)
│   └── functions/          # Uma função Inngest por arquivo
├── lib/
│   ├── fiscal/             # Camada de integração com API fiscal (provider pattern)
│   │   ├── provider.ts     # Interface FiscalProvider + tipos de erro
│   │   └── providers/      # Implementações concretas (focusnfe, nuvemfiscal, mock)
│   ├── supabase/
│   │   ├── server.ts       # createServerClient (cookies) — para Server Components/Actions
│   │   └── admin.ts        # service_role client — APENAS dentro de funções Inngest/webhooks
│   └── billing/            # Lógica de assinaturas
├── services/               # Lógica de negócio pura (testável, sem I/O de framework)
└── types/
    ├── database.ts         # GERADO pelo supabase gen types. NUNCA editar à mão.
    └── domain.ts           # Tipos de domínio derivados
supabase/
├── migrations/             # Migrations imutáveis, ordenadas por timestamp
└── seed.sql
```

---

## Regras rígidas (invioláveis)

### Multi-tenancy e segurança
1. **Toda tabela de dados tem `empresa_id`** com RLS habilitado. Nunca criar tabela de tenant sem policy.
2. **Nunca usar o client `service_role` em código acessível pelo browser** ou em Server Components de página. Ele vive somente em `src/lib/supabase/admin.ts` e só é importado por funções Inngest e webhooks (que validam assinatura).
3. **Nunca confiar em `empresa_id` vindo do cliente.** Derivar sempre da sessão (`auth.uid()` → membership). RLS é a última linha de defesa, não a única: o código de serviço também filtra por tenant.
4. Chaves/segredos apenas via `process.env` validado em `src/lib/env.ts` (Zod). Nunca hardcode, nunca `NEXT_PUBLIC_` para segredo.

### Emissão de NFS-e (o core do produto)
5. **Emissão NUNCA é síncrona no request HTTP.** O fluxo é sempre: criar linha em `notas_fiscais` com status `pendente` → disparar evento Inngest `nfse/emissao.solicitada` → responder ao usuário. Quem fala com a prefeitura é exclusivamente o motor Inngest.
6. **Máquina de estados de `notas_fiscais.status`:** `pendente → reprocessando → emitida | falhou`. Transições válidas:
   - `pendente → reprocessando` (primeira tentativa iniciada)
   - `reprocessando → emitida` (sucesso)
   - `reprocessando → reprocessando` (retry agendado)
   - `reprocessando → falhou` (esgotou tentativas OU erro permanente)
   - `falhou → pendente` (reprocessamento manual pelo usuário)
   Qualquer outra transição é bug. Usar a função SQL `transicionar_status_nota()` — nunca `UPDATE status` direto.
7. **Idempotência obrigatória.** Toda emissão usa `referencia_externa` (UUID gerado na criação da nota) como chave de idempotência junto ao provider fiscal. Retry jamais pode gerar nota duplicada na prefeitura.
8. **Classificação de erros é sagrada.** Erros do provider fiscal são classificados em:
   - `FiscalErrorTransient` (timeout, 5xx, prefeitura fora do ar) → **retry com backoff**
   - `FiscalErrorPermanent` (dados inválidos, CNPJ irregular, 4xx de validação) → **falha imediata, sem retry** (retry de erro permanente só queima tentativa e polui log)
   Nunca capturar erro genérico e "assumir transiente".
9. **Backoff fixo do produto: 5 min → 15 min → 1 h** (4 tentativas totais: 1 inicial + 3 retries). Está codificado em `src/inngest/functions/emitir-nfse.ts` (`RETRY_DELAYS`). Não alterar sem decisão explícita do usuário.
10. **Todo resultado de tentativa (sucesso ou erro) é gravado em `notas_fiscais_tentativas`** com payload de erro bruto da API. Nunca engolir erro sem persistir.

### Inngest
11. Eventos são definidos e validados em `src/inngest/events.ts` com Zod. Nenhuma string de evento solta pelo código — importar as constantes.
12. Dentro de funções Inngest, **todo I/O vive dentro de `step.run()`** com nome estável e descritivo. Nunca fazer fetch/query fora de um step (quebra replay e idempotência).
13. Funções Inngest usam `retries: 0` no nível da função quando o retry é controlado manualmente pela nossa lógica de backoff (caso do motor de emissão). Não misturar retry automático do Inngest com o nosso.

### Banco de dados
14. Migrations são imutáveis: mudança de schema = migration nova. Após qualquer migration, regenerar `src/types/database.ts`.
15. Dinheiro é `NUMERIC(12,2)` no banco e **inteiro em centavos** no TypeScript. Nunca `float`.
16. Timestamps sempre `TIMESTAMPTZ` (UTC). Formatação de fuso é responsabilidade da UI.
17. Enums de domínio são `CREATE TYPE` no Postgres, espelhados em `src/types/domain.ts`.

### Código
18. TypeScript `strict: true`. Proibido `any`, `as unknown as`, `@ts-ignore` (usar `@ts-expect-error` com comentário justificando, e apenas em teste).
19. Validação de entrada externa (forms, webhooks, respostas de API fiscal) sempre com Zod na fronteira. Dentro de `services/`, dados já são tipados e confiáveis.
20. Lógica de negócio em `src/services/` como funções puras que recebem dependências (client supabase, provider fiscal) por parâmetro — facilita teste com mock.
21. Novo provider fiscal = nova classe implementando `FiscalProvider` em `src/lib/fiscal/providers/`. O resto do sistema não conhece nomes de providers.

---

## Fluxo de emissão (referência rápida)

```
UI/Server Action
  └─ insere nota (status: pendente, referencia_externa: uuid)
  └─ inngest.send("nfse/emissao.solicitada", { notaId, empresaId })
       └─ [Inngest] emitir-nfse
            ├─ step: carregar nota + validar status
            ├─ step: transicionar → reprocessando
            ├─ loop de tentativas (máx 4):
            │    ├─ step: chamar provider.emitir() (idempotente via referencia_externa)
            │    ├─ step: gravar tentativa em notas_fiscais_tentativas
            │    ├─ sucesso → transicionar → emitida, gravar numero/codigo_verificacao, FIM
            │    ├─ erro permanente → transicionar → falhou, FIM
            │    └─ erro transiente → step.sleep(RETRY_DELAYS[n]) → próxima tentativa
            └─ tentativas esgotadas → transicionar → falhou + evento nfse/emissao.falhou
```

## Armadilhas conhecidas

- `step.sleep` exige nome único por iteração (`sleep-retry-${attempt}`), senão o Inngest deduplica e pula o sleep.
- RLS bloqueia o client anon dentro do Inngest — por isso funções Inngest usam o admin client (regra 2) e recebem `empresaId` do evento, filtrando manualmente.
- `supabase gen types` sobrescreve `database.ts` inteiro — nunca colocar tipo manual lá.
- Prefeituras retornam às vezes HTTP 200 com erro no corpo. O provider é responsável por inspecionar o corpo e lançar o erro classificado correto.
