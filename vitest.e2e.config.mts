import { defineConfig } from "vitest/config";
import base from "./vitest.config.mjs";

/**
 * Tests de punta a punta (`npm run test:e2e`). A diferencia de `npm test`, usan base:
 * el Postgres embebido del modo local, en memoria y con las migraciones de verdad. Sin
 * red y sin cuentas: Zernio y OpenRouter se simulan reemplazando `fetch`.
 *
 * Van aparte para que `npm test` siga corriendo en un segundo. Mismos alias que la
 * configuracion base; lo que cambia es que archivos corren y cuanto pueden tardar.
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["tests/e2e/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
