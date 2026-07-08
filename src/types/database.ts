/**
 * ⚠️ PLACEHOLDER TEMPORÁRIO — permite typecheck antes do Supabase local existir.
 *
 * Assim que o banco local estiver de pé, SUBSTITUIR este arquivo inteiro com:
 *   npx supabase gen types typescript --local > src/types/database.ts
 *
 * (Regra 14 do CLAUDE.md: este arquivo é gerado; nunca manter tipos manuais
 * aqui depois da geração. Este conteúdo espelha supabase_schema.sql 1:1.)
 */
import { type NotaStatus, type AssinaturaStatus, type PlanoTipo, type TentativaResultado, type MembroPapel } from "./domain";

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type EmpresaRow = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  inscricao_municipal: string | null;
  codigo_municipio_ibge: string;
  regime_tributario: string;
  email_contato: string;
  provider_fiscal: string;
  created_at: string;
  updated_at: string;
};

type EmpresaMembroRow = {
  empresa_id: string;
  user_id: string;
  papel: MembroPapel;
  created_at: string;
};

type ClienteRow = {
  id: string;
  empresa_id: string;
  nome: string;
  cpf_cnpj: string;
  email: string | null;
  telefone: string | null;
  endereco: Json;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

type AssinaturaRow = {
  id: string;
  empresa_id: string;
  plano: PlanoTipo;
  status: AssinaturaStatus;
  limite_notas_mes: number;
  preco_centavos: number;
  gateway_customer_id: string | null;
  gateway_subscription_id: string | null;
  trial_ate: string | null;
  periodo_atual_inicio: string;
  periodo_atual_fim: string | null;
  cancelada_em: string | null;
  created_at: string;
  updated_at: string;
};

type NotaFiscalRow = {
  id: string;
  empresa_id: string;
  cliente_id: string;
  referencia_externa: string;
  descricao_servico: string;
  codigo_servico: string;
  valor_servico_centavos: number;
  aliquota_iss: number;
  iss_retido: boolean;
  competencia: string;
  status: NotaStatus;
  tentativas: number;
  max_tentativas: number;
  proxima_tentativa_em: string | null;
  ultimo_erro: string | null;
  ultimo_erro_codigo: string | null;
  falha_definitiva_em: string | null;
  numero_nfse: string | null;
  codigo_verificacao: string | null;
  url_pdf: string | null;
  url_xml: string | null;
  provider_id: string | null;
  emitida_em: string | null;
  created_at: string;
  updated_at: string;
};

type NotaTentativaRow = {
  id: number;
  nota_id: string;
  empresa_id: string;
  numero_tentativa: number;
  resultado: TentativaResultado;
  erro_codigo: string | null;
  erro_mensagem: string | null;
  payload_erro: Json | null;
  duracao_ms: number | null;
  criada_em: string;
};

type TableDef<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      empresas: TableDef<EmpresaRow, "razao_social" | "cnpj" | "codigo_municipio_ibge" | "email_contato">;
      empresa_membros: TableDef<EmpresaMembroRow, "empresa_id" | "user_id">;
      clientes: TableDef<ClienteRow, "empresa_id" | "nome" | "cpf_cnpj">;
      assinaturas: TableDef<AssinaturaRow, "empresa_id">;
      notas_fiscais: TableDef<
        NotaFiscalRow,
        | "empresa_id"
        | "cliente_id"
        | "descricao_servico"
        | "codigo_servico"
        | "valor_servico_centavos"
      >;
      notas_fiscais_tentativas: TableDef<
        NotaTentativaRow,
        "nota_id" | "empresa_id" | "numero_tentativa" | "resultado"
      >;
    };
    Views: Record<string, never>;
    Functions: {
      transicionar_status_nota: {
        Args: {
          p_nota_id: string;
          p_novo_status: NotaStatus;
          p_erro_codigo?: string | null;
          p_erro_msg?: string | null;
        };
        Returns: NotaFiscalRow;
      };
      empresas_do_usuario: {
        Args: Record<string, never>;
        Returns: string[];
      };
    };
    Enums: {
      nota_status: NotaStatus;
      assinatura_status: AssinaturaStatus;
      plano_tipo: PlanoTipo;
      tentativa_resultado: TentativaResultado;
      membro_papel: MembroPapel;
    };
    CompositeTypes: Record<string, never>;
  };
};
