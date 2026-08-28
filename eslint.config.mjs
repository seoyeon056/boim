import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // scripts/copy-pdf-assets.mjs 가 복사해 넣는 pdf.js 벤더 번들.
    // 우리가 고칠 코드가 아니라 검사 대상에서 뺀다.
    "public/pdfjs/**",
  ]),
]);

export default eslintConfig;
