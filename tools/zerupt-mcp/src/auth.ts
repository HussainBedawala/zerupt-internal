/**
 * Bearer-token authentication for HTTP mode.
 *
 * MCP_TOKENS env: comma-separated name:token pairs
 * e.g. "opencode:tok_abc,claudeai:tok_def"
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { checkRateLimit } from './rate-limit.js';

const MIN_TOKEN_LENGTH = 24;

interface TokenEntry {
  readonly name: string;
  readonly digest: Buffer;
}

let tokenEntries: readonly TokenEntry[] | null = null;

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Parse MCP_TOKENS env var and return token entries (name + hash).
 * Fails fast if any token is shorter than MIN_TOKEN_LENGTH chars (M5).
 */
function loadTokenEntries(): readonly TokenEntry[] {
  if (tokenEntries !== null) return tokenEntries;

  const raw = process.env['MCP_TOKENS'] ?? '';
  const entries: TokenEntry[] = [];

  if (raw.trim()) {
    for (const pair of raw.split(',')) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) continue;
      const name = pair.slice(0, colonIdx).trim();
      const token = pair.slice(colonIdx + 1).trim();
      if (!name || !token) continue;

      // M5: validate minimum entropy at startup
      if (token.length < MIN_TOKEN_LENGTH) {
        throw new Error(
          `Token for "${name}" is too short (${token.length} chars). ` +
            `Tokens must be at least ${MIN_TOKEN_LENGTH} characters for adequate entropy.`,
        );
      }

      entries.push({ name, digest: sha256(token) });
    }
  }

  tokenEntries = entries;
  return tokenEntries;
}

/**
 * Validate a bearer token using timing-safe comparison (C1).
 * Iterates ALL entries to avoid early-exit timing on name lookup.
 * Returns the token name or null if invalid.
 */
export function validateToken(token: string): string | null {
  const entries = loadTokenEntries();
  const candidateDigest = sha256(token);

  let matched: string | null = null;
  for (const entry of entries) {
    // Always compare — never break early — to avoid timing oracle on name lookup
    if (timingSafeEqual(candidateDigest, entry.digest)) {
      matched = entry.name;
    }
  }
  return matched;
}

/**
 * Express middleware: require valid Bearer token.
 * Attaches `req.tokenName` for downstream logging.
 */
export const bearerAuthMiddleware: RequestHandler = (
  req: Request & { tokenName?: string },
  res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();

  let name: string | null;
  try {
    name = validateToken(token);
  } catch (err) {
    // Config error — fail closed
    const msg = err instanceof Error ? err.message : 'Token validation error';
    res.status(500).json({ error: msg });
    return;
  }

  if (!name) {
    res.status(401).json({ error: 'Invalid bearer token' });
    return;
  }

  if (!checkRateLimit(name)) {
    res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
    return;
  }

  req.tokenName = name;
  next();
};

/**
 * Reset cached token entries (for testing).
 */
export function resetTokenMap(): void {
  tokenEntries = null;
}
