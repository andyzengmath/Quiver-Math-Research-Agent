import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/naming-convention': 'off',
      'semi': 'off',
      '@typescript-eslint/semi': 'off',
    },
  },
  {
    ignores: ['out/**', 'node_modules/**', 'webview-ui/**'],
  },
]
