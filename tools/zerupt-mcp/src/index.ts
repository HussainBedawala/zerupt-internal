/**
 * Entry point. Selects transport based on MCP_TRANSPORT env (default: stdio).
 */
import type { ContentBackend } from './content/backend.js';
import { buildServer } from './server.js';

async function resolveBackend(): Promise<ContentBackend> {
  if (process.env['GITHUB_TOKEN']) {
    const { createGitHubBackend } = await import('./content/github-backend.js');
    return createGitHubBackend();
  }
  if (process.env['LOCAL_CONTENT_ROOT']) {
    const { createLocalBackend } = await import('./content/local-backend.js');
    return createLocalBackend();
  }
  throw new Error(
    'No backend configured. Set GITHUB_TOKEN (GitHub backend) or LOCAL_CONTENT_ROOT (local backend).',
  );
}

async function startStdio(backend: ContentBackend): Promise<void> {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  // Stdio: single long-lived server instance is correct (persistent connection)
  const server = buildServer(backend);
  const t = new StdioServerTransport();
  await server.connect(t);
  // Stdio transport manages lifetime via stdin/stdout
}

async function startHttp(backend: ContentBackend): Promise<void> {
  // H8: fail fast if MCP_TOKENS is unset — every request would 401 silently otherwise
  if (!process.env['MCP_TOKENS']?.trim()) {
    throw new Error(
      'MCP_TOKENS env var is required in HTTP mode. ' +
        'Set it to comma-separated name:token pairs, e.g. "opencode:tok_abc,claudeai:tok_def".',
    );
  }

  const express = (await import('express')).default;
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  );
  const { bearerAuthMiddleware } = await import('./auth.js');

  const app = express();
  // L1: explicit body size limit
  app.use(express.json({ limit: '1mb' }));

  const PORT = parseInt(process.env['PORT'] ?? '3100', 10);

  // M6: ACCEPTED — /healthz is intentionally unauthenticated for Railway health checks
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  // MCP Streamable HTTP — stateless per-request transport
  // H6: build a fresh McpServer per request so connect() is never called on a shared instance
  app.all('/mcp', bearerAuthMiddleware, async (req, res) => {
    // tokenName is attached by bearerAuthMiddleware
    const extReq = req as typeof req & { tokenName?: string };
    const tokenName = extReq.tokenName ?? 'unknown';
    const startMs = Date.now();

    // H6: fresh server + transport per stateless request; close after handling
    const server = buildServer(backend);
    // Stateless mode: omit sessionIdGenerator entirely
    const t = new StreamableHTTPServerTransport({});
    await server.connect(t);

    res.on('finish', () => {
      const ms = Date.now() - startMs;
      // M9: structured single-line JSON log; never log token values
      console.error(
        JSON.stringify({
          svc: 'zerupt-mcp',
          token: tokenName,
          method: req.method,
          ms,
        }),
      );
      // H6: close transport (and server) after the stateless request completes
      t.close().catch(() => {
        // Best-effort cleanup; ignore errors on close
      });
    });

    await t.handleRequest(req, res, req.body as unknown);
  });

  app.listen(PORT, () => {
    // M9: structured startup log
    console.error(JSON.stringify({ svc: 'zerupt-mcp', msg: `HTTP server listening on port ${PORT}` }));
  });
}

(async () => {
  const transportMode = (process.env['MCP_TRANSPORT'] ?? 'stdio').toLowerCase();
  const backend = await resolveBackend();

  if (transportMode === 'http') {
    await startHttp(backend);
  } else {
    await startStdio(backend);
  }
})().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ svc: 'zerupt-mcp', level: 'fatal', msg }));
  process.exit(1);
});
