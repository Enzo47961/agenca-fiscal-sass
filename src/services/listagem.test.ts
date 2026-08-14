import { describe, it, expect } from "vitest";
import {
  listarClientes,
  CLIENTES_POR_PAGINA_PADRAO,
  CLIENTES_POR_PAGINA_MAX,
} from "@/services/clientes";
import { statusDasNotas } from "@/services/dashboard";
import { NOTA_STATUS } from "@/types/domain";
import { fakeSupabase, argsDe, type FakeCtx, type FakeResult } from "@/test-utils/fake-supabase";

const EMPRESA = "11111111-1111-1111-1111-111111111111";

/**
 * Item A8 — paginação e agregação no banco.
 *
 * O ponto destes testes NÃO é o número devolvido: com poucas linhas, a
 * implementação antiga (baixar tudo e contar em memória) e a nova devolvem o
 * mesmo resultado. O que muda é a CHAMADA. Por isso aqui se afirma sobre
 * `range`, `limit` e `{ count: "exact", head: true }` — sem isso, um teste de
 * agregação passaria idêntico com o código que trazia a tabela inteira.
 */

// ---------------------------------------------------------------------------
// listarClientes
// ---------------------------------------------------------------------------

function bancoDeClientes(linhas: number, total = linhas) {
  const ctxs: FakeCtx[] = [];
  const db = fakeSupabase((ctx): FakeResult => {
    ctxs.push(ctx);
    return {
      data: Array.from({ length: linhas }, (_, i) => ({
        id: `c${i}`,
        nome: `Cliente ${i}`,
        cpf_cnpj: "12345678900",
        email: null,
        telefone: null,
        ativo: true,
      })),
      error: null,
      count: total,
    };
  });
  return { db, ctxs };
}

describe("listarClientes — paginação", () => {
  it("pede uma FAIXA ao banco, não a tabela inteira", async () => {
    const { db, ctxs } = bancoDeClientes(50, 1240);
    await listarClientes(db, { empresaId: EMPRESA });

    // Sem isto, a consulta voltaria a ser "todos os clientes do tenant".
    expect(argsDe(ctxs[0]!, "range")).toEqual([[0, CLIENTES_POR_PAGINA_PADRAO - 1]]);
  });

  it("pede o total ao banco junto com a página", async () => {
    const { db, ctxs } = bancoDeClientes(50, 1240);
    const pagina = await listarClientes(db, { empresaId: EMPRESA });

    expect(ctxs[0]!.opcoesSelect).toMatchObject({ count: "exact" });
    // O total é do BANCO, não o tamanho do array devolvido.
    expect(pagina.total).toBe(1240);
    expect(pagina.itens).toHaveLength(50);
  });

  it("calcula o deslocamento da página pedida", async () => {
    const { db, ctxs } = bancoDeClientes(50, 1240);
    await listarClientes(db, { empresaId: EMPRESA, pagina: 3, porPagina: 20 });

    expect(argsDe(ctxs[0]!, "range")).toEqual([[40, 59]]);
  });

  it("temMais diz se existe próxima página", async () => {
    const cheia = await listarClientes(bancoDeClientes(50, 1240).db, { empresaId: EMPRESA });
    expect(cheia.temMais).toBe(true);

    const ultima = await listarClientes(bancoDeClientes(50, 50).db, { empresaId: EMPRESA });
    expect(ultima.temMais).toBe(false);
  });

  // O teto vive no serviço, e não no chamador, para que não exista caminho
  // capaz de pedir "tudo".
  it("limita porPagina ao teto, mesmo se pedirem mais", async () => {
    const { db, ctxs } = bancoDeClientes(200, 5000);
    await listarClientes(db, { empresaId: EMPRESA, porPagina: 10_000 });

    expect(argsDe(ctxs[0]!, "range")).toEqual([[0, CLIENTES_POR_PAGINA_MAX - 1]]);
  });

  it("normaliza entradas absurdas em vez de gerar range inválido", async () => {
    for (const [pagina, porPagina, esperado] of [
      [0, 10, [0, 9]],
      [-5, 10, [0, 9]],
      [1, 0, [0, 0]],
      [1, -3, [0, 0]],
      [2.7, 10.9, [10, 19]],
    ] as const) {
      const { db, ctxs } = bancoDeClientes(1, 1);
      await listarClientes(db, { empresaId: EMPRESA, pagina, porPagina });
      expect(argsDe(ctxs[0]!, "range")).toEqual([esperado]);
    }
  });

  it("filtra por nome quando há busca", async () => {
    const { db, ctxs } = bancoDeClientes(3, 3);
    await listarClientes(db, { empresaId: EMPRESA, busca: "  silva  " });

    expect(argsDe(ctxs[0]!, "ilike")).toEqual([["nome", "%silva%"]]);
  });

  // "%" digitado pelo usuário é caractere de busca, não curinga — sem escape,
  // buscar "50%" casaria com todo mundo.
  it("escapa curingas do LIKE digitados pelo usuário", async () => {
    const { db, ctxs } = bancoDeClientes(1, 1);
    await listarClientes(db, { empresaId: EMPRESA, busca: "50%_desconto" });

    expect(argsDe(ctxs[0]!, "ilike")).toEqual([["nome", "%50\\%\\_desconto%"]]);
  });

  it("busca vazia ou só espaços não vira filtro", async () => {
    const { db, ctxs } = bancoDeClientes(2, 2);
    await listarClientes(db, { empresaId: EMPRESA, busca: "   " });

    expect(argsDe(ctxs[0]!, "ilike")).toHaveLength(0);
  });

  it("propaga erro do banco", async () => {
    const db = fakeSupabase(
      (): FakeResult => ({ data: null, error: { message: "timeout" }, count: null }),
    );
    await expect(listarClientes(db, { empresaId: EMPRESA })).rejects.toThrow(/timeout/);
  });
});

