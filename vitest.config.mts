import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Tests del nucleo. Corren sin base de datos, sin red y sin servidor: son los
 * invariantes que, si se rompen, **no avisan**. Un contacto que se ve de mas, un
 * webhook falso que entra, un mensaje que WhatsApp descarta en silencio.
 *
 * Lo que necesita navegador no vive aca: eso lo cubre `scripts/verificar-instancia.mjs`
 * contra la instancia desplegada. El flujo del agente de punta a punta (webhook ->
 * agente -> etapa -> respuesta) tiene su propia configuracion, `vitest.e2e.config.mts`,
 * porque levanta un Postgres embebido y tarda unos segundos: `npm run test:e2e`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", "**/node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "@config": path.resolve(process.cwd(), "config"),
      "@modules": path.resolve(process.cwd(), "modules"),
      "server-only": path.resolve(process.cwd(), "tests/server-only-vacio.ts"),
    },
  },
});
