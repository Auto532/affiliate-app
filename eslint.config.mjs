import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ESLint 9 (Flat Config) — ersetzt .eslintrc.json, seit Next.js 16 gibt es kein `next lint` mehr
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "convex/_generated/**"]),
]);
