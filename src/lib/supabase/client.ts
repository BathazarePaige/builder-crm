import { createBrowserClient } from "@supabase/ssr";
import { leerConfigPublica } from "@/lib/config-publica";

/**
 * Cliente de Supabase para el navegador.
 *
 * La URL y la clave anonima salen del bloque de configuracion que el layout escribe en
 * tiempo de ejecucion, no de las `NEXT_PUBLIC_*` horneadas en el build: la misma imagen
 * sirve para instancias distintas. Ver `src/lib/config-publica.ts`.
 */
export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = leerConfigPublica();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "La configuration publique de Supabase manque. Vérifiez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sur l’instance."
    );
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
