import type {StaticServer} from './server';

/** Closes the static repository server started by global-setup. */
export default async function globalTeardown(): Promise<void> {
  const server = (globalThis as Record<string, unknown>).__e2eStaticServer as
    | StaticServer
    | undefined;
  if (server) await server.close();
}
