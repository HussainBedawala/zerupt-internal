# Performance research brief for Zerupt (plain language)

Context: multi-tenant retail ERP, Next.js on Vercel, NestJS API and Neon Postgres in Singapore, users in UAE and Kuwait. Every claim below was read in the source fetched. Items marked [NOT FETCHED] or [SECONDARY] are flagged.

## 1. Why things feel slow: human limits

### Response Times: The 3 Important Limits
Jakob Nielsen (NN/g, classic 1993, web version). https://www.nngroup.com/articles/response-times-3-important-limits/
- 0.1 s feels instantaneous. The user feels they are directly manipulating the thing, not ordering a computer.
- 1 s is the limit for keeping the user's flow of thought. Users notice the delay. Past it, the UI must show that work is happening.
- 10 s is the limit for keeping attention. Past it, users switch tasks. They need a percent-done indicator and a way to cancel.
Zerupt: a cashier or clerk action should land under 1 s, and anything slower must show progress, never a frozen screen.

### Primer on Web Performance (High Performance Browser Networking, ch. 10)
Ilya Grigorik, 2013. https://hpbn.co/primer-on-web-performance/
- Perception table: 0-100 ms is instant, 100-300 ms is a small delay, 300-1000 ms is "machine is working", 1000+ ms is a likely context switch, 10000+ ms means the task is abandoned.
- Rule of thumb: render or give visual feedback in under 250 ms.
- Belshe's study: going from 5 to 10 Mbps improved page load only about 5%. Each 20 ms of latency removed gave a linear improvement.
- Each extra round trip (DNS, TCP handshake, TLS, request) can add tens to hundreds of ms.
Zerupt: buying customers more bandwidth does nothing for us. Cutting trips between the user and our servers does.

## 2. Distance and round trips

### Primer on Latency and Bandwidth (HPBN ch. 1)
Grigorik. https://hpbn.co/primer-on-latency-and-bandwidth/
- Light in fibre is about 200,000 km/s. New York to London is about 56 ms round trip at the theoretical minimum. New York to Sydney is about 160 ms theoretical and 200-300 ms in practice.
- One transatlantic cable that cut about 5 ms cost over $300M. Distance cannot be bought away. The main lever is moving data closer (CDNs, caching).
- Last-mile latency to the ISP: fibre 10-20 ms, cable 15-40 ms, DSL 30-65 ms (FCC, US data).
- Conclusion in the source: latency, not bandwidth, is usually the bottleneck. Reduce round trips, move data closer, cache and prefetch.
Zerupt: Gulf to Singapore is a long path (my estimate, not from the source; check with a real measurement). Every sequential API call pays that toll again.

### Building Blocks of TCP (HPBN ch. 2)
https://hpbn.co/building-blocks-of-tcp/
- A new connection costs one full round trip before any data flows (56 ms for NY-London). Bandwidth does not change that.
- Slow start: a new connection begins with a small window and doubles each round trip. Growing to 64 KB at 56 ms RTT takes about 168 ms.
- Example in the chapter: a 64 KB fetch took 264 ms on a new connection and 96 ms on a reused one.
Zerupt: reuse connections (keep-alive, pooling). Cold connections are expensive over long distances.

### HTTP/2 (HPBN ch. 12)
https://hpbn.co/http2/
- HTTP/1.x browsers limit about 6 parallel requests per origin. HTTP/2 multiplexes many requests on one connection.
- HTTP/1.x headers cost 500-800 bytes per transfer, more with cookies. Header compression cut header data by 85-88% (SPDY era).
- TCP-level head-of-line blocking still exists, so packet loss slows the whole connection.
Zerupt: many small requests are cheaper than before, but still not free. Fewer is better.

### MDN: CORS and preflight
MDN Web Docs (current). https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS
- A cross-origin request that is not "simple" (for example PUT, DELETE, a JSON Content-Type, or custom headers like Authorization) triggers an extra OPTIONS request first. That is one extra full round trip.
- Access-Control-Max-Age caches the approval. The default when absent is 5 seconds. The example uses 86400. Browsers cap the value (specific caps not listed on the page).
Zerupt: if the web app (Vercel) calls the API on another origin with JSON and auth headers, every call may pay a hidden extra round trip to Singapore. Set a long max-age, or put the API on the same origin.

## 3. Tail latency

### The Tail at Scale
Jeffrey Dean and Luiz Andre Barroso, CACM 56(2), Feb 2013. https://research.google/pubs/the-tail-at-scale/ (abstract). Full text read from the author PDF https://www.barroso.org/publications/TheTailAtScale.pdf
- Example: a server that answers in 10 ms typically but has a 99th-percentile of 1 s. If one request touches 1 server, 1 in 100 requests is slow. If it touches 100 such servers in parallel, 63% of requests take over 1 s.
- Real Google service: 99th-percentile for a single leaf is 10 ms, but for all leaves to finish it is 140 ms.
- Hedged requests: send a backup request only if the first has not answered by the 95th-percentile time. This adds roughly 5% load. In a BigTable benchmark (1,000 keys over 100 servers) a 10 ms hedge cut the 99.9th-percentile from 1,800 ms to 74 ms with 2% more requests.
- Source of slow tails is often interference (queueing, background work), not the request itself.
Zerupt: one screen that calls many things in parallel (dashboard widgets, report builders) is only as fast as its slowest part. Track p95/p99, not averages. Fewer fan-out calls per screen.

