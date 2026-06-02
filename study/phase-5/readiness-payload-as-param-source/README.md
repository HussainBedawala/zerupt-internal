# Readiness Payload as a Param Source

A small but reusable design idea from the DEV-345 follow-up: when a screen needs
identifiers to call a *second* endpoint, hand those identifiers back on the
*first* response instead of making the client resolve them on its own.

## The problem

The go-live screen shows a readiness checklist. One of its checks — "opening
balances reconciled" — has a richer companion view: a tie-out grid that compares
each imported balance against the source figures. That grid is served by a
separate endpoint:

```
GET /tenant/import/reconciliation-summary?legalEntityId=…&asOfDate=…
```

Both query params are required. But the client (the go-live screen) had no clean
way to know them:

- `legalEntityId` is a **server-created** entity — it's minted during
  provisioning, not chosen by the user, so it's nowhere in the onboarding
  answers the wizard collected.
- `asOfDate` lives inside the *latest committed opening-balance run's* summary
  blob — a server record the client never sees.

So the grid was built and tested but left **disabled**: the client literally
couldn't construct the request.

## The options

1. **A new dedicated endpoint** — `GET …/opening-balance-metadata` returning
   `{ legalEntityId, asOfDate }`. Clean contract, but it's a second round-trip
   and a new piece of API surface to version and secure for a two-field answer.
2. **Resolve on the client** — have the web app fetch the legal-entity list and
   the import runs itself and pick. Leaks server-side resolution rules
   ("the *default* entity", "the *latest committed* run") into the frontend,
   where they'll drift.
3. **Piggyback on the readiness response** — the screen *already* calls
   `GET …/go-live-readiness` on mount. Add the two identifiers to that payload.

Option 3 wins: zero new endpoints, zero extra round-trips, and the resolution
rules stay on the server where they belong.

## The non-obvious part: keep pass-through values out of the pure core

The readiness report is produced by a **pure** function (`evaluateReadiness`)
that turns gathered facts into a checklist. It's pure precisely so the business
rules are exhaustively unit-testable with plain objects (see the sibling note
[go-live-readiness-and-state-transition]).

`legalEntityId` and `asOfDate` are *not facts that drive any check* — they're
identity values that just need to ride along to the client. Folding them into the
"facts" the evaluator reasons over would muddy that boundary: a reader could
reasonably wonder whether the as-of date changes a check's outcome (it doesn't).

The fix is to model them as a separate `refs` input threaded *straight through*
to the output, never touched by the rule logic:

```
evaluateReadiness(facts, refs) → { ...checks derived from facts, ...refs }
```

Lesson: when a response object carries both *computed* fields and *pass-through*
identifiers, keep them in separate inputs. The computation stays a pure function
of its real inputs; the passengers are visibly passengers.

## Gate the dependent call on data presence, not on a flag

On the client, the tie-out query is enabled only when **both** params are
non-null. That single condition does double duty:

- It's the technical precondition (you can't call the endpoint without them).
- It's also the *semantic* one: `asOfDate` is null exactly when no opening
  balances were ever committed — i.e. there's nothing to reconcile. So the same
  null that disables the request also correctly means "don't show the grid".

When that's the case the screen falls back to the plain `opening_balances`
readiness check, which already says "no opening balances were imported". No empty
grid, no spinner that never resolves, no special-case flag — the absence of data
*is* the signal.

## Takeaways

- Prefer enriching an existing response over minting a sibling endpoint for a
  couple of derived identifiers — fewer round-trips, one less contract.
- Keep server-side resolution rules ("default", "latest committed") on the
  server; ship the *answer*, not the rule, to the client.
- Separate computed fields from pass-through identifiers so a pure core stays a
  pure function of its real inputs.
- Let the presence/absence of data gate dependent UI, instead of inventing a
  separate boolean — fewer states to keep in sync.
