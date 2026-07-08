"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import { type Database } from "@/types/database";

/**
 * Client Supabase para componentes de browser (login, realtime).
 * Usa exclusivamente a chave anon pública — RLS ativa (regras 2 e 4).
 */
export function createBrowserSupabase() {
  const env = publicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
