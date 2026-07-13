#!/usr/bin/env bash
# Zerupt BRANCH-SCOPE drift check (P2a).
#
# Every data READ on a branch-owned table (the PROTECTED_TABLES / PLANNED_TABLES
# registry) MUST apply branchScopeCondition() so it cannot leak rows across
# branches. This scans apps/api/src for reads (`.from(<table>)` / `db.query.<table>`
# / `.query.<table>`) on those tables — INCLUDING Prettier-wrapped multi-line
# forms where the table name is on a following line — and flags any read that is
# not scoped or explicitly exempt.
#
# Source of truth for the table lists:
#   erp/apps/api/src/tenant/protected-tables.ts
#     PROTECTED_TABLES : WIRED tables (real columns). Reads here GATE (--gate → exit 1).
#     PLANNED_TABLES   : not-yet-wired branch-owned tables. Reads here only WARN,
#                        so the pos/sales/purchase/accounting fan-out is never
#                        silently forgotten.  KEEP THIS LIST COMPLETE — a branch-
#                        owned table that is in NEITHER list is invisible to this
#                        check and can leak silently. When you add a branch-owned
#                        table anywhere, add it here (or to PROTECTED_TABLES).
#
# GRANULARITY — PER-READ and TABLE-AWARE (not per-method "appears anywhere"):
#   Each individual read of a registry table `X` is judged on its own. A read is
#   HANDLED only if ONE of:
#     (a) its ENCLOSING method/function applies `branchScopeCondition("X")` for the
#         SAME table key X (the scope call is tied to the table token, so scoping
#         table A does NOT excuse an unscoped read of table B in the same method),
#     (b) a `// branch-scope-exempt: <reason>` marker sits directly above THAT read
#         (the nearest annotation above it, with no other registry read in between).
#   This links the common "build the condition once, reuse it in the data + count
#   selects" pattern (same table, same method) while catching a second, unscoped
#   read of a different wired table in a method that scopes only the first.
#
# METHOD BOUNDARIES:
#   Enclosing-method detection recognises class methods, standalone `function`
#   declarations, AND class-field arrow methods (`name = async (...) => { ... }` /
#   `name = (...) => {}`), so a read inside an arrow-bound method never inherits
#   the previous method's scope call.
#
# MODULE-AWARE GATING:
#   Only reads in an ALREADY-MIGRATED module escalate to GATED (fail --gate). A read
#   of a wired table from a not-yet-migrated module (reports/pos/sales/purchase/
#   accounting/dashboard) is fan-out backlog and only WARNs. Migrated modules are
#   listed in MIGRATED_MODULE_DIRS below.
#
# EXEMPTIONS (mark the SPECIFIC read, with a precise reason, DIRECTLY above it):
#   `// branch-scope-exempt: <reason>` — for costing engines, posting paths, by-id
#   mutation lookups, tenant-wide existence/uniqueness guards, and line-table reads
#   authorised through an already-branch-scoped parent (viaParent). The marker must
#   be adjacent to the read it exempts; a class-level or method-top marker no longer
#   blanket-exempts every read below it.
#
# SELF-TEST:
#   --self-test runs the detector against inline fixtures proving it CATCHES the two
#   known blind spots (an unscoped second wired read in a method that scopes another
#   table; an unscoped read in a class-field arrow method following a scoped method)
#   and still passes a correctly-scoped read. Exit 0 = all assertions hold.
#
# MODE:
#   --warn (default) : report offenders, ALWAYS exit 0.
#   --gate           : exit 1 if any read on a PROTECTED (wired) table is unhandled.
#   --self-test      : run detector self-tests, exit 1 on any failed assertion.
set -uo pipefail

ROOT="/Users/hus3ain/Development/Zerupt"
API_SRC="$ROOT/erp/apps/api/src"
REGISTRY="$API_SRC/tenant/protected-tables.ts"

MODE="warn"
case "${1:-}" in
  --gate)      MODE="gate" ;;
  --self-test) MODE="self-test" ;;
esac