## 4. Speed and money

### Speed Matters
Jake Brutlag, Google Research blog / "Speed Matters for Google Web Search" 2009. https://research.google/blog/speed-matters/ (the PDF https://services.google.com/fh/files/blogs/google_delayexp.pdf was binary and not read)
- Server-side delays of 100-400 ms reduced searches per user by 0.2%-0.6% (averaged over 4 or 6 weeks).
- Effect grows with exposure: 200 ms delay cut searches 0.22% in weeks 1-3 and 0.36% in weeks 4-6. 400 ms: 0.44% then 0.76%.
- Effect persisted after removal: after 6 weeks at 400 ms, users did 0.21% fewer searches for the following 5 weeks.
Zerupt: slowness does not just annoy, it erodes usage over weeks and recovers slowly. Fix it before habits form.

### Milliseconds Make Millions
Deloitte / Fifty-Five, commissioned by Google, 2020. https://web.dev/case-studies/milliseconds-make-millions
- 0.1 s improvement in each of four metrics (First Meaningful Paint, input latency, page load, server latency/TTFB): retail conversion +8.4%, travel +10.1%. Travel booking rate +10%, check-out completion +2.2%. Lead-gen page views +7%. Average order value rose (Deloitte summary page via search said +9.2%) [SECONDARY, web.dev page gave no figure].
- Design: 37 brand sites, 30 million+ sessions, 30 days of hourly mobile monitoring end of 2019, no UX redesigns.
- Caveat: gains required every page in the journey to improve on all four metrics. Commissioned by Google.
Zerupt: consumer retail data, not ERP, so treat as directional only. We found nothing equivalent for B2B back-office tools.

### Amazon 100 ms = 1% sales, Akamai study
[NOT FETCHED] Did not locate and read a primary source. Do not cite.

## 5. Core Web Vitals (what browsers and Google measure)

### Web Vitals, LCP, INP
Google web.dev. https://web.dev/articles/vitals , https://web.dev/articles/lcp , https://web.dev/articles/inp
- Measured at the 75th percentile of real page loads, split by mobile and desktop. A page passes only if all three are good.
- LCP (main content visible): good 2.5 s or less, poor over 4.0 s.
- INP (how fast the page responds to clicks and keypresses across the whole visit, worst interactions): good 200 ms or less, poor over 500 ms.
- CLS (layout jumping): good 0.1 or less (poor threshold not on the page I read).
- Business impact figures from web.dev case studies: [NOT FETCHED] (the case-study index page had no numbers).
Zerupt: INP is the one that matters for an ERP (it is mostly clicks and typing). Use p75 from real users, not our own laptop.

### Performance budgets 101
web.dev. https://web.dev/articles/performance-budgets-101
- Default baseline: Time to Interactive under 5 s and under 170 KB of critical-path resources (compressed), on a slow phone over 3G.
- Combine quantity metrics (JS size, request count) with user-centric milestones (FCP, TTI).
- Enforce in the build (Webpack performance limits, bundlesize, Lighthouse CI). When over budget: optimise, remove, or decline to add the thing.
- Set budgets early to avoid backtracking later; keep measuring with real-user data after launch.
Zerupt: a budget fails the build, so slowness cannot sneak in through a normal pull request.

## 6. Regressions creeping in

### Preventing performance regressions with Health Compass and Incident Tracker
Meta Engineering blog, 2020. https://engineering.fb.com/2020/03/05/developer-tools/incident-tracker
- Code changes many times a day, so each change can regress performance. Checks run at every stage: dev-time analysis, CI tests, beta, experiments, production.
- Each stage has blind spots (unrepresentative test inputs, biased beta users), so the next stage catches the rest.
- Production detection compares week-over-week (handles weekday patterns) and release-over-release, uses confidence intervals to discard noise, and merges alerts into one task per issue.
- One config defines each scenario, metric and threshold. Too many alerts was itself a problem. Reported: caught "hundreds" of regressions before release.
Zerupt: one list of key screens with a target each, checked on every release, one alert per problem.

### FBDetect (SOSP 2024) and "Learning to Learn to Predict Performance Regressions at Meta"
Chen, Lin, Tang et al. https://tangchq74.github.io/FBDetect-SOSP24.pdf [PDF NOT READ; abstract details came only from a search summary, SECONDARY: detects regressions as small as 0.005%, about 800,000 time series]. https://arxiv.org/abs/2208.04351 (read abstract): regressing changes are rare vs benign ones, ML pre-filter cuts the search space up to 43%.
Zerupt: too heavy for us. Takeaway only: tiny regressions matter at scale and must be caught per change.

