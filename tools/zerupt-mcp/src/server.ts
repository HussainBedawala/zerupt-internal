/**
 * Core MCP server: registers all tools and resources.
 * Transport-agnostic — caller connects it to stdio or HTTP transport.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { ContentBackend } from './content/backend.js';
import { productOverview } from './tools/product-overview.js';
import { listModules } from './tools/list-modules.js';
import { getModuleSpec } from './tools/get-module-spec.js';
import { getCodemap } from './tools/get-codemap.js';
import { search } from './tools/search.js';
import { readFile } from './tools/read-file.js';
import { marketingContext } from './tools/marketing-context.js';
import { sanitiseResponse } from './security.js';

const SEARCH_SCOPE_VALUES = ['specs', 'code', 'docs', 'all'] as const;

export function buildServer(backend: ContentBackend): McpServer {
  const server = new McpServer({
    name: 'zerupt-mcp',
    version: '0.1.0',
  });

  // ── Tools ──────────────────────────────────────────────────────────────────

  server.tool(
    'product_overview',
    'Returns a composed digest of Zerupt product mission and tech stack. ' +
      'Use this to understand what Zerupt is and what it is built with.',
    {},
    async () => {
      const text = await productOverview(backend);
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'list_modules',
    'Lists all Zerupt ERP modules (from erp/docs/CODEMAPS/). ' +
      'Each entry shows the module name and its codemap summary header (AS-BUILT truth).',
    {},
    async () => {
      const text = await listModules(backend);
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'get_module_spec',
    'Read product specs for a module from internal/agent-os/product/{module}/. ' +
      'Omit "file" to list available spec files; provide "file" to read a specific one. ' +
      'SPEC = design intent — use get_codemap to see what is actually built.',
    {
      module: z
        .string()
        .min(1)
        .describe('Module folder name, e.g. "pos", "accounting", "inventory"'),
      file: z
        .string()
        .optional()
        .describe('Filename within the module dir, e.g. "overview.md". Omit to list files.'),
    },
    async ({ module, file }) => {
      const text = await getModuleSpec(backend, module, file);
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'get_codemap',
    'Returns the AS-BUILT codemap for a module from erp/docs/CODEMAPS/{module}.md. ' +
      'Codemaps are pre-computed indexes of routes, services, DB tables, and file paths.',
    {
      module: z
        .string()
        .min(1)
        .describe('Module name, e.g. "accounting", "pos", "inventory"'),
    },
    async ({ module }) => {
      const text = await getCodemap(backend, module);
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'search',
    'Search across Zerupt content. Scope controls what is searched: ' +
      '"specs" = product specs (agent-os), ' +
      '"docs" = erp/docs + study notes, ' +
      '"code" = erp source code, ' +
      '"all" = everything. Returns up to 30 hits with path, line, and snippet.',
    {
      query: z.string().min(1).describe('Search query string'),
      scope: z
        .enum(SEARCH_SCOPE_VALUES)
        .describe('Where to search: specs | code | docs | all'),
    },
    async ({ query, scope }) => {
      const text = await search(backend, query, scope);
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'read_file',
    'Read any allowlisted file by virtual path. ' +
      'Allowlist: internal/agent-os/**, internal/study/**, erp/docs/**, ' +
      'erp/DESIGN.md, erp/README.md, erp/apps/*/src/**, erp/packages/*/src/**.',
    {
      path: z
        .string()
        .min(1)
        .describe(
          'Virtual path, e.g. "erp/DESIGN.md" or "internal/agent-os/product/pos/overview.md"',
        ),
    },
    async ({ path }) => {
      const text = await readFile(backend, path);
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'marketing_context',
    'Returns Zerupt marketing context (messaging, positioning, ICP, GTM). ' +
      'If the file has not been written yet, returns a clear message.',
    {},
    async () => {
      const text = await marketingContext(backend);
      return { content: [{ type: 'text', text }] };
    },
  );

  // ── Resources ──────────────────────────────────────────────────────────────

  const RESOURCES: Array<{
    name: string;
    uri: string;
    virtualPath: string;
    description: string;
  }> = [
    {
      name: 'mission',
      uri: 'zerupt://internal/agent-os/product/mission.md',
      virtualPath: 'internal/agent-os/product/mission.md',
      description: 'Zerupt product mission statement',
    },
    {
      name: 'design',
      uri: 'zerupt://erp/DESIGN.md',
      virtualPath: 'erp/DESIGN.md',
      description: 'Zerupt brand design system and token reference',
    },
    {
      name: 'content-style-guide',
      uri: 'zerupt://internal/agent-os/content-style-guide.md',
      virtualPath: 'internal/agent-os/content-style-guide.md',
      description: 'Zerupt content and messaging style guide',
    },
    {
      name: 'marketing-context',
      uri: 'zerupt://internal/agent-os/marketing-context.md',
      virtualPath: 'internal/agent-os/marketing-context.md',
      description: 'Zerupt marketing context: positioning, ICP, channels',
    },
    {
      name: 'brand',
      uri: 'zerupt://internal/agent-os/brand/brand-foundation.md',
      virtualPath: 'internal/agent-os/brand/brand-foundation.md',
      description: 'Zerupt brand foundation: identity, voice, visual system, and positioning',
    },
  ];

  for (const resource of RESOURCES) {
    const { name, uri, virtualPath, description } = resource;
    server.resource(name, uri, { description, mimeType: 'text/markdown' }, async () => {
      try {
        const text = sanitiseResponse(await backend.getFile(virtualPath));
        return { contents: [{ uri, text, mimeType: 'text/markdown' }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          contents: [{ uri, text: `Resource not yet available: ${msg}`, mimeType: 'text/plain' }],
        };
      }
    });
  }

  return server;
}
