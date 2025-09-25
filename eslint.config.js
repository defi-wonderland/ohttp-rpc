import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      '**/*.js',
      '**/*.d.ts',
      'build-working.ts',
      'apps/',
      'scripts/',
      'packages/test-utils/',
      'packages/sdk/src/dev.ts',
      'packages/sdk/src/provider.ts',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  }
);