## 1. E2E Smoke Tests

**What:** A minimal set of end-to-end tests that verify the application is "alive" — the most basic checks that catch catastrophic failures before deeper testing begins.

**Why it matters:** Smoke tests are the first line of defense in your CI pipeline. If the app can't load or the API can't respond, there's no point running hundreds of unit/integration tests. For Zerupt, with a Next.js frontend and NestJS API on separate ports, smoke tests catch broken deployments, missing env vars, and failed DB connections within seconds.

**Key concepts:**

- **Smoke vs. regression tests:** Smoke tests answer "does it start?" — not "does it work correctly?" Keep them fast (<30s) and broad (touch every service once). Regression tests go deep on specific features.
- **Console error collection:** Playwright's `page.on('console')` and `page.on('pageerror')` events capture client-side errors that users would see in the browser console. Collecting these in every test ensures no page load introduces silent JS errors.
- **Graceful skip pattern:** When testing across service boundaries (web → API), the dependency may be unavailable (CI without DB, local without API running). Use `test.skip()` inside a try/catch to mark the test as skipped rather than failed — this keeps the test suite green while surfacing that the check was not performed.
- **Multiple webServers in Playwright:** Playwright's `webServer` config accepts an array, launching multiple processes before tests run. Useful for full-stack smoke tests locally. Use conditional logic (`process.env.CI`) to exclude optional servers in environments where they can't start.

**Resources:**
- [Playwright webServer config](https://playwright.dev/docs/test-webserver)
- [Playwright page events (console, pageerror)](https://playwright.dev/docs/api/class-page#page-event-console)
- [NestJS Terminus health checks](https://docs.nestjs.com/recipes/terminus)

## 2. Playwright Configuration Patterns

**What:** How to structure `playwright.config.ts` for a monorepo with multiple apps, CI/local differences, and TypeScript strict mode.

**Why it matters:** Zerupt runs Next.js on port 3000 and NestJS on port 3001. The Playwright config needs to orchestrate both, handle CI constraints (single worker, no server reuse), and pass TypeScript's strict checks.

**Key concepts:**

- **`as const` assertions:** When extracting webServer objects into variables, TypeScript widens `"pipe"` to `string`, which doesn't satisfy Playwright's literal type. Use `as const` to preserve the literal type.
- **Conditional config:** Use `process.env.CI` ternaries for workers, retries, server reuse, and which webServers to launch. CI environments are single-threaded and ephemeral; local environments are parallel and persistent.
- **`reuseExistingServer`:** Set to `true` locally (don't restart if already running) and `false` in CI (always start fresh). This makes local iteration fast while keeping CI deterministic.

**Resources:**
- [Playwright test configuration](https://playwright.dev/docs/test-configuration)
- [Playwright CI best practices](https://playwright.dev/docs/ci)
