# CLAUDE.md — VCS (Vendor Contract Scheduler) Build Rules & State

**Last updated:** Sun Jul 05, 2026 — 2:15 PM EDT
**Current checkpoint:** MD5 `88dda15dd8e071de63421627fb0237e7`, 31,319 lines

Read this in full before touching the file. This is a large, single-file
production app with no test suite and one shared live database — mistakes
here aren't caught by CI, they're caught by David hitting them days later.

---

## WHAT THIS IS

Single-file HTML/JS app (~30.7k lines). Vendor + Customer + Contract CRM for
Prime Source Expense Experts. David Genuth (COO) is sole technical approver.

- Sandbox: `github.com/dgenuth/vcs` (PUBLIC) → `dgenuth.github.io/vcs/`
- Production: `github.com/dgenuth/primesource-cms` (PRIVATE) → `cms.primesourcex.com`
- Data: ONE shared Supabase database (`sjooaeopwimukmhgfwxs.supabase.co`) —
  sandbox and production read/write the SAME live data. There is no safe
  sandbox copy of the data, only of the code.
- Config/auth bridge: Google Apps Script (GAS) proxy
- Auth: Microsoft (MSAL) + Google OAuth, custom approved-users list (NOT
  Supabase's native auth)
- Salesforce: custom `Vendor__c` object for vendor matching (NOT standard
  `Account` — this has caused real bugs, see below)

## NON-NEGOTIABLE WORKFLOW RULES

1. **Always pull the live file fresh before editing**:
   `curl -s "https://raw.githubusercontent.com/dgenuth/vcs/main/index.html?nocache=$(date +%s%N)"`
   Verify against the last known-good MD5 before assuming it's current.
2. **acorn is the authoritative syntax check, not `node --check`** — template
   literal complexity in this file gives `node --check` false confidence.
   `npm install -g acorn` (cwd `/tmp`), parse the extracted inline `<script>`
   block(s), confirm zero parse errors. Raw `{`/`}` count mismatches are
   expected noise (string literals, comments) — a clean acorn parse is what
   matters, not a matched brace count.
3. **One verified batch at a time.** Group related changes, but don't mix
   unrelated fixes into one unverified diff — if something breaks, you want
   to know which change did it.
4. **Check line count before/after every batch.** An unexplained drop is a
   red flag — investigate before proceeding, don't just note it.
5. **Check for duplicate function declarations** on anything touched.
6. **`render()` is a full app restart** — never call from within a tab's own
   render function. `renderToday()` and similar never clear their own
   container carelessly — check existing patterns before adding new ones.
7. **Never patch a corrupted file incrementally** — if something's
   structurally broken, stop and report rather than guessing forward.
8. **Before removing anything claimed to be "duplicate" or "unused,"** read
   the FULL section, not a keyword match. This file has a real history of
   sections that looked redundant but had one genuinely unique field/control
   buried in them (see Section "Known traps" below).
9. **GAS proxy fetches must use `Content-Type: text/plain`** with
   `JSON.stringify(payload)` as body — `application/json` triggers a CORS
   preflight that fails from `dgenuth.github.io`.
10. **Never commit secrets** — API keys/credentials are entered by admins at
    runtime and synced via the GAS backend, never hardcoded in source.
11. **A parallel Claude Chat session (skill-based `/spec`→`/build`→`/review`
    workflow, local working copy at `C:\VCS\`) develops this same repo
    concurrently.** `git fetch` immediately before every push, not just at
    session start — pushes have been rejected mid-session more than once
    because of this. On a non-fast-forward rejection, inspect the incoming
    commit's diff before deciding to rebase — it has always been safe to
    rebase so far (no real conflicts yet), but verify each time rather than
    assuming. Both lineages independently use "S<N>" labels in code comments
    for unrelated content — an "S50" comment does not reliably identify
    which lineage wrote it.
12. **As of 2026-07-05, all pushes to `dgenuth/vcs` go through this git
    workflow — the other conversation no longer deploys via GitHub's
    web-based file editor.** Manual paste-deploys were unreliable at this
    file's size (~2MB, 31k+ lines) and once created stray duplicate files
    (`index (4).html`) instead of overwriting `index.html` — the likely
    cause of a run of "I don't see any changes" reports. If a stray
    `index (N).html` ever reappears in the repo root, it's dead (the site
    only ever serves `index.html`) — delete it, don't try to reconcile it.

## KNOWN TRAPS (bugs already found — check these mechanisms first if a
similar symptom reappears; don't rediscover them from scratch)

- **`loadSettings()` vs `loadConfigFromDrive()` — same guard pattern, opposite
  correctness.** `loadConfigFromDrive()` correctly uses `!S.settings[k]` to
  avoid a stale remote value stomping a fresher local one. `loadSettings()`
  had the SAME guard copy-pasted in, but its only job is restoring the
  user's own localStorage — there's no freshness conflict there, and the
  guard silently blocked restoring `theme`, `defaultView`, and other
  settings whose hardcoded default happens to be truthy. Fixed — but if a
  "setting doesn't persist" bug shows up again, check this pattern first.
- **`hasPermission('addVendor')` used to ignore the per-user featureFlags
  override entirely** — same bug class as the pre-existing (already-fixed)
  showFinancials issue. Any toggle that's supposed to gate behavior needs to
  actually be read by the function doing the gating — verify, don't assume,
  when adding a new permission toggle.
- **Role-level default UI reading a different, unread storage key than the
  function that actually resolves defaults.** `getDefaultHiddenFields(role)`
  is the single source of truth every real permission path reads — but the
  Role & Feature Defaults → Field Visibility Defaults page (and its "See
  Financials" bulk toggle) used to read/write its OWN separate
  `vcs_role_fields_<role>` localStorage key that `getDefaultHiddenFields()`
  never consulted. Result: the page showed "everything visible" for every
  role regardless of that role's real hardcoded restrictions, and toggling
  a field there was purely cosmetic — zero effect on any real user. Fixed:
  `getDefaultHiddenFields()` now checks that key first. The Field Visibility
  Defaults section seeds its initial display from `getDefaultHiddenFields(role)`
  (not an empty set) whenever the key has never been explicitly saved, and
  immediately persists that seed — so the key is never actually unset again,
  which is also what keeps the "See Financials" bulk toggle (a separate
  collapsible section reading the same key) safe even though it never
  triggers that persistence itself: `_roleSub()`'s builder callback runs
  unconditionally at construction time regardless of collapse state, and
  Field Visibility Defaults is always constructed first in a role's body, so
  by the time either toggle handler can fire the key is already populated
  with a real array. Both individual field-toggle and "See Financials"
  bulk-toggle write handlers were ALSO independently hardened to seed from
  `getDefaultHiddenFields(role)` rather than assume a non-null key — pure
  defense in depth on top of the ordering guarantee above, not required for
  correctness but cheap insurance if that ordering ever changes. **This exact
  fix landed from both this lineage and the parallel session independently,
  within the same session window** — reconciled via `git rebase` after
  `getDefaultHiddenFields` auto-merged with BOTH checks present (the second,
  now-unreachable one was removed). If a "Role & Feature Defaults page
  doesn't match reality" bug shows up again for some OTHER control on that
  page, check for this exact same disconnected-storage-key pattern first.
- **Vendor panel matches Salesforce's custom `Vendor__c` object, not
  standard `Account`.** Any new Salesforce link/query on the vendor panel
  needs `/lightning/r/Vendor__c/`, not `/lightning/r/Account/`. Found two
  icons hardcoded to the wrong object type already (fixed).
- **`PAGE_HIERARCHY` vs `NAV_DEFS`** — NAV_DEFS is the true master list of
  every page/tab. PAGE_HIERARCHY (drives the Tab Access UI) is a separately
  maintained list; an auto-reconciliation IIFE catches anything missing and
  auto-adds it, but tacks it onto the END regardless of logical position —
  if something's in the wrong place in Tab Access, check whether it's
  explicitly listed in PAGE_HIERARCHY or falling through to that catch-all.
- **`lastComm`** (drives Summary page "Recently Contacted") was ONLY ever
  set by the separate "Mark Done" action — Add Note and Log Activity never
  touched it. Fixed, but this is a good example of "the field exists, but
  check who's actually allowed to write to it" being worth verifying
  whenever a "why doesn't X show up" question comes up.
- **Google Drive "Connected" status** — `S.settings.driveFileId` being set
  (global config) is NOT the same thing as the current session having a
  valid personal OAuth token (`window.GDriveToken`). The GAS proxy is the
  real primary sync path and needs no personal token at all for most users.
  Use `window._vcsDriveProxyVerified || window.GDriveToken` as the accurate
  "is Drive actually working" signal, not `driveFileId` alone and not
  `GDriveToken` alone.
- **Collapsible sections**: default state is controlled by a mix of
  `makeCollapsibleSection(sec, title, storageKey, defaultCollapsed)` calls
  and several bespoke inline collapse headers. All were audited and set to
  default collapsed. A one-time migration (`vcs_collapse_migration_v1` in
  localStorage) clears pre-existing "open" state from before that audit —
  don't re-trigger confusion by adding new collapsible sections that
  default to open without a reason.
- **`vcs_role_fields_<role>` / `vcs_role_field_edit_<role>` are pure
  localStorage — never synced to the backend.** Unlike `vcs_role_tab_overrides`
  (pushed via `saveConfigToDrive()` inline on every toggle) and
  `S.settings.roleDefaults` (pushed via `debouncedSaveSettings()`), these two
  Field Visibility Defaults keys are read/written directly against
  localStorage and are not in `GLOBAL_SETTING_KEYS`, so no save path — not
  even the section's own "Apply Changes" button — pushes them anywhere.
  Found while wiring that button (2026-07-05): it only flushes the
  *propagated per-user* `hiddenFields`/`fieldEditPerms` change via
  `saveUsersViaProxy()`, since that's the only part of this section that
  actually reaches the backend. If role-level Field Visibility Defaults ever
  need to sync across an admin's devices, this is the gap to close.
- **Settings section header styling drifts independently per section —
  there is no single shared component every section uses.** Only
  `makeCollapsibleSection()` and `settingsCard()` are actually shared
  functions; Connections & API Keys, Role & Feature Defaults, User
  Management, Calendar Availability, and Field Registry each build their
  own bespoke header inline. Found 2026-07-05: every one of those had
  drifted from the Connections & API Keys reference style (11px/600/blue
  title, 9px arrow, 8px 12px row padding) in at least one dimension — some
  in padding only, some in the title's font-weight/color too (`settingsCard`
  was 700/var(--text) instead of 600/var(--blue)). All reconciled to match.
  **If a "sections look inconsistent" report comes in again, check each
  section's OWN header-building code — don't assume fixing the shared
  helpers covers the bespoke ones.**
- **A newly created custom role must clone the REAL, live-resolved value
  for every one of the 4 role-level default stores, not just copy a raw
  storage key.** `createCustomRole()` clones tab access via
  `resolveRoleTabState()` (shared with the Tab Access Defaults page's own
  `roleTabState()` — a thin per-role wrapper around it), field visibility
  via `getDefaultHiddenFields()`, per-field edit defaults via
  `getRoleFieldEditDefault()`, and feature flags via
  `getDefaultFeatureFlags()`/`getRoleFeatureDefault()` — all real accessors
  that already handle the source role's own hardcoded-fallback vs.
  admin-customized-override distinction correctly. A version found
  2026-07-05 only cloned field visibility and feature flags, silently
  dropping tab access and per-field edit defaults for every new role.
- **Renaming a role's internal KEY (not just its display label) is
  intentionally restricted to custom roles.** Built-in role keys are
  referenced by 275+ hardcoded string-literal checks across this file
  (`grep -oE "'(admin|procurement|...)'"` — confirmed count 2026-07-05,
  e.g. `['procurement','manager'].includes(role)`-style patterns). Auditing
  and safely migrating all of them is a much larger undertaking than
  `renameRole()` can guarantee, so it blocks a key change on any non-custom
  role with a clear message rather than risking a silent mismatch — label-
  only rename (`BUILTIN_ROLE_LABEL_OVERRIDES`, a separate localStorage-only
  store from `CUSTOM_ROLES`) is unconditionally safe for any role, since
  nothing else keys off the display label. Deleting a built-in role (not
  renaming its key) is comparatively low-risk — see `deleteRole()`'s own
  comment — so that IS allowed for any role except `admin`.
- **"Excel column map audit"** is substantially already built — don't
  redo it. `PSD_FIELD_MAP` (authoritative column-letter → field map, all 77
  columns, dated 2026-06-21) + `checkPsdSchemaDrift()` (compares live Excel
  headers to the map, warns/blocks save on mismatch) + a full admin-facing
  System Health status card already exist and work. What's NOT finished:
  the reverse map (`PSD_FIELD_TO_COL`) is built but never consumed by the
  actual write path — lower stakes than it used to be since Supabase (not
  Excel) is now the live production write path for the large majority of
  usage. The real remaining gap is a Supabase-side equivalent: auditing
  `vendorToRow()`'s field→column mapping against the actual Supabase
  schema, not further Excel work.

## CURRENT PRIORITY LIST

See `VCS_MASTER_TASKLIST.md` in the repo root for the live, actively
maintained task list — that file is the source of truth for what's
in-progress/blocked/not-started, updated at the end of every session.

## DEPLOYMENT

Sandbox and production are separate repos — pushing to `dgenuth/vcs` does
NOT touch production. Production deploy is a manual, explicit step (GitHub
Actions, gated behind confirmation) from `primesource-cms`. Never assume a
sandbox push reached production.
