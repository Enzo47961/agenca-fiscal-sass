import { createClient } from "@supabase/supabase-js";
import { type Database } from "@/types/database";

/**
 * Client service_role — BYPASSA RLS.
 * REGRA 2 do CLAUDE.md: importar SOMENTE em funções Inngest e webhooks.
 * Nunca em Server Components, Server Actions de página ou código de browser.
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias no ambiente do worker.",
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
