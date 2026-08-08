#!/usr/bin/env node
/**
 * Executable entry point for the XR Blocks MCP server.
 *
 * Kept separate from `index.js` so that module stays importable: a shebang at
 * the top of an ES module breaks the transform some bundlers and test runners
 * apply when importing it.
 *
 * Run with:
 *
 *   npx xrblocks-mcp
 */
import {serve} from './index.js';

serve();
