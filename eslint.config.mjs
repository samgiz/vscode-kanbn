import eslintConfigPrettier from "eslint-config-prettier"
import eslint from "@eslint/js"
import tseslint from "typescript-eslint"

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      "prefer-const": "error",
    },
  },
  {
    files: ["**/*.ts", "**/*.cts", "**.*.mts", "**.*.tsx"],
  },
]
