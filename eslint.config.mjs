import eslint from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
    { ignores: ["eslint.config.mjs"] },
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        rules: {
            "@typescript-eslint/restrict-template-expressions": "off",
            "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        },
    },
)
