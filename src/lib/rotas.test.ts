import { describe, it, expect } from "vitest";
import { decidirRota, rotaExigeSessao } from "@/lib/rotas";
import { destinoSeguro } from "@/lib/redirect-seguro";

describe("rotaExigeSessao", () => {
  it("protege o painel e o onboarding, inclusive subrotas", () => {
    expect(rotaExigeSessao("/dashboard")).toBe(true);
    expect(rotaExigeSessao("/dashboard/notas/nova")).toBe(true);
    expect(rotaExigeSessao("/onboarding")).toBe(true);
  });

  it("deixa passar as páginas públicas", () => {
    for (const rota of ["/", "/login", "/cadastro", "/termos", "/privacidade", "/auth/callback"]) {
      expect(rotaExigeSessao(rota)).toBe(false);
    }
  });

  // Comparar por prefixo cru faria "/dashboard-publico" cair na regra do painel.
  it("não confunde rota que apenas começa com o mesmo texto", () => {
    expect(rotaExigeSessao("/dashboards")).toBe(false);
    expect(rotaExigeSessao("/dashboard-publico")).toBe(false);
    expect(rotaExigeSessao("/onboardingx")).toBe(false);
  });
});

describe("decidirRota", () => {
  it("manda visitante para o login preservando a tela pretendida", () => {
    const d = decidirRota({ pathname: "/dashboard/notas", temUsuario: false });
    expect(d).toEqual({ tipo: "redirecionar", destino: "/login?next=%2Fdashboard%2Fnotas" });
  });

  it("preserva também a query string da tela pretendida", () => {
    const d = decidirRota({
      pathname: "/dashboard/cobrancas/nova",
      busca: "?cliente=abc",
      temUsuario: false,
    });
    expect(d).toEqual({
      tipo: "redirecionar",
      destino: "/login?next=%2Fdashboard%2Fcobrancas%2Fnova%3Fcliente%3Dabc",
    });
  });

  // O `next` que geramos volta para nós depois do login. Se ele não sobrevivesse
  // à própria validação de open redirect, o usuário seria jogado no painel
  // genérico e a preservação de destino não teria efeito nenhum.
  it("o next gerado sobrevive à validação de destino seguro", () => {
    const d = decidirRota({ pathname: "/dashboard/notas", busca: "?status=erro", temUsuario: false });
    if (d.tipo !== "redirecionar") throw new Error("esperava redirecionamento");

    const next = new URL(d.destino, "https://app.exemplo.com.br").searchParams.get("next");
    expect(destinoSeguro(next)).toBe("/dashboard/notas?status=erro");
  });

  it("deixa o visitante seguir nas rotas públicas", () => {
    expect(decidirRota({ pathname: "/", temUsuario: false })).toEqual({ tipo: "seguir" });
    expect(decidirRota({ pathname: "/login", temUsuario: false })).toEqual({ tipo: "seguir" });
  });

  it("tira o usuário logado das telas de entrada", () => {
    expect(decidirRota({ pathname: "/login", temUsuario: true })).toEqual({
      tipo: "redirecionar",
      destino: "/dashboard",
    });
    expect(decidirRota({ pathname: "/cadastro", temUsuario: true })).toEqual({
      tipo: "redirecionar",
      destino: "/dashboard",
    });
  });

  it("deixa o usuário logado seguir no painel", () => {
    expect(decidirRota({ pathname: "/dashboard/notas", temUsuario: true })).toEqual({
      tipo: "seguir",
    });
  });

  // Recuperação de senha usa link de e-mail e precisa funcionar mesmo com
  // sessão ativa em outra aba — mandar para o painel quebraria a troca de senha.
  it("não sequestra as telas de recuperação de senha", () => {
    expect(decidirRota({ pathname: "/recuperar-senha", temUsuario: true })).toEqual({
      tipo: "seguir",
    });
    expect(decidirRota({ pathname: "/redefinir-senha", temUsuario: true })).toEqual({
      tipo: "seguir",
    });
  });
});
