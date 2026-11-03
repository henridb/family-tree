import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig } from "eslint/config";
import reactPlugin from "eslint-plugin-react";
import hooksPlugin from "eslint-plugin-react-hooks";
import a11yPlugin from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      ".data/**",
      "next-env.d.ts",
    ],
  },
  {
    plugins: {
      "@next/next": { rules: nextPlugin.rules },
    },
    // Next 15 types its rule levels as strings rather than ESLint's literal types.
    rules: /** @type {import("eslint").Linter.RulesRecord} */ ({
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    }),
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    extends: [
      { ...reactPlugin.configs.flat.recommended },
      { ...reactPlugin.configs.flat["jsx-runtime"] },
      hooksPlugin.configs.flat.recommended,
      a11yPlugin.flatConfigs.recommended,
    ],
    settings: {
      react: { version: "detect" },
    },
    rules: {
      "react/jsx-key": ["error", { checkFragmentShorthand: true }],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
);
