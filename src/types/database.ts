export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          preco_excedente_centavos: number
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
          preco_excedente_centavos?: number
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
          preco_excedente_centavos?: number
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
      cclasstrib_ibscbs: {
        Row: {
          aplica_nfse: boolean
          artigo_lc214: string | null
          codigo: string
          created_at: string
          cst: string
          descricao: string
          descricao_oficial: string | null
          ind_cred_pres: boolean
          ind_estorno_cred: boolean
          ind_perc_biocombustivel: boolean
          ind_trib_regular: boolean
          nome_reduzido: string | null
          perc_reducao_cbs: number | null
          perc_reducao_cbs_oficial: number | null
          perc_reducao_ibs: number | null
          perc_reducao_ibs_oficial: number | null
          publicado_em: string | null
          rb_sn: number | null
          tipo_aliquota: number | null
          url_dispositivo: string | null
          url_legislacao: string | null
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          aplica_nfse?: boolean
          artigo_lc214?: string | null
          codigo: string
          created_at?: string
          cst: string
          descricao: string
          descricao_oficial?: string | null
          ind_cred_pres?: boolean
          ind_estorno_cred?: boolean
          ind_perc_biocombustivel?: boolean
          ind_trib_regular?: boolean
          nome_reduzido?: string | null
          perc_reducao_cbs?: number | null
          perc_reducao_cbs_oficial?: number | null
          perc_reducao_ibs?: number | null
          perc_reducao_ibs_oficial?: number | null
          publicado_em?: string | null
          rb_sn?: number | null
          tipo_aliquota?: number | null
          url_dispositivo?: string | null
          url_legislacao?: string | null
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          aplica_nfse?: boolean
          artigo_lc214?: string | null
          codigo?: string
          created_at?: string
          cst?: string
          descricao?: string
          descricao_oficial?: string | null
          ind_cred_pres?: boolean
          ind_estorno_cred?: boolean
          ind_perc_biocombustivel?: boolean
          ind_trib_regular?: boolean
          nome_reduzido?: string | null
          perc_reducao_cbs?: number | null
          perc_reducao_cbs_oficial?: number | null
          perc_reducao_ibs?: number | null
          perc_reducao_ibs_oficial?: number | null
          publicado_em?: string | null
          rb_sn?: number | null
          tipo_aliquota?: number | null
          url_dispositivo?: string | null
          url_legislacao?: string | null
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cclasstrib_ibscbs_cst_fkey"
            columns: ["cst"]
            isOneToOne: false
            referencedRelation: "cst_ibscbs"
            referencedColumns: ["codigo"]
          },
        ]
      }
      ccredpres_ibscbs: {
        Row: {
          codigo: string
          created_at: string
          descricao: string
          vigencia_fim_bruto: string | null
          vigencia_inicio_bruto: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          descricao: string
          vigencia_fim_bruto?: string | null
          vigencia_inicio_bruto?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          descricao?: string
          vigencia_fim_bruto?: string | null
          vigencia_inicio_bruto?: string | null
        }
        Relationships: []
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
      cst_ibscbs: {
        Row: {
          ajuste_competencia: boolean
          codigo: string
          created_at: string
          cred_pres_zfm: boolean
          descricao: string
          diferimento: boolean
          exige_tributacao: boolean
          monofasica: boolean
          red_aliquota: boolean
          red_base_calculo: boolean
          transf_credito: boolean
        }
        Insert: {
          ajuste_competencia?: boolean
          codigo: string
          created_at?: string
          cred_pres_zfm?: boolean
          descricao: string
          diferimento?: boolean
          exige_tributacao?: boolean
          monofasica?: boolean
          red_aliquota?: boolean
          red_base_calculo?: boolean
          transf_credito?: boolean
        }
        Update: {
          ajuste_competencia?: boolean
          codigo?: string
          created_at?: string
          cred_pres_zfm?: boolean
          descricao?: string
          diferimento?: boolean
          exige_tributacao?: boolean
          monofasica?: boolean
          red_aliquota?: boolean
          red_base_calculo?: boolean
          transf_credito?: boolean
        }
        Relationships: []
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
          certificado_cnpj: string | null
          certificado_enviado_em: string | null
          certificado_valido_ate: string | null
          certificado_valido_de: string | null
          cnae: string | null
          cnpj: string
          codigo_municipio_ibge: string
          created_at: string
          data_opcao_regime_regular: string | null
          email_contato: string
          id: string
          inscricao_municipal: string | null
          nome_fantasia: string | null
          provider_empresa_id: string | null
          provider_fiscal: string
          razao_social: string
          regime_apuracao_confirmado_em: string | null
          regime_apuracao_ibscbs_sn:
            | Database["public"]["Enums"]["regime_apuracao_ibscbs_sn"]
            | null
          regime_tributario: string
          situacao_simples_nacional: Database["public"]["Enums"]["situacao_simples_nacional"]
          updated_at: string
        }
        Insert: {
          certificado_cnpj?: string | null
          certificado_enviado_em?: string | null
          certificado_valido_ate?: string | null
          certificado_valido_de?: string | null
          cnae?: string | null
          cnpj: string
          codigo_municipio_ibge: string
          created_at?: string
          data_opcao_regime_regular?: string | null
          email_contato: string
          id?: string
          inscricao_municipal?: string | null
          nome_fantasia?: string | null
          provider_empresa_id?: string | null
          provider_fiscal?: string
          razao_social: string
          regime_apuracao_confirmado_em?: string | null
          regime_apuracao_ibscbs_sn?:
            | Database["public"]["Enums"]["regime_apuracao_ibscbs_sn"]
            | null
          regime_tributario?: string
          situacao_simples_nacional?: Database["public"]["Enums"]["situacao_simples_nacional"]
          updated_at?: string
        }
        Update: {
          certificado_cnpj?: string | null
          certificado_enviado_em?: string | null
          certificado_valido_ate?: string | null
          certificado_valido_de?: string | null
          cnae?: string | null
          cnpj?: string
          codigo_municipio_ibge?: string
          created_at?: string
          data_opcao_regime_regular?: string | null
          email_contato?: string
          id?: string
          inscricao_municipal?: string | null
          nome_fantasia?: string | null
          provider_empresa_id?: string | null
          provider_fiscal?: string
          razao_social?: string
          regime_apuracao_confirmado_em?: string | null
          regime_apuracao_ibscbs_sn?:
            | Database["public"]["Enums"]["regime_apuracao_ibscbs_sn"]
            | null
          regime_tributario?: string
          situacao_simples_nacional?: Database["public"]["Enums"]["situacao_simples_nacional"]
          updated_at?: string
        }
        Relationships: []
      }
      faturas_excedente: {
        Row: {
          asaas_payment_id: string | null
          competencia: string
          created_at: string
          empresa_id: string
          erro: string | null
          id: string
          link_fatura: string | null
          preco_unitario_centavos: number
          quantidade_notas: number
          status: string
          updated_at: string
          valor_total_centavos: number
        }
        Insert: {
          asaas_payment_id?: string | null
          competencia: string
          created_at?: string
          empresa_id: string
          erro?: string | null
          id?: string
          link_fatura?: string | null
          preco_unitario_centavos: number
          quantidade_notas: number
          status?: string
          updated_at?: string
          valor_total_centavos: number
        }
        Update: {
          asaas_payment_id?: string | null
          competencia?: string
          created_at?: string
          empresa_id?: string
          erro?: string | null
          id?: string
          link_fatura?: string | null
          preco_unitario_centavos?: number
          quantidade_notas?: number
          status?: string
          updated_at?: string
          valor_total_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "faturas_excedente_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_fonte_versao: {
        Row: {
          fonte: string
          hash_conteudo: string
          id: number
          importado_em: string
          publicado_em: string | null
          registros: number
          url: string
          versao: string | null
        }
        Insert: {
          fonte: string
          hash_conteudo: string
          id?: never
          importado_em?: string
          publicado_em?: string | null
          registros: number
          url: string
          versao?: string | null
        }
        Update: {
          fonte?: string
          hash_conteudo?: string
          id?: never
          importado_em?: string
          publicado_em?: string | null
          registros?: number
          url?: string
          versao?: string | null
        }
        Relationships: []
      }
      item_lc116_cclasstrib: {
        Row: {
          cclasstrib: string
          item_lc116: string
          ordem: number
        }
        Insert: {
          cclasstrib: string
          item_lc116: string
          ordem: number
        }
        Update: {
          cclasstrib?: string
          item_lc116?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_lc116_cclasstrib_cclasstrib_fkey"
            columns: ["cclasstrib"]
            isOneToOne: false
            referencedRelation: "cclasstrib_ibscbs"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "item_lc116_cclasstrib_cclasstrib_fkey"
            columns: ["cclasstrib"]
            isOneToOne: false
            referencedRelation: "cclasstrib_nfse"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "item_lc116_cclasstrib_cclasstrib_fkey"
            columns: ["cclasstrib"]
            isOneToOne: false
            referencedRelation: "item_lc116_cclasstrib_nfse"
            referencedColumns: ["codigo"]
          },
        ]
      }
      notas_fiscais: {
        Row: {
          ajuste_base_centavos: number
          ajuste_base_tipo:
            | Database["public"]["Enums"]["tipo_ajuste_base_ibscbs"]
            | null
          aliquota_iss: number
          cbs_aliquota: number
          cbs_valor_centavos: number
          cliente_id: string
          codigo_nbs: string | null
          codigo_servico: string
          codigo_verificacao: string | null
          cofins_centavos: number
          competencia: string
          created_at: string
          desconto_incondicionado_centavos: number
          descricao_servico: string
          documentos_ajuste_base: Json
          emitida_em: string | null
          empresa_id: string
          excedente: boolean
          falha_definitiva_em: string | null
          fatura_excedente_id: string | null
          ibs_aliquota: number
          ibs_valor_centavos: number
          ibscbs_base_centavos: number | null
          ibscbs_cclasstrib: string | null
          ibscbs_cclasstrib_vale_nfse: boolean | null
          ibscbs_ccredpres: string | null
          ibscbs_cst: string | null
          ibscbs_dif_perc_cbs: number | null
          ibscbs_dif_perc_mun: number | null
          ibscbs_dif_perc_uf: number | null
          ibscbs_trib_reg_cclasstrib: string | null
          ibscbs_trib_reg_cst: string | null
          id: string
          iss_retido: boolean
          issqn_centavos: number
          max_tentativas: number
          numero_nfse: string | null
          pis_centavos: number
          provider_id: string | null
          proxima_tentativa_em: string | null
          referencia_externa: string
          regime_confirmado_em: string | null
          regime_confirmado_por: string | null
          regime_ibscbs: string
          split_retido_centavos: number | null
          status: Database["public"]["Enums"]["nota_status"]
          tentativas: number
          ultimo_erro: string | null
          ultimo_erro_codigo: string | null
          updated_at: string
          url_pdf: string | null
          url_xml: string | null
          valor_liquido_centavos: number | null
          valor_servico_centavos: number
        }
        Insert: {
          ajuste_base_centavos?: number
          ajuste_base_tipo?:
            | Database["public"]["Enums"]["tipo_ajuste_base_ibscbs"]
            | null
          aliquota_iss?: number
          cbs_aliquota?: number
          cbs_valor_centavos?: number
          cliente_id: string
          codigo_nbs?: string | null
          codigo_servico: string
          codigo_verificacao?: string | null
          cofins_centavos?: number
          competencia?: string
          created_at?: string
          desconto_incondicionado_centavos?: number
          descricao_servico: string
          documentos_ajuste_base?: Json
          emitida_em?: string | null
          empresa_id: string
          excedente?: boolean
          falha_definitiva_em?: string | null
          fatura_excedente_id?: string | null
          ibs_aliquota?: number
          ibs_valor_centavos?: number
          ibscbs_base_centavos?: number | null
          ibscbs_cclasstrib?: string | null
          ibscbs_cclasstrib_vale_nfse?: boolean | null
          ibscbs_ccredpres?: string | null
          ibscbs_cst?: string | null
          ibscbs_dif_perc_cbs?: number | null
          ibscbs_dif_perc_mun?: number | null
          ibscbs_dif_perc_uf?: number | null
          ibscbs_trib_reg_cclasstrib?: string | null
          ibscbs_trib_reg_cst?: string | null
          id?: string
          iss_retido?: boolean
          issqn_centavos?: number
          max_tentativas?: number
          numero_nfse?: string | null
          pis_centavos?: number
          provider_id?: string | null
          proxima_tentativa_em?: string | null
          referencia_externa?: string
          regime_confirmado_em?: string | null
          regime_confirmado_por?: string | null
          regime_ibscbs?: string
          split_retido_centavos?: number | null
          status?: Database["public"]["Enums"]["nota_status"]
          tentativas?: number
          ultimo_erro?: string | null
          ultimo_erro_codigo?: string | null
          updated_at?: string
          url_pdf?: string | null
          url_xml?: string | null
          valor_liquido_centavos?: number | null
          valor_servico_centavos: number
        }
        Update: {
          ajuste_base_centavos?: number
          ajuste_base_tipo?:
            | Database["public"]["Enums"]["tipo_ajuste_base_ibscbs"]
            | null
          aliquota_iss?: number
          cbs_aliquota?: number
          cbs_valor_centavos?: number
          cliente_id?: string
          codigo_nbs?: string | null
          codigo_servico?: string
          codigo_verificacao?: string | null
          cofins_centavos?: number
          competencia?: string
          created_at?: string
          desconto_incondicionado_centavos?: number
          descricao_servico?: string
          documentos_ajuste_base?: Json
          emitida_em?: string | null
          empresa_id?: string
          excedente?: boolean
          falha_definitiva_em?: string | null
          fatura_excedente_id?: string | null
          ibs_aliquota?: number
          ibs_valor_centavos?: number
          ibscbs_base_centavos?: number | null
          ibscbs_cclasstrib?: string | null
          ibscbs_cclasstrib_vale_nfse?: boolean | null
          ibscbs_ccredpres?: string | null
          ibscbs_cst?: string | null
          ibscbs_dif_perc_cbs?: number | null
          ibscbs_dif_perc_mun?: number | null
          ibscbs_dif_perc_uf?: number | null
          ibscbs_trib_reg_cclasstrib?: string | null
          ibscbs_trib_reg_cst?: string | null
          id?: string
          iss_retido?: boolean
          issqn_centavos?: number
          max_tentativas?: number
          numero_nfse?: string | null
          pis_centavos?: number
          provider_id?: string | null
          proxima_tentativa_em?: string | null
          referencia_externa?: string
          regime_confirmado_em?: string | null
          regime_confirmado_por?: string | null
          regime_ibscbs?: string
          split_retido_centavos?: number | null
          status?: Database["public"]["Enums"]["nota_status"]
          tentativas?: number
          ultimo_erro?: string | null
          ultimo_erro_codigo?: string | null
          updated_at?: string
          url_pdf?: string | null
          url_xml?: string | null
          valor_liquido_centavos?: number | null
          valor_servico_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_notas_cclasstrib_nfse"
            columns: ["ibscbs_cclasstrib", "ibscbs_cclasstrib_vale_nfse"]
            isOneToOne: false
            referencedRelation: "cclasstrib_ibscbs"
            referencedColumns: ["codigo", "aplica_nfse"]
          },
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
          {
            foreignKeyName: "notas_fiscais_fatura_excedente_id_fkey"
            columns: ["fatura_excedente_id"]
            isOneToOne: false
            referencedRelation: "faturas_excedente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_ibscbs_ccredpres_fkey"
            columns: ["ibscbs_ccredpres"]
            isOneToOne: false
            referencedRelation: "ccredpres_ibscbs"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "notas_fiscais_ibscbs_cst_fkey"
            columns: ["ibscbs_cst"]
            isOneToOne: false
            referencedRelation: "cst_ibscbs"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "notas_fiscais_ibscbs_trib_reg_cclasstrib_fkey"
            columns: ["ibscbs_trib_reg_cclasstrib"]
            isOneToOne: false
            referencedRelation: "cclasstrib_ibscbs"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "notas_fiscais_ibscbs_trib_reg_cclasstrib_fkey"
            columns: ["ibscbs_trib_reg_cclasstrib"]
            isOneToOne: false
            referencedRelation: "cclasstrib_nfse"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "notas_fiscais_ibscbs_trib_reg_cclasstrib_fkey"
            columns: ["ibscbs_trib_reg_cclasstrib"]
            isOneToOne: false
            referencedRelation: "item_lc116_cclasstrib_nfse"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "notas_fiscais_ibscbs_trib_reg_cst_fkey"
            columns: ["ibscbs_trib_reg_cst"]
            isOneToOne: false
            referencedRelation: "cst_ibscbs"
            referencedColumns: ["codigo"]
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
      cclasstrib_conferencia: {
        Row: {
          confere: boolean | null
          cst: string | null
          esperado: number | null
          importado: number | null
        }
        Relationships: []
      }
      cclasstrib_nfse: {
        Row: {
          artigo_lc214: string | null
          codigo: string | null
          cst: string | null
          descricao: string | null
          ind_cred_pres: boolean | null
          ind_estorno_cred: boolean | null
          ind_trib_regular: boolean | null
          perc_reducao_cbs: number | null
          perc_reducao_ibs: number | null
          rb_sn: number | null
          tipo_aliquota: number | null
          url_dispositivo: string | null
        }
        Insert: {
          artigo_lc214?: string | null
          codigo?: string | null
          cst?: string | null
          descricao?: string | null
          ind_cred_pres?: boolean | null
          ind_estorno_cred?: boolean | null
          ind_trib_regular?: boolean | null
          perc_reducao_cbs?: number | null
          perc_reducao_ibs?: number | null
          rb_sn?: number | null
          tipo_aliquota?: number | null
          url_dispositivo?: string | null
        }
        Update: {
          artigo_lc214?: string | null
          codigo?: string | null
          cst?: string | null
          descricao?: string | null
          ind_cred_pres?: boolean | null
          ind_estorno_cred?: boolean | null
          ind_trib_regular?: boolean | null
          perc_reducao_cbs?: number | null
          perc_reducao_ibs?: number | null
          rb_sn?: number | null
          tipo_aliquota?: number | null
          url_dispositivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cclasstrib_ibscbs_cst_fkey"
            columns: ["cst"]
            isOneToOne: false
            referencedRelation: "cst_ibscbs"
            referencedColumns: ["codigo"]
          },
        ]
      }
      item_lc116_cclasstrib_nfse: {
        Row: {
          artigo_lc214: string | null
          codigo: string | null
          cst: string | null
          descricao_oficial: string | null
          ind_cred_pres: boolean | null
          ind_trib_regular: boolean | null
          item_lc116: string | null
          ordem: number | null
          perc_reducao_cbs: number | null
          perc_reducao_ibs: number | null
          url_legislacao: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cclasstrib_ibscbs_cst_fkey"
            columns: ["cst"]
            isOneToOne: false
            referencedRelation: "cst_ibscbs"
            referencedColumns: ["codigo"]
          },
        ]
      }
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
      marcar_nota_excedente: { Args: { p_nota_id: string }; Returns: boolean }
      minhas_empresas: {
        Args: never
        Returns: {
          cnpj: string
          empresa_id: string
          nome_fantasia: string
          papel: Database["public"]["Enums"]["membro_papel"]
          razao_social: string
        }[]
      }
      transicionar_status_nota: {
        Args: {
          p_erro_codigo?: string
          p_erro_msg?: string
          p_nota_id: string
          p_novo_status: Database["public"]["Enums"]["nota_status"]
        }
        Returns: {
          ajuste_base_centavos: number
          ajuste_base_tipo:
            | Database["public"]["Enums"]["tipo_ajuste_base_ibscbs"]
            | null
          aliquota_iss: number
          cbs_aliquota: number
          cbs_valor_centavos: number
          cliente_id: string
          codigo_nbs: string | null
          codigo_servico: string
          codigo_verificacao: string | null
          cofins_centavos: number
          competencia: string
          created_at: string
          desconto_incondicionado_centavos: number
          descricao_servico: string
          documentos_ajuste_base: Json
          emitida_em: string | null
          empresa_id: string
          excedente: boolean
          falha_definitiva_em: string | null
          fatura_excedente_id: string | null
          ibs_aliquota: number
          ibs_valor_centavos: number
          ibscbs_base_centavos: number | null
          ibscbs_cclasstrib: string | null
          ibscbs_cclasstrib_vale_nfse: boolean | null
          ibscbs_ccredpres: string | null
          ibscbs_cst: string | null
          ibscbs_dif_perc_cbs: number | null
          ibscbs_dif_perc_mun: number | null
          ibscbs_dif_perc_uf: number | null
          ibscbs_trib_reg_cclasstrib: string | null
          ibscbs_trib_reg_cst: string | null
          id: string
          iss_retido: boolean
          issqn_centavos: number
          max_tentativas: number
          numero_nfse: string | null
          pis_centavos: number
          provider_id: string | null
          proxima_tentativa_em: string | null
          referencia_externa: string
          regime_confirmado_em: string | null
          regime_confirmado_por: string | null
          regime_ibscbs: string
          split_retido_centavos: number | null
          status: Database["public"]["Enums"]["nota_status"]
          tentativas: number
          ultimo_erro: string | null
          ultimo_erro_codigo: string | null
          updated_at: string
          url_pdf: string | null
          url_xml: string | null
          valor_liquido_centavos: number | null
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
      regime_apuracao_ibscbs_sn:
        | "ambos_pelo_sn"
        | "cbs_sn_ibs_regular"
        | "ambos_regime_regular"
      situacao_simples_nacional:
        | "nao_optante"
        | "mei"
        | "me_epp"
        | "optante_pendente"
      tentativa_resultado: "sucesso" | "erro_transiente" | "erro_permanente"
      tipo_ajuste_base_ibscbs: "ibscbs" | "loc_imoveis"
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
      regime_apuracao_ibscbs_sn: [
        "ambos_pelo_sn",
        "cbs_sn_ibs_regular",
        "ambos_regime_regular",
      ],
      situacao_simples_nacional: [
        "nao_optante",
        "mei",
        "me_epp",
        "optante_pendente",
      ],
      tentativa_resultado: ["sucesso", "erro_transiente", "erro_permanente"],
      tipo_ajuste_base_ibscbs: ["ibscbs", "loc_imoveis"],
    },
  },
} as const

