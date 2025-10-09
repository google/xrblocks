// @ts-check

import eslint from '@eslint/js';
import tsdoceslint from 'eslint-plugin-tsdoc';
import {defineConfig} from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
    eslint.configs.recommended, tseslint.configs.recommended, {
      plugins: {tsdoc: tsdoceslint},
      files: ['**/*.ts'],
      rules: {
        'tsdoc/syntax': 'warn',
        '@typescript-eslint/no-unused-vars': [
          'error', {
            args: 'all',
            argsIgnorePattern: '^_',
            caughtErrors: 'all',
            caughtErrorsIgnorePattern: '^_',
            destructuredArrayIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            ignoreRestSiblings: true
          }
        ]
      },
    },
    {
      files: ['rollup.config.js', 'docs/docusaurus.config.js'],
      languageOptions: {globals: {...globals.node}}
    });