// ---------------------------------------------------------------------------
// statusDasNotas
// ---------------------------------------------------------------------------

describe("statusDasNotas — contagem no banco", () => {
  /** Devolve uma contagem por status e as linhas de faturamento do mês. */
  function bancoDeNotas(opcoes: {
    contagens: Record<string, number>;
    faturadas?: number[];
    recentes?: number;
  }) {
    const ctxs: FakeCtx[] = [];
    const db = fakeSupabase((ctx): FakeResult => {
      ctxs.push(ctx);

      // Consulta de contagem: head:true, e o status vem no segundo .eq()
      if (ctx.opcoesSelect?.head) {
        const eqStatus = argsDe(ctx, "eq").find(([col]) => col === "status");
        const status = String(eqStatus?.[1] ?? "");
        return { data: null, error: null, count: opcoes.contagens[status] ?? 0 };
      }

      // Consulta de faturamento: filtra por emitida_em
      if (argsDe(ctx, "gte").some(([col]) => col === "emitida_em")) {
        return {
          data: (opcoes.faturadas ?? []).map((v) => ({ valor_servico_centavos: v })),
          error: null,
        };
      }

      // Notas recentes
      return {
        data: Array.from({ length: opcoes.recentes ?? 0 }, (_, i) => ({
          id: `n${i}`,
          status: "emitida",
          valor_servico_centavos: 1000,
          descricao_servico: "S",
          numero_nfse: "1",
          tentativas: 1,
          proxima_tentativa_em: null,
          ultimo_erro: null,
          url_pdf: null,
          url_xml: null,
          created_at: "2026-08-01T00:00:00Z",
        })),
        error: null,
      };
    });
    return { db, ctxs };
  }

  it("conta no banco com head:true — sem trazer linha nenhuma", async () => {
    const { db, ctxs } = bancoDeNotas({
      contagens: {
        pendente: 3,
        reprocessando: 1,
        emitida: 5000,
        falhou: 2,
        cancelando: 0,
        cancelada: 7,
      },
    });
    const resumo = await statusDasNotas(db, { empresaId: EMPRESA });

    expect(resumo.contagemPorStatus).toEqual({
      pendente: 3,
      reprocessando: 1,
      emitida: 5000,
      falhou: 2,
      cancelando: 0,
      cancelada: 7,
    });

    // O ponto do item A8: uma consulta de contagem por status, todas sem corpo.
    // Passou de 4 para 6 com `cancelando` e `cancelada`.
    const contagens = ctxs.filter((c) => c.opcoesSelect?.head);
    expect(contagens).toHaveLength(NOTA_STATUS.length);
    for (const c of contagens) {
      expect(c.opcoesSelect).toMatchObject({ count: "exact", head: true });
    }
  });

  // A regressão que motivou o item: com a tabela inteira em memória, qualquer
  // limite de linhas do PostgREST truncaria a resposta e o painel mostraria
  // números errados sem nenhum sinal de erro.
  it("NENHUMA consulta baixa a tabela de notas sem limite", async () => {
    const { db, ctxs } = bancoDeNotas({
      contagens: {
        pendente: 0,
        reprocessando: 0,
        emitida: 0,
        falhou: 0,
        cancelando: 0,
        cancelada: 0,
      },
    });
    await statusDasNotas(db, { empresaId: EMPRESA });

    for (const ctx of ctxs) {
      const ehContagem = ctx.opcoesSelect?.head === true;
      const temLimite = argsDe(ctx, "limit").length > 0;
      const temRecorte =
        argsDe(ctx, "gte").length > 0 || argsDe(ctx, "eq").some(([c]) => c === "id");
      expect(ehContagem || temLimite || temRecorte).toBe(true);
    }
  });

  it("soma o faturamento só do mês, filtrado no banco", async () => {
    const { db, ctxs } = bancoDeNotas({
      contagens: { pendente: 0, reprocessando: 0, emitida: 2, falhou: 0 },
      faturadas: [150_00, 250_00],
    });
    const resumo = await statusDasNotas(db, { empresaId: EMPRESA });

    expect(resumo.faturamentoMesCentavos).toBe(400_00);

    // O recorte é do banco: status emitida + emitida_em >= início do mês.
    const consultaFaturamento = ctxs.find((c) =>
      argsDe(c, "gte").some(([col]) => col === "emitida_em"),
    );
    expect(consultaFaturamento).toBeDefined();
    expect(argsDe(consultaFaturamento!, "eq")).toContainEqual(["status", "emitida"]);
  });

  it("a lista de recentes continua limitada a 20", async () => {
    const { db, ctxs } = bancoDeNotas({
      contagens: {
        pendente: 0,
        reprocessando: 0,
        emitida: 0,
        falhou: 0,
        cancelando: 0,
        cancelada: 0,
      },
      recentes: 20,
    });
    await statusDasNotas(db, { empresaId: EMPRESA });

    const recentes = ctxs.find((c) => argsDe(c, "limit").length > 0);
    expect(argsDe(recentes!, "limit")).toEqual([[20]]);
    expect(argsDe(recentes!, "order")).toEqual([["created_at", { ascending: false }]]);
  });

  it("contagem ausente vira zero, não NaN", async () => {
    const db = fakeSupabase((ctx): FakeResult => {
      if (ctx.opcoesSelect?.head) return { data: null, error: null, count: null };
      return { data: [], error: null };
    });
    const resumo = await statusDasNotas(db, { empresaId: EMPRESA });

    expect(resumo.contagemPorStatus).toEqual(
      Object.fromEntries(NOTA_STATUS.map((s) => [s, 0])),
    );
  });
});
