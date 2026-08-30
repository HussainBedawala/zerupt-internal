# Vehicle label ambiguity — root cause of the "50+ duplicate Expedition" report

Investigated by the orchestrator, 2026-08-26. The open question carried into this session was:
"Vehicle picker returns 50+ near-duplicate 'Expedition 2006-2011' entries. NOT root-caused. If
it's real data rather than seed noise, fitment selection is unusable."

It is BOTH, and they are two separate things. One is a real shipped-code bug. One is not.

---

## PACK-001 — Vehicle display label omits `engine`, the field that actually distinguishes rows
**Severity: HIGH · CONFIRMED**

`erp/apps/web/src/features/auto-parts/components/vehicle-picker.tsx:26`

```ts
function vehicleLabel(v: Vehicle, t) {
  const years = ...;                                  // yearFrom-yearTo
  const parts = [v.model, years, v.trim].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : t("vehiclePicker.untitledVehicle");
}
```

The label is built from **model + years + trim**. It omits **`engine`**.

The database's own uniqueness contract disagrees with that label:

```
"vehicles_tenant_make_model_year_engine_key" UNIQUE, btree (
    tenant_id, make_id, lower(btrim(model)),
    COALESCE(year_from, -1), COALESCE(year_to, -1),
    lower(btrim(COALESCE(engine, '')))          <-- engine is part of identity
)
```

So `engine` is load-bearing for identity, and it is the one identity field the user is never
shown. Meanwhile `trim` — the only disambiguator the label DOES carry beyond model and years —
is **NULL for 100% of rows in this tenant**:

```
select count(*) from vehicles;                                   -> 4555
select ... count(distinct v.trim) ... group by make, model, years -> 0 trims, every group
```

### Blast radius, measured

```sql
select count(*) from (
  select make_id, lower(btrim(model)), year_from, year_to
  from vehicles group by 1,2,3,4 having count(*) > 1
) t;
-- 1428
```

**1,428 groups of vehicles render as byte-identical strings in the picker.** Worst cases have
six rows collapsing to one visible label:

```
 make       | model     | years     | rows | distinct engines | distinct trims
 Nissan     | Altima    | 2013-2019 |   6  |        6         |       0
 Honda      | Civic     | 2005-2011 |   6  |        6         |       0
 Kia        | Sportage  | 2007-2012 |   6  |        6         |       0
 Ford       | F-150     | 2012-2018 |   5  |        5         |       0
```

### Why this is HIGH, not cosmetic

Fitment is the auto-parts pack's reason to exist. A counter clerk picking the vehicle a part
fits is choosing between six visually identical options where only the hidden engine differs.
They cannot make a correct choice except by luck. A wrong pick writes a wrong fitment, which
then silently mis-answers every future "what fits this car?" query. It is a correctness bug
wearing a formatting bug's clothes.

### Fix

Include `engine` in the label whenever it is present, e.g.
`Altima 2013-2019 · 2.0L`. `engine_code` is also available and empty here, so `engine` is the
right field. `trim` should stay in the label but cannot be relied on as the disambiguator.

Note the label is used in two places in this file — line 105 (`options` for the combobox) and
line 134 (`onVehicleLabelChange`, which feeds the selected-vehicle chip elsewhere). **Both go
through the same `vehicleLabel` function, so a single fix covers both** — but per method rule 1,
grep for any other hand-rolled vehicle label before calling it done, and verify the rendered
option text in the browser rather than trusting the unit test.

---

## NOT A BUG — the "Expedition" duplicates themselves are seed noise
**Severity: none (data quality, dev tenant only) · CONFIRMED**

The specific rows that triggered the original report are fabricated seed data, not a product
defect. Evidence:

```
 make | model      | year_from | year_to | engine
 Ford | Expedition |      2005 |    2009 | 1.6L
 Ford | Expedition |      2005 |    2010 | 1.6L
 Ford | Expedition |      2005 |    2008 | 2.0L
 Ford | Expedition |      2005 |    2009 | 2.0L
 ...
```

- A Ford Expedition is a full-size SUV. **It has never been sold with a 1.6L engine.**
- The identical six engine sizes (1.6 / 2.0 / 2.4 / 3.5 / 4.0 / 5.7) recur across every make and
  model in the table, including a Nissan Altima with a 5.7L.
- Year ranges are randomly overlapping (2005-2009, 2005-2010, 2005-2008, 2005-2011 for the same
  model and engine). Real vehicle data has non-overlapping generation ranges.

Because `year_to` is randomized and part of the unique key, each of these is a legitimately
distinct ROW — the constraint is working correctly. They only *look* like duplicates because of
PACK-001 above.

**Conclusion for the programme:** do not spend time "de-duplicating vehicles". There is nothing
to de-duplicate. Fix the label. The seed generator should be tightened separately so future test
tenants get plausible data, but that is a fixture concern, not a shipped-code finding.
