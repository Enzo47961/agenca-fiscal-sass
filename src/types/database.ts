export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      assinaturas: {
        Row: {
          cancelada_em: string | null
          created_at: string
          empresa_id: string
          gateway_customer_id: string | null
          gateway_subscription_id: string | null
          id: string
          limite_notas_mes: number
          periodo_atual_fim: string | null
          periodo_atual_inicio: string
          plano: Database["public"]["Enums"]["plano_tipo"]
          preco_centavos: number
          status: Database["public"]["Enums"]["assinatura_status"]
          trial_ate: string | null
          updated_at: string
        }
        Insert: {
          cancelada_em?: string | null
          created_at?: string
          empresa_id: string
          gateway_customer_id?: string | null
          gateway_subscription_id?: string | null
          id?: string
          limite_notas_mes?: number
          periodo_atual_fim?: string | null
          periodo_atual_inicio?: string
          plano?: Database["public"]["Enums"]["plano_tipo"]
          preco_centavos?: number
          status?: Database["public"]["Enums"]["assinatura_status"]
          trial_ate?: string | null
          updated_at?: string
        }
        Update: {
          cancelada_em?: string | null
          created_at?: string
          empresa_id?: string
          gateway_customer_id?: string | null
          gateway_subscription_id?: string | null
          id?: string
          limite_notas_mes?: number
          periodo_atual_fim?: string | null
          periodo_atual_inicio?: string
          plano?: Database["public"]["Enums"]["plano_tipo"]
          preco_centavos?: number
          status?: Database["public"]["Enums"]["assinatura_status"]
          trial_ate?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          ativo: boolean
          cpf_cnpj: string
          created_at: string
          email: string | null
          empresa_id: string
          endereco: Json
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cpf_cnpj: string
          created_at?: string
          email?: string | null
          empresa_id: string
          endereco?: Json
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cpf_cnpj?: string
          created_at?: string
          email?: string | null
          empresa_id?: string
          endereco?: Json
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_membros: {
        Row: {
          created_at: string
          empresa_id: string
          papel: Database["public"]["Enums"]["membro_papel"]
          user_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          papel?: Database["public"]["Enums"]["membro_papel"]
          user_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          papel?: Database["public"]["Enums"]["membro_papel"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_membros_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          cnpj: string
          codigo_municipio_ibge: string
          created_at: string
          email_contato: string
          id: string
          inscricao_municipal: string | null
          nome_fantasia: string | null
          provider_fiscal: string
          razao_social: string
          regime_tributario: string
          updated_at: string
        }
        Insert: {
          cnpj: string
          codigo_municipio_ibge: string
          created_at?: string
          email_contato: string
          id?: string
          inscricao_municipal?: string | null
          nome_fantasia?: string | null
          provider_fiscal?: string
          razao_social: string
          regime_tributario?: string
          updated_at?: string
        }
        Update: {
          cnpj?: string
          codigo_municipio_ibge?: string
          created_at?: string
          email_contato?: string
          id?: string
          inscricao_municipal?: string | null
          nome_fantasia?: string | null
          provider_fiscal?: string
          razao_social?: string
          regime_tributario?: string
          updated_at?: string
        }
        Relationships: []
      }
      notas_fiscais: {
        Row: {
          aliquota_iss: number
          cliente_id: string
          codigo_servico: string
          codigo_verificacao: string | null
          competencia: string
          created_at: string
          descricao_servico: string
          emitida_em: string | null
          empresa_id: string
          falha_definitiva_em: string | null
          id: string
          iss_retido: boolean
          max_tentativas: number
          numero_nfse: string | null
          provider_id: string | null
          proxima_tentativa_em: string | null
          referencia_externa: string
          status: Database["public"]["Enums"]["nota_status"]
          tentativas: number
          ultimo_erro: string | null
          ultimo_erro_codigo: string | null
          updated_at: string
          url_pdf: string | null
          url_xml: string | null
          valor_servico_centavos: number
        }
        Insert: {
          aliquota_iss?: number
          cliente_id: string
          codigo_servico: string
          codigo_verificacao?: string | null
          competencia?: string
          created_at?: string
          descricao_servico: string
          emitida_em?: string | null
          empresa_id: string
          falha_definitiva_em?: string | null
          id?: string
          iss_retido?: boolean
          max_tentativas?: number
          numero_nfse?: string | null
          provider_id?: string | null
          proxima_tentativa_em?: string | null
          referencia_externa?: string
          status?: Database["public"]["Enums"]["nota_status"]
          tentativas?: number
          ultimo_erro?: string | null
          ultimo_erro_codigo?: string | null
          updated_at?: string
          url_pdf?: string | null
          url_xml?: string | null
          valor_servico_centavos: number
        }
        Update: {
          aliquota_iss?: number
          cliente_id?: string
          codigo_servico?: string
          codigo_verificacao?: string | null
          competencia?: string
          created_at?: string
          descricao_servico?: string
          emitida_em?: string | null
          empresa_id?: string
          falha_definitiva_em?: string | null
          id?: string
          iss_retido?: boolean
          max_tentativas?: number
          numero_nfse?: string | null
          provider_id?: string | null
          proxima_tentativa_em?: string | null
          referencia_externa?: string
          status?: Database["public"]["Enums"]["nota_status"]
          tentativas?: number
          ultimo_erro?: string | null
          ultimo_erro_codigo?: string | null
          updated_at?: string
          url_pdf?: string | null
          url_xml?: string | null
          valor_servico_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_fiscais_tentativas: {
        Row: {
          criada_em: string
          duracao_ms: number | null
          empresa_id: string
          erro_codigo: string | null
          erro_mensagem: string | null
          id: number
          nota_id: string
          numero_tentativa: number
          payload_erro: Json | null
          resultado: Database["public"]["Enums"]["tentativa_resultado"]
        }
        Insert: {
          criada_em?: string
          duracao_ms?: number | null
          empresa_id: string
          erro_codigo?: string | null
          erro_mensagem?: string | null
          id?: never
          nota_id: string
          numero_tentativa: number
          payload_erro?: Json | null
          resultado: Database["public"]["Enums"]["tentativa_resultado"]
        }
        Update: {
          criada_em?: string
          duracao_ms?: number | null
          empresa_id?: string
          erro_codigo?: string | null
          erro_mensagem?: string | null
          id?: never
          nota_id?: string
          numero_tentativa?: number
          payload_erro?: Json | null
          resultado?: Database["public"]["Enums"]["tentativa_resultado"]
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_tentativas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_tentativas_nota_id_fkey"
            columns: ["nota_id"]
            isOneToOne: false
            referencedRelation: "notas_fiscais"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      criar_minha_empresa: {
        Args: {
          p_cnpj: string
          p_codigo_municipio_ibge: string
          p_email_contato: string
          p_inscricao_municipal?: string
          p_nome_fantasia?: string
          p_razao_social: string
          p_regime_tributario?: string
        }
        Returns: string
      }
      empresas_do_usuario: { Args: never; Returns: string[] }
      transicionar_status_nota: {
        Args: {
          p_erro_codigo?: string
          p_erro_msg?: string
          p_nota_id: string
          p_novo_status: Database["public"]["Enums"]["nota_status"]
        }
        Returns: {
          aliquota_iss: number
          cliente_id: string
          codigo_servico: string
          codigo_verificacao: string | null
          competencia: string
          created_at: string
          descricao_servico: string
          emitida_em: string | null
          empresa_id: string
          falha_definitiva_em: string | null
          id: string
          iss_retido: boolean
          max_tentativas: number
          numero_nfse: string | null
          provider_id: string | null
          proxima_tentativa_em: string | null
          referencia_externa: string
          status: Database["public"]["Enums"]["nota_status"]
          tentativas: number
          ultimo_erro: string | null
          ultimo_erro_codigo: string | null
          updated_at: string
          url_pdf: string | null
          url_xml: string | null
          valor_servico_centavos: number
        }
        SetofOptions: {
          from: "*"
          to: "notas_fiscais"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      assinatura_status: "trial" | "ativa" | "inadimplente" | "cancelada"
      membro_papel: "owner" | "admin" | "operador"
      nota_status: "pendente" | "reprocessando" | "emitida" | "falhou"
      plano_tipo: "starter" | "pro" | "escala"
      tentativa_resultado: "sucesso" | "erro_transiente" | "erro_permanente"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      assinatura_status: ["trial", "ativa", "inadimplente", "cancelada"],
      membro_papel: ["owner", "admin", "operador"],
      nota_status: ["pendente", "reprocessando", "emitida", "falhou"],
      plano_tipo: ["starter", "pro", "escala"],
      tentativa_resultado: ["sucesso", "erro_transiente", "erro_permanente"],
    },
  },
} as const
