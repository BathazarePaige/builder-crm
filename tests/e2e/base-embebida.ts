import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import { listarMigraciones } from "../../scripts/lib/migraciones.mjs";
import { SHIM_AUTH } from "../../scripts/lib/shim-auth.mjs";

/**
 * Base para los tests de punta a punta: el mismo Postgres embebido que `npm run local`,
 * pero en memoria (cada archivo de test arranca de cero y no deja nada en disco).
 *
 * Aplica LAS MISMAS migraciones que una instancia desplegada, con los modulos activos de
 * `config/modulos.json`: el CI corre la matriz con y sin modulos, y este test tiene que
 * pasar en las dos. Lo unico que se salta es lo que pide pgvector, igual que el modo
 * local, porque el Postgres embebido no lo trae.
 */
export async function crearBaseEmbebida() {
  const cliente = new PGlite({ extensions: { pgcrypto } });
  await cliente.waitReady;
  await cliente.exec(SHIM_AUTH);

  for (const migracion of listarMigraciones(process.cwd())) {
    try {
      await cliente.transaction(async (tx) => {
        await tx.exec(readFileSync(migracion.ruta, "utf8"));
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/extension "vector" is not available|type "vector" does not exist/i.test(msg)) continue;
      throw new Error(`${migracion.nombre}: ${msg}`);
    }
  }

  const real = drizzle(cliente, { schema });

  // Mismo ajuste que hace src/db/index.ts en modo local: `execute` devuelve `{ rows }`
  // con este driver y el codigo espera el array de filas.
  const db = new Proxy(real, {
    get(destino, propiedad, receptor) {
      if (propiedad === "execute") {
        return async (...args: Parameters<typeof real.execute>) => {
          const r = (await destino.execute(...args)) as unknown as { rows?: unknown[] };
          return Array.isArray(r) ? r : (r?.rows ?? []);
        };
      }
      const valor = Reflect.get(destino, propiedad, receptor);
      return typeof valor === "function" ? valor.bind(destino) : valor;
    },
  });

  return { db, cliente };
}
