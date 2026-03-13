# Auth Setup Checklist

## Env Vars Required

### Frontend (`erp/.env` — exposed to browser via `NEXT_PUBLIC_` prefix)

| Var | Example | Purpose |
|-----|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_<key>` | Browser-safe API key |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Used for email redirect links, OAuth callbacks |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | NestJS API base URL |

### Backend (`erp/.env` — server-only)

| Var | Example | Purpose |
|-----|---------|---------|
| `SUPABASE_SECRET_KEY` | `sb_secret_<key>` | Server-only key for JWT validation in NestJS |

## Supabase Dashboard Config

### Authentication > URL Configuration

| Setting | Local | Production |
|---------|-------|------------|
| Site URL | `http://localhost:3000` | `https://app.zerupt.com` |
| Redirect URLs | `http://localhost:3000/**` | `https://app.zerupt.com/**` |

Redirect URLs is an allowlist. Supabase rejects any redirect not matching. Needed for:
- `/api/auth/callback` (OAuth)
- `/{locale}/confirm` (email confirmation)
- `/{locale}/reset-password` (password reset)

### Authentication > Providers

| Provider | Required | Config needed |
|----------|----------|---------------|
| Email | Yes | Enable confirm email, double confirm changes |
| Google | Optional | Client ID + Secret from Google Cloud Console. Set authorized redirect URI: `https://<ref>.supabase.co/auth/v1/callback` |

### Production Vercel Env Vars

Same as frontend vars above, but with production values. Set in Vercel > Project > Settings > Environment Variables.

## Do NOT

- Expose `SUPABASE_SECRET_KEY` to frontend
- Disable email confirmation in production
- Add `*` as redirect URL in production
- Store tokens in localStorage (cookies only via `@supabase/ssr`)
