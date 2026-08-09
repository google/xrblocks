import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

/**
 * Drives the server with the official MCP client rather than our own idea of
 * the protocol.
 *
 * The transport here is hand-written to keep the shipped binary free of
 * dependencies, which means spec changes are not picked up by bumping a
 * version. The SDK is a devDependency only, so nothing reaches consumers, and
 * bumping it turns "someone should read the changelog" into a failing test.
 */
describe('MCP conformance', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({name: 'xrblocks-conformance', version: '0.0.0'});
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['src/addons/mcp/server/bin.js'],
      })
    );
  }, 30000);

  afterAll(async () => {
    await client?.close();
  });

  it('completes the handshake the SDK expects', () => {
    // connect() throws if initialize is malformed, so reaching here is most of
    // the assertion.
    expect(client.getServerVersion()?.name).toBe('xrblocks');
  });

  it('advertises tools the SDK can parse', async () => {
    const {tools} = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_skill',
      'list_skills',
      'search_api',
    ]);
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('returns content the SDK can read', async () => {
    const result = await client.callTool({
      name: 'list_skills',
      arguments: {},
    });
    const content = result.content as Array<{type: string; text: string}>;

    expect(result.isError).toBe(false);
    expect(content[0].type).toBe('text');
    expect(content[0].text).toContain('xb-depth');
  });

  it('answers ping', async () => {
    await expect(client.ping()).resolves.toBeDefined();
  });

  it('surfaces an unknown tool as an error rather than a result', async () => {
    await expect(
      client.callTool({name: 'no_such_tool', arguments: {}})
    ).rejects.toThrow();
  });
});
