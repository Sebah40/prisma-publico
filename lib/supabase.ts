import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let _client: SupabaseClient | null = null;

/**
 * Cliente Supabase. Lazy init para no fallar en build si las env vars no están.
 */
export function getSupabase(): SupabaseClient {
  if (!_client) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
    }
    _client = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _client;
}

/**
 * Verifica si Supabase está configurado (env vars presentes).
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}
