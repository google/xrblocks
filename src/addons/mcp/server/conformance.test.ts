// @vitest-environment node
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {afterAll, beforeAll, expect, it} from 'vitest';
import {loadSkills} from './index.js';

const client = new Client({name: 'xrblocks-tests', version: '0.0.0'});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('./bin.js', import.meta.url))],
});
beforeAll(async () => {
  await client.connect(transport);
});
afterAll(async () => {
  try {
    await client.close();
  } finally {
    await transport.close();
  }
});

it('lists packaged skills and returns the selected skill through a standard MCP client', async () => {
  const skill = loadSkills()[0];
  expect(skill).toBeDefined();
  const listed = await client.callTool({name: 'list_skills', arguments: {}});
  expect(listed.isError).toBe(false);
  expect(listed.content).toEqual([
    {type: 'text', text: expect.stringContaining(skill.name)},
  ]);
  const result = await client.callTool({
    name: 'get_skill',
    arguments: {name: skill.name},
  });
  expect(result.isError).toBe(false);
  expect(result.content).toEqual([
    {type: 'text', text: readFileSync(skill.path, 'utf8')},
  ]);
});

it('rejects an unknown tool through the MCP protocol', async () => {
  await expect(
    client.callTool({name: 'no_such_tool', arguments: {}})
  ).rejects.toThrow(/Unknown tool/);
});
