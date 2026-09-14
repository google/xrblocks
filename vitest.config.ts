import {defineConfig} from 'vitest/config';
import {resolve} from 'path';

export default defineConfig({
  resolve: {
    alias: {
      'xrblocks/addons': resolve(__dirname, './src/addons'),
      xrblocks: resolve(__dirname, './src/xrblocks.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/**/samples/**'],
      reporter: ['text-summary', 'html'],
    },
  },
});
