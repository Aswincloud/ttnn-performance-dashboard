// ESLint 9 flat config. Three scopes, because this repo runs code in three very
// different runtimes:
//   - src/      → browser + React (JSX)
//   - worker/   → Cloudflare Workers (service-worker-ish globals, no DOM)
//   - *.config  → Node build tooling
//
// Philosophy: catch real bugs (undeclared vars, bad hook usage), stay quiet on
// style — Prettier owns formatting, so ESLint shouldn't bikeshed it.

import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // Never lint build output, deps, or vendored data.
  {
    ignores: ['dist/', 'node_modules/', '.wrangler/', 'data/', 'public/data/'],
  },

  js.configs.recommended,

  // Frontend: React components and utils.
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // New JSX transform — React needn't be in scope to use JSX.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off', // no prop-types in this codebase by choice
      // Allow intentionally-unused args/vars prefixed with _.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // "Reset form state when the modal opens" is an intentional, correct use of
      // an effect here. This rule is advisory (React-Compiler-oriented); warn so
      // it's visible without blocking CI. rules-of-hooks below stays an error —
      // that one catches real ordering bugs.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },

  // Cloudflare Worker: no DOM, but has fetch/crypto/console and the service
  // worker globals. Uses ESM.
  {
    files: ['worker/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.worker, ...globals.serviceworker },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Build tooling at the repo root runs in Node.
  {
    files: ['*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
];
