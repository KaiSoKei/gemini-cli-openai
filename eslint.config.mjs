import { defineConfig } from "eslint/config";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([{
    extends: compat.extends("plugin:@typescript-eslint/recommended"),
    rules: {
        "no-unused-vars": "off", // Disable the base rule
        "@typescript-eslint/no-unused-vars": ["error", {
            "args": "all", // Flag all unused arguments
            "argsIgnorePattern": "^_", // Ignore arguments starting with an underscore
            "varsIgnorePattern": "^_", // Ignore variables starting with an underscore
            "caughtErrorsIgnorePattern": "^_" // Ignore caught errors starting with an underscore
        }]
    },
    languageOptions: {
        parser: tsParser,
        ecmaVersion: 2021,
        sourceType: "module",
    },
}]);