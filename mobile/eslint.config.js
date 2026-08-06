// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Deno runtime code (Supabase Edge Functions) — different globals/module resolution than the
    // app, not part of this project's TS program either (see tsconfig.json exclude).
    ignores: ['dist/*', 'supabase/functions/**'],
  },
]);