# Modules already migrated to branchScopeCondition — reads here GATE. Add a module
# dir (path segment right after apps/api/src/) as each fan-out wave completes.
MIGRATED_MODULE_DIRS="accounts,bank-reconciliation,bins,cheques,close-management,dashboard,data-export,doc-numbering,fiscal-period,fx-revaluation,import,inventory,inventory-import,inventory-reconciliation,journal-entries,migration,onboarding,opening-balance,opening-import,pos,public,purchase,reports,sales,subledger-reconciliation,suppliers,tb-import,warehouses,zatca"

perl - "$REGISTRY" "$API_SRC" "$MODE" "$MIGRATED_MODULE_DIRS" <<'PERL'
use strict; use warnings;
my ($registry, $api_src, $mode, $migrated_csv) = @ARGV;
my %migrated_module = map { $_ => 1 } split(/,/, $migrated_csv);

# ── Enclosing-function detector ───────────────────────────────────────────────
# Header lines that open a method/function body: class methods at any indent,
# standalone `function` decls, and class-field ARROW methods (`name = async (…) =>`
# / `name = (…) => {`). Excludes the control keywords that share the `name(` shape.
sub is_header {
  my $s = shift;
  return 0 if $s =~ /^\s*(if|for|while|switch|catch|return|await|const|let|var|else)\b/;
  return 1 if $s =~ /^\s*(export\s+)?(default\s+)?(async\s+)?function\s+[A-Za-z_]/;
  return 1 if $s =~ /^\s*(public|private|protected|static|async|readonly|\*|get|set)\s+[A-Za-z_][\w]*\s*(<[^>]*>)?\s*\(/;
  return 1 if $s =~ /^  [A-Za-z_][\w]*\s*(<[^>]*>)?\s*\([^;]*$/; # 2-indent bare method
  # class-field arrow method: `name = async (…) =>` / `name = (…) => {` (single- or
  # multi-line signature). Requires `=` then optional async/generics then `(`.
  return 1 if $s =~ /^\s*(?:(?:public|private|protected|static|readonly)\s+)*[A-Za-z_][\w]*\s*=\s*(?:async\s+)?(?:<[^>]*>\s*)?\([^;{}]*$/
           && $s !~ /=>/;                                        # multi-line arrow open
  return 1 if $s =~ /^\s*(?:(?:public|private|protected|static|readonly)\s+)*[A-Za-z_][\w]*\s*=\s*(?:async\s+)?(?:<[^>]*>\s*)?\([^;{}]*\)\s*(?::[^=;{]*)?=>/; # single-line arrow
  return 0;
}

# ── Core detector: returns list of offender rows for ONE file's content ────────
# Args: ($content, $rel, \%gated, \%planned, \%migrated_module, $alt)
# Each row: { tag => 'GATED'|'WARN', tbl => X, line => N }
sub detect {
  my ($content, $rel, $gated, $planned, $migrated, $alt) = @_;
  my @lines = split(/\n/, $content, -1);
  my ($module) = ($rel =~ m{^([^/]+)/});
  $module //= $rel;

  # Collect read hits: [tbl, line]. Two shapes, both allowing whitespace/newlines
  # so Prettier-wrapped reads are caught:  .from( <tbl>   and   .query. <tbl>
  my @hits;
  while ($content =~ /\.from\(\s*($alt)\b/g) {
    push @hits, [ $1, 1 + (substr($content, 0, pos($content) - length($1)) =~ tr/\n//) ];
  }
  while ($content =~ /\.query\s*\.\s*($alt)\b/g) {
    push @hits, [ $1, 1 + (substr($content, 0, pos($content) - length($1)) =~ tr/\n//) ];
  }
  return () unless @hits;

  # Set of lines that ARE a registry read (for the "no read in between" exempt rule).
  my %is_read_line = map { $_->[1] => 1 } @hits;

  my @rows;
  for my $h (@hits) {
    my ($tbl, $ln) = @$h;

    # Enclosing method: nearest header at/above the read → nearest header below.
    my $start = 1;
    for (my $i = $ln - 1; $i >= 1; $i--) {
      if (is_header($lines[$i - 1])) { $start = $i; last; }
    }
    my $end = scalar(@lines);
    for (my $i = $ln + 1; $i <= scalar(@lines); $i++) {
      if (is_header($lines[$i - 1])) { $end = $i - 1; last; }
    }

    # (a) SCOPED: enclosing method calls branchScopeCondition("<thisTable>").
    my $window = join("\n", @lines[$start - 1 .. $end - 1]);
    my $qtbl = quotemeta($tbl);
    next if $window =~ /branchScopeCondition\(\s*["']$qtbl["']\s*\)/;

    # (b) EXEMPT: nearest `branch-scope-exempt` marker directly above this read,
    # with NO other registry read line in between (so a marker attaches to exactly
    # one read, never leaking to a second read further down the method).
    my $exempt = 0;
    for (my $i = $ln - 1; $i >= $start; $i--) {
      last if $is_read_line{$i};                 # another read intervenes → stop
      if ($lines[$i - 1] =~ /branch-scope-exempt/) { $exempt = 1; last; }
    }
    next if $exempt;

    my $is_gated = $gated->{$tbl} && $migrated->{$module};
    push @rows, { tag => ($is_gated ? 'GATED' : 'WARN'), tbl => $tbl, line => $ln };
  }
  return @rows;
}

# ── SELF-TEST ─────────────────────────────────────────────────────────────────
# Fixtures prove the detector catches the two false negatives that motivated the
# per-read/table-aware rewrite, and still passes a correctly-scoped read.
if ($mode eq 'self-test') {
  my %g = (stockLedgerEntries => 1, stockAdjustments => 1, stockCounts => 1);
  my %p = ();
  my %mig = (inventory => 1);
  my $alt = join('|', map { quotemeta } sort { length($b) <=> length($a) } (keys %g, keys %p));
  my $fail = 0;
  my $check = sub {
    my ($name, $src, $want_gated_lines) = @_;   # want_gated_lines: arrayref of line numbers expected GATED
    my @rows = detect($src, "inventory/fixture.ts", \%g, \%p, \%mig, $alt);
    my %got = map { $_->{line} => $_->{tag} } @rows;
    my %want = map { $_ => 1 } @$want_gated_lines;
    my $ok = 1;
    for my $l (@$want_gated_lines) { $ok = 0 unless ($got{$l} // '') eq 'GATED'; }
    for my $l (keys %got) { $ok = 0 if $got{$l} eq 'GATED' && !$want{$l}; }
    printf "[self-test] %-55s %s\n", $name, ($ok ? 'PASS' : 'FAIL');
    unless ($ok) {
      $fail = 1;
      printf "           expected GATED lines: %s\n", join(',', @$want_gated_lines);
      printf "           got: %s\n", join(', ', map { "$_=$got{$_}" } sort { $a <=> $b } keys %got) || '(none)';
    }
  };

  # (a) Two reads in one method; only the FIRST table is scoped. The SECOND
  # (unscoped, different wired table) MUST be caught. Old logic passed it.
  my $fa = <<'EOF';
  async list(tenantId) {
    const branchScope = branchScopeCondition("stockAdjustments");
    const a = await db.select().from(stockAdjustments).where(branchScope);
    const b = await db.select().from(stockLedgerEntries).where(eq(x, y));
    return [a, b];
  }
EOF
  # line 4 = `.from(stockLedgerEntries)` unscoped → GATED. line 3 scoped → not.
  $check->("(a) unscoped 2nd wired read in a method scoping another table", $fa, [4]);

  # (b) A class-field arrow method that reads an unscoped wired table, FOLLOWING a
  # normal method that scoped the same table. Old boundary logic let the arrow
  # method's read inherit the previous method's scope call. MUST be caught.
  my $fb = <<'EOF';
  async list(tenantId) {
    const branchScope = branchScopeCondition("stockCounts");
    return await db.select().from(stockCounts).where(branchScope);
  }

  summary = async (tenantId) => {
    return await db.select().from(stockCounts).where(eq(x, y));
  };
EOF
  # line 3 scoped (in list). line 7 in arrow method `summary` unscoped → GATED.
  $check->("(b) unscoped read in class-field arrow method after scoped method", $fb, [7]);

  # (c) A correctly-scoped read (same table) must NOT be flagged — guards against
  # the fix over-reporting and turning green into noise.
  my $fc = <<'EOF';
  async list(tenantId) {
    const branchScope = branchScopeCondition("stockCounts");
    return await db.select().from(stockCounts).where(branchScope);
  }
EOF
  $check->("(c) correctly-scoped read is NOT flagged", $fc, []);

  # (d) An adjacent exempt marker handles its read, but a second unscoped wired
  # read below (no marker of its own) is still caught.
  my $fd = <<'EOF';
  async posting(tenantId) {
    // branch-scope-exempt: by-id posting lookup
    const h = await db.select().from(stockCounts).where(eq(id, x));
    const l = await db.select().from(stockLedgerEntries).where(eq(x, y));
  }
EOF
  # line 3 exempt (marker adjacent). line 4 unscoped, no marker → GATED.
  $check->("(d) adjacent exempt marker does NOT leak to a 2nd read", $fd, [4]);

  print $fail ? "[self-test] FAIL\n" : "[self-test] OK: all assertions hold.\n";
  exit($fail ? 1 : 0);
}

# ── Parse the two registry key lists from protected-tables.ts ─────────────────
open(my $rf, '<', $registry) or die "cannot open $registry: $!";
my @rlines = <$rf>; close($rf);
my (%gated, %planned);
my $block = '';   # 'gated' | 'planned' | ''
for my $l (@rlines) {
  if    ($l =~ /export const PROTECTED_TABLES\s*=\s*\{/) { $block = 'gated';   next; }
  elsif ($l =~ /export const PLANNED_TABLES[^=]*=\s*\{/) { $block = 'planned'; next; }
  if ($block eq 'gated'   && $l =~ /^\}\s*satisfies/) { $block = ''; next; }
  if ($block eq 'planned' && $l =~ /^\};/)            { $block = ''; next; }
  next unless $block;
  # Top-level key: exactly two leading spaces, identifier, colon, brace.
  if ($l =~ /^  ([A-Za-z][A-Za-z0-9]*):\s*\{/) {
    $gated{$1}   = 1 if $block eq 'gated';
    $planned{$1} = 1 if $block eq 'planned';
  }
}
my @tables = sort { length($b) <=> length($a) } (keys %gated, keys %planned);
unless (@tables) { print "[branch-scope] ERROR: parsed 0 registry tables\n"; exit 2; }
my $alt = join('|', map { quotemeta } @tables);

# ── Scan source files ─────────────────────────────────────────────────────────
my @files;
{
  my @dirs = ($api_src);
  while (@dirs) {
    my $d = shift @dirs;
    opendir(my $dh, $d) or next;
    for my $e (readdir($dh)) {
      next if $e eq '.' || $e eq '..';
      my $p = "$d/$e";
      if (-d $p) { push @dirs, $p; next; }
      next unless $p =~ /\.ts$/;
      next if $p =~ /\.spec\.ts$/;
      next if $p =~ /\.e2e-spec\.ts$/;
      next if $p =~ m{/__tests__/};        # test helpers/harnesses/fixtures are not runtime reads
      next if $p =~ m{/tenant/protected-tables\.ts$};
      next if $p =~ m{/tenant/branch-scope\.ts$};
      push @files, $p;
    }
  }
}

my ($total, $gated_off) = (0, 0);
my @rows;

for my $file (sort @files) {
  open(my $fh, '<', $file) or next;
  local $/; my $content = <$fh>; close($fh);
  my $rel = $file; $rel =~ s/^\Q$api_src\E\///;

  for my $r (detect($content, $rel, \%gated, \%planned, \%migrated_module, $alt)) {
    $gated_off++ if $r->{tag} eq 'GATED';
    $total++;
    push @rows, "[$r->{tag}] $r->{tbl}  ->  $rel:$r->{line}";
  }
}

print "$_\n" for sort @rows;
print "\n";
printf "[branch-scope] tables tracked: %d (gated: %d, planned: %d)\n",
  scalar(@tables), scalar(keys %gated), scalar(keys %planned);
printf "[branch-scope] unhandled reads: %d (of which on gated tables: %d)\n",
  $total, $gated_off;

if ($mode eq 'gate') {
  if ($gated_off > 0) {
    printf "[branch-scope] FAIL: %d read(s) on wired tables bypass branchScopeCondition.\n", $gated_off;
    exit 1;
  }
  print "[branch-scope] OK: all wired-table reads are scoped or exempt.\n";
}
exit 0;
PERL
