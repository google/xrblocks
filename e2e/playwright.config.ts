import {defineConfig} from '@playwright/test';

/**
 * GPU flags: Vulkan/ANGLE on developer machines (renders on the iGPU), and
 * software GL in CI where no GPU is available. Override with E2E_GL=vulkan|swiftshader.
 */
function gpuArgs(): string[] {
  const base = [
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    '--enable-unsafe-webgpu',
  ];
  const flavor =
    process.env.E2E_GL ?? (process.env.CI ? 'swiftshader' : 'vulkan');
  return flavor === 'swiftshader'
    ? [...base, '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : [...base, '--enable-features=Vulkan', '--use-angle=vulkan'];
}

export default defineConfig({
  testDir: './scenarios',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  timeout: 60_000,
  expect: {timeout: 15_000},
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', {open: 'never', outputFolder: 'playwright-report'}]]
    : [['list']],
  outputDir: 'test-results',
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    launchOptions: {args: gpuArgs()},
  },
  projects: [
    // The boot fixture keys the `&webgpu=1` harness flag off the project name.
    {name: 'sim-webgl'},
    {name: 'sim-webgpu'},
  ],
});
