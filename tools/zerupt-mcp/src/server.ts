/**
 * Core MCP server: registers all tools and resources.
 * Transport-agnostic — caller connects it to stdio or HTTP transport.
 *
 * Scope: serves ONLY agent-os marketing/product knowledge (internal/agent-os/**).
 * The erp/ code repo is intentionally NOT served.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { ContentBackend } from './content/backend.js';
import { productOverview } from './tools/product-overview.js';
import { getBrand } from './tools/get-brand.js';
import { listPersonas } from './tools/list-personas.js';
import { getPersona } from './tools/get-persona.js';
import { listFeatures } from './tools/list-features.js';
import { getModuleSpec } from './tools/get-module-spec.js';
import { getWebsiteInfo } from './tools/get-website-info.js';
import { marketingContext } from './tools/marketing-context.js';
import { search } from './tools/search.js';
import { sanitiseResponse } from './security.js';

const BRAND_SECTION_VALUES = ['foundation', 'story', 'design-system', 'voice', 'all'] as const;
const FEATURE_STATUS_VALUES = ['shipped', 'planned', 'all'] as const;
const WEBSITE_DOC_VALUES = ['digest', 'seo', 'experience', 'copy', 'all'] as const;
const SEARCH_SCOPE_VALUES = ['brand', 'marketing', 'product', 'customers', 'all'] as const;

export function buildServer(backend: ContentBackend): McpServer {
  const server = new McpServer({
    name: 'zerupt-mcp',
    version: '0.2.0',
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
    'get_brand',
    'Returns Zerupt brand essentials. ' +
      'section="foundation" → brand identity, values, positioning. ' +
      'section="story" → narrative and origin story. ' +
      'section="design-system" → visual tokens, colours, typography. ' +
      'section="voice" → content style guide and tone of voice. ' +
      'section="all" (default) → all sections concatenated (may be truncated).',
    {
      section: z
        .enum(BRAND_SECTION_VALUES)
        .optional()
        .describe('Which brand section to return (default: all)'),
    },
    async ({ section }) => {
      const text = await getBrand(backend, section ?? 'all');
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'list_personas',
    'Lists all Zerupt customer personas and journey files under agent-os/customers/. ' +
      'Each entry shows the virtual path and the first heading from the file.',
    {},
    async () => {
      const text = await listPersonas(backend);
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'get_persona',
    'Returns the content of a persona spec or customer journey file matching the given name. ' +
      'Use list_personas first to discover available entries.',
    {
      name: z
        .string()
        .min(1)
        .describe('Persona or journey name, e.g. "ksa", "yousef", "kuwait-customer-journey"'),
    },
    async ({ name }) => {
      const text = await getPersona(backend, name);
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'list_features',
    'Lists Zerupt features from the product feature catalog. ' +
      'Omit "module" to return the master catalog index. ' +
      'Provide "module" (e.g. "pos", "accounting") to get that module\'s catalog file. ' +
      '"status" filters entries: shipped | planned | all (default all).',
    {
      module: z
        .string()
        .optional()
        .describe('Module name, e.g. "pos", "accounting", "inventory". Omit for master index.'),
      status: z
        .enum(FEATURE_STATUS_VALUES)
        .optional()
        .describe('Filter by feature status: shipped | planned | all (default: all)'),
    },
    async ({ module, status }) => {
      const text = await listFeatures(backend, module, status ?? 'all');
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'get_module_spec',
    'Read product specs for a module from internal/agent-os/product/modules/{module}/. ' +
      'Omit "file" to list available spec files; provide "file" to read a specific one.',
    {
      module: z
        .string()
        .min(1)
        .describe('Module folder name, e.g. "pos", "accounting", "inventory"'),
      file: z
        .string()
        .optional()
        .describe('Filename within the module dir, e.g. "README.md". Omit to list files.'),
    },
    async ({ module, file }) => {
      const text = await getModuleSpec(backend, module, file);
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'get_website_info',
    'Returns Zerupt website documentation from agent-os/marketing/website/. ' +
      'doc="digest" (default) → high-level site digest. ' +
      'doc="seo" → SEO strategy. ' +
      'doc="experience" → experience and journey. ' +
      'doc="copy" → copy and keywords. ' +
      'doc="all" → all docs concatenated.',
    {
      doc: z
        .enum(WEBSITE_DOC_VALUES)
        .optional()
        .describe('Which website doc to return (default: digest)'),
    },
    async ({ doc }) => {
      const text = await getWebsiteInfo(backend, doc ?? 'digest');
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

  server.tool(
    'search',
    'Search across Zerupt agent-os knowledge. ' +
      'scope="brand" = brand/ folder, ' +
      'scope="marketing" = marketing/ folder, ' +
      'scope="product" = product/ folder, ' +
      'scope="customers" = customers/ folder, ' +
      'scope="all" = entire agent-os. Returns up to 30 hits with path, line, and snippet.',
    {
      query: z.string().min(1).describe('Search query string'),
      scope: z
        .enum(SEARCH_SCOPE_VALUES)
        .describe('Where to search: brand | marketing | product | customers | all'),
    },
    async ({ query, scope }) => {
      const text = await search(backend, query, scope);
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
      uri: 'zerupt://internal/agent-os/brand/design-system.md',
      virtualPath: 'internal/agent-os/brand/design-system.md',
      description: 'Zerupt brand design system and token reference',
    },
    {
      name: 'content-style-guide',
      uri: 'zerupt://internal/agent-os/marketing/content-style-guide.md',
      virtualPath: 'internal/agent-os/marketing/content-style-guide.md',
      description: 'Zerupt content and messaging style guide',
    },
    {
      name: 'marketing-context',
      uri: 'zerupt://internal/agent-os/marketing/marketing-context.md',
      virtualPath: 'internal/agent-os/marketing/marketing-context.md',
      description: 'Zerupt marketing context: positioning, ICP, channels',
    },
    {
      name: 'brand-foundation',
      uri: 'zerupt://internal/agent-os/brand/brand-foundation.md',
      virtualPath: 'internal/agent-os/brand/brand-foundation.md',
      description: 'Zerupt brand foundation: identity, voice, visual system, and positioning',
    },
    {
      name: 'feature-catalog',
      uri: 'zerupt://internal/agent-os/product/feature-catalog/README.md',
      virtualPath: 'internal/agent-os/product/feature-catalog/README.md',
      description: 'Master feature catalog index across all Zerupt modules',
    },
    {
      name: 'website-digest',
      uri: 'zerupt://internal/agent-os/marketing/website/digest.md',
      virtualPath: 'internal/agent-os/marketing/website/digest.md',
      description: 'Zerupt website digest — high-level summary of site content and structure',
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
