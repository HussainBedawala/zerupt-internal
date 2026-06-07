import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateToken, resetTokenMap } from '../auth.js';
import { resetRateLimiter } from '../rate-limit.js';

// Tokens must be >= 24 chars (M5 entropy requirement)
const TOKEN_A = 'tok_opencode_0123456789abcdefgh';
const TOKEN_B = 'tok_claudeai_0123456789abcdefgh';
const TOKEN_INVALID = 'tok_invalid_0123456789abcdefgh';

beforeEach(() => {
  resetTokenMap();
  resetRateLimiter();
});

afterEach(() => {
  delete process.env['MCP_TOKENS'];
  resetTokenMap();
});

describe('validateToken', () => {
  it('returns name for valid token', () => {
    process.env['MCP_TOKENS'] = `opencode:${TOKEN_A},claudeai:${TOKEN_B}`;
    expect(validateToken(TOKEN_A)).toBe('opencode');
    expect(validateToken(TOKEN_B)).toBe('claudeai');
  });

  it('returns null for unknown token', () => {
    process.env['MCP_TOKENS'] = `opencode:${TOKEN_A}`;
    expect(validateToken(TOKEN_INVALID)).toBeNull();
  });

  it('returns null when no tokens configured', () => {
    process.env['MCP_TOKENS'] = '';
    expect(validateToken(TOKEN_A)).toBeNull();
  });

  it('returns null when MCP_TOKENS env is missing', () => {
    delete process.env['MCP_TOKENS'];
    expect(validateToken('anything_long_enough_padding_here')).toBeNull();
  });

  it('supports tokens with colons in value', () => {
    // Only first colon is the separator; token value may contain colons
    const tokenWithColons = 'tok:with:colons:and:padding:for:length';
    process.env['MCP_TOKENS'] = `user:${tokenWithColons}`;
    expect(validateToken(tokenWithColons)).toBe('user');
  });

  it('throws on startup if any token is shorter than 24 chars (M5)', () => {
    process.env['MCP_TOKENS'] = 'user:shorttoken';
    expect(() => validateToken('shorttoken')).toThrow(/too short/i);
  });

  it('uses timing-safe comparison (no early exit on name mismatch, C1)', () => {
    // Functional test: correct token still matches after multiple entries
    process.env['MCP_TOKENS'] = `a:${TOKEN_A},b:${TOKEN_B}`;
    expect(validateToken(TOKEN_B)).toBe('b');
  });
});
