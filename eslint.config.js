import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-*',
      'references',
      'node_modules',
      'output',
      'tmp',
      '.agents',
      '.claude',
      '.codex',
      'coverage',
      'test-results',
      'playwright-report',
      '.*.tmp.mjs',
    ],
  },
  {
    ...js.configs.recommended,
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
    },
  },
  {
    // Three's TSL node types do not describe several valid shader graph values
    // and compute methods yet. Keep the escape hatch limited to that boundary;
    // application and ordinary Three.js code remain strict.
    files: [
      'src/vanilla-three/experiences/shaders/ShaderGalleryExperience.ts',
      'src/vanilla-three/experiences/shaders/gallery/geometric/quasicityDirector.ts',
      'src/vanilla-three/tsl/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
  eslintConfigPrettier
);
