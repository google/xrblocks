import {defineConfig} from 'vitest/config';
import {resolve} from 'path';

export default defineConfig({
  resolve: {
    alias: {
      'xrblocks/addons': resolve(import.meta.dirname, './src/addons'),
      xrblocks: resolve(import.meta.dirname, './src/xrblocks.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts', 'demos/**/*.test.ts'],
    environment: 'jsdom',
    // Let jsdom provide Storage instead of inheriting Node's native globals.
    execArgv: process.allowedNodeEnvironmentFlags.has(
      '--no-experimental-webstorage'
    )
      ? ['--no-experimental-webstorage']
      : [],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/**/samples/**'],
      reporter: ['text-summary', 'html'],
    },
  },
});