## 7. Database

### PostgreSQL docs: indexes
https://www.postgresql.org/docs/current/indexes-intro.html
- Without an index, a lookup scans the whole table row by row. With one, it walks a few levels of a tree.
- Indexes cost write time and must be kept in sync, so "indexes that are seldom or never used in queries should be removed."
- Building an index on a large table blocks writes by default (use the concurrent option).
Zerupt: every list/search screen filter needs an index. Audit for unused ones.

### PostgreSQL docs: materialized views
https://www.postgresql.org/docs/current/rules-materializedviews.html
- Stores query results like a table, "often much faster" than recomputing. Docs example is a nightly refresh for a sales dashboard.
- Cost: data is only as fresh as the last refresh. Doc example: external data query 188 ms direct vs 0.12 ms from indexed materialized view.
Zerupt: reports and dashboards over many rows should read precomputed summaries, with a stated "as of" time.

### Neon: query performance and cache
https://neon.com/docs/postgresql/query-performance
- Neon caches up to 75% of compute RAM. Cache hit ratio = hits / (hits + misses). Below 99% suggests the working set (data touched often) does not fit in memory. Fix is a larger compute. The doc's sample was 98.08%.
- Stats reset when the compute restarts. A table with more sequential scans than index scans is flagged. The example plan: a sequential scan took about 6.5 s.
Zerupt: check the cache hit ratio per tenant database. Under 99% means slow queries are a memory problem.

### Neon: scale to zero
https://neon.com/docs/introduction/scale-to-zero
- Compute suspends after 5 minutes idle (fixed on Free plan; paid plans can turn scale-to-zero off). Waking takes "a few hundred milliseconds" added to the first request.
- The page did not say whether the cache is lost on suspend. The query-performance page says stats reset on restart, which hints it is, but I did not read a direct statement [UNCONFIRMED].
Zerupt: per-tenant databases that idle overnight wake slow on the first morning request. Turn off scale-to-zero for production tenants.

## 8. Polling vs push

### HPBN: Server-Sent Events and WebSocket
https://hpbn.co/server-sent-events-sse/ , https://hpbn.co/websocket/
- Per message overhead: WebSocket 2-14 bytes, SSE as little as 5 bytes, HTTP/1.x polling an extra 500-800 bytes plus cookies. IP/TCP/TLS add 60-100 bytes regardless.
- Polling delay depends on the poll interval (a message waits for the next request). SSE and WebSocket have no such queueing delay.
- The page's own arithmetic (labelled as mine, not the source's): 1000 clients at 1 message/s is roughly 500-800 KB/s of header overhead with polling vs about 5 KB/s with SSE.
- SSE is simple and one-way, with auto reconnect and Last-Event-ID resume (WHATWG spec https://html.spec.whatwg.org/multipage/server-sent-events.html). Send a comment line about every 15 s so legacy proxies do not drop the connection. Per-server connection limits apply on HTTP/1.
Zerupt: replace repeated "any news?" polling for things like stock or order status with one SSE stream per user.

---

# Principles for our efficiency standard

1. Count round trips, not megabytes. Distance is the cost (Grigorik). Each sequential call from the Gulf to Singapore pays full price, so a screen's budget is a maximum number of sequential calls (suggest 1-2).
2. Put work near the user or remove it. Static assets and cacheable reads via CDN or edge. Consider API and database placement closer to the Gulf; measure before deciding (the sources only prove distance matters, not our specific numbers).
3. Targets, from sources: respond under 100 ms for direct manipulation feel, under 1 s for any action, show progress past 1 s, never exceed 10 s without a cancel (Nielsen).
4. Measure at p75 for real users and p95/p99 for the server, never the average (web.dev, Dean and Barroso). Our own fast laptop proves nothing.
5. Screens that fan out to many calls are as slow as the slowest. Cap fan-out per screen, and treat the slowest sub-query as the screen's speed (Dean and Barroso).
6. Remove hidden round trips: avoid CORS preflights (same origin or long Access-Control-Max-Age), reuse connections, no redirect chains (MDN, HPBN).
7. Index every filter and sort used by a list or search screen, and delete unused indexes because they slow writes (Postgres docs).
8. Reports and dashboards read precomputed summaries with an "as of" time, not live scans of transaction tables (Postgres materialized views).
9. Keep the database warm and in memory: no scale-to-zero for production tenants, watch cache hit ratio above 99% (Neon docs).
10. Use push (SSE) instead of polling for live updates. Polling costs hundreds of times more header overhead and adds delay up to the poll interval (HPBN).
11. Set a performance budget per key screen (JS size, request count, p75 INP 200 ms, LCP 2.5 s) and fail the build when exceeded. Decline or optimise whatever breaks it (web.dev budgets).
12. Watch for creep: compare each release to the previous one on a fixed list of key screens, one alert per issue, noise filtered (Meta). Fix before users habituate: slowness cuts usage and the loss lingers (Brutlag).
