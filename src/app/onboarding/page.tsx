import { redirect } from "next/navigation";
import { Building2, FileCheck2 } from "lucide-react";
import { createSessionClient, estadoDaSessao } from "@/lib/supabase/server";
import { FormularioOnboarding } from "./formulario";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Complete seu cadastro — Agência Fiscal",
};

export default async function OnboardingPage() {
  const db = createSessionClient();
  const estado = await estadoDaSessao(db);

  if (estado.tipo === "deslogado") redirect("/login");
  if (estado.tipo === "com_empresa") redirect("/dashboard");

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold text-brand-700">
        <FileCheck2 className="h-6 w-6" aria-hidden />
        Agência Fiscal
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-brand-600">
          Beta
        </span>
      </div>

      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 inline-flex rounded-xl bg-brand-50 p-3">
          <Building2 className="h-7 w-7 text-brand-600" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold">Falta só um passo!</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Sua conta foi criada. Agora cadastre os dados da sua empresa — são eles que saem
          impressos nas suas notas fiscais. Leva menos de 2 minutos.
        </p>
      </div>

      <FormularioOnboarding emailSugerido={estado.email ?? ""} />
    </main>
  );
}
