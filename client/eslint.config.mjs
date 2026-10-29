import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scripts de operação (migrações, backup) — Node puro, fora do bundle
    // do app, CommonJS de propósito (sem "type": "module" no package.json
    // e sem toolchain de execução de TS aqui, ao contrário do resto do
    // projeto). Os testes desses scripts (*.test.ts) continuam lintados
    // normalmente.
    "scripts/**/*.js",
  ]),
]);

export default eslintConfig;
