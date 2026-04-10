// This first import triggers a linting error.
// It's a false positive since this rule doesn't exist anymore in eslint 10+.
/*eslint import/no-unresolved: 'off' */
import { defineConfig, globalIgnores } from 'eslint/config'
import github from 'eslint-plugin-github'
import jest from 'eslint-plugin-jest'
import globals from 'globals'
import babelParser from '@babel/eslint-parser'
import js from '@eslint/js'

const githubFlatConfigs = github.getFlatConfigs()

export default defineConfig([
  globalIgnores([
    '!**/.*',
    '**/node_modules/.*',
    '**/dist/*.js',
    '**/coverage/.*',
    '**/*.json'
  ]),
  {
    extends: [
      js.configs.recommended,
      githubFlatConfigs.recommended,
      jest.configs['flat/recommended']
    ],

    plugins: {
      jest
    },

    languageOptions: {
      globals: {
        ...globals.commonjs,
        ...globals.jest,
        ...globals.node,
        Atomics: 'readonly',
        SharedArrayBuffer: 'readonly'
      },

      parser: babelParser,
      ecmaVersion: 2023,
      sourceType: 'module',

      parserOptions: {
        requireConfigFile: false,

        babelOptions: {
          babelrc: false,
          configFile: false,
          presets: ['jest']
        }
      }
    },

    rules: {
      camelcase: 'off',
      'eslint-comments/no-use': 'off',
      'eslint-comments/no-unused-disable': 'off',
      'i18n-text/no-en': 'off',
      'import/no-commonjs': 'off',
      'import/no-namespace': 'off',
      'no-console': 'off',
      'no-unused-vars': 'off',
      'prettier/prettier': 'error',
      semi: 'off'
    }
  }
])
