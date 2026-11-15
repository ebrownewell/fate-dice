import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "coverage/"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        Hooks: "readonly",
        game: "readonly",
        ui: "readonly",
        CONFIG: "readonly",
        foundry: "readonly",
        Actor: "readonly",
        User: "readonly",
        CONST: "readonly",
        quench: "readonly",
        Combat: "readonly",
        ChatMessage: "readonly",
      },
    },
  },
  {
    files: ["tests/**/*.js", "tests-foundry/**/*.js", "tools/**/*.js", "*.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
];
