import {startStaticServer, type StaticServer} from './server';

const URL_FILE = new URL('./.server-url', import.meta.url);

/**
 * Starts the static repository server on an ephemeral port before the test
 * workers spawn. The URL is published through `E2E_BASE_URL` (inherited by
 * workers) and through `e2e/.server-url` as a fallback. Teardown lives in
 * `global-teardown.ts`.
 */
export default async function globalSetup(): Promise<void> {
  const server: StaticServer = await startStaticServer(process.cwd());
  process.env.E2E_BASE_URL = server.url;
  const {writeFileSync} = await import('node:fs');
  writeFileSync(URL_FILE, server.url, 'utf8');
  (globalThis as Record<string, unknown>).__e2eStaticServer = server;
}
