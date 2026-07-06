# CLAUDE.md — VCS (Vendor Contract Scheduler) Build Rules & State

**Last updated:** Mon Jul 06, 2026 — 1:50 AM EDT
**Current checkpoint:** MD5 `6a23e3277dda9ee6b6ab9543d251376d`, 31,761 lines

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
  own bespoke header inline. Found 2026-07-05 (morning pass): every one of
  those had drifted from the Connections & API Keys reference style
  (11px/600/blue title, 9px arrow, 8px 12px row padding) in at least one
  dimension — some in padding only, some in the title's font-weight/color
  too (`settingsCard` was 700/var(--text) instead of 600/var(--blue)). All
  reconciled to match — but this only covered the TOP-level section
  headers.
- **The morning pass above missed every NESTED bespoke header one level
  deeper** — found 2026-07-05 (evening) after David reported, for the
  second time in one day, "I still don't see the title bars matching."
  A live computed-style sweep of every collapsible header on the Settings
  page (not just eyeballing a screenshot) turned up three more one-off
  headers the morning pass never touched, all still using an arrow with a
  hardcoded `marginRight` instead of the `gap:'6px'`-on-the-row convention,
  and a plain/non-blue title: `_roleSub()` (Permissions/Tab Access/Field
  Visibility Defaults headers inside each role — the exact section this
  whole engagement was actively testing that day), its sibling `_userSub()`
  (the same three panels' per-USER equivalents in User Management), and
  `buildIntegrationSubsection()` (Salesforce/Microsoft 365/Fathom/etc. rows
  nested inside Connections & API Keys). Also found the Quick Setup
  checklist header using its own 8px gap / 700-weight / non-blue title with
  an oversized 13px emoji in a separate span. All four fixed to the same
  `gap:'6px'`, no-margin 9px arrow, `var(--blue)` title, `fontWeight:'600'`
  mechanics as everything else — `_roleSub` and `_userSub` additionally
  gained a right-aligned summary badge (e.g. "2/7 on", "17 tabs on", "56
  fields hidden"), matching the "visible at a glance while collapsed"
  indicator convention the top-level cards and role rows already had but
  these nested headers were missing entirely. **This confirms the lesson
  from the morning pass was too narrow: it's not just "check each
  section's OWN header code," it's "check every NESTING LEVEL of bespoke
  header code" — a fix scoped to top-level cards will miss role-level,
  per-user, and doubly-nested integration-row headers every time. If a
  "still doesn't match" report comes in a THIRD time, do the live
  computed-style sweep first (group every clickable `▼`/`▶`-prefixed row
  by its gap/arrow-size/arrow-margin/font-weight/color signature) rather
  than re-eyeballing a screenshot — that sweep is what actually found all
  three misses here.**
- **Title bars, third report same day — David said it again after the fix
  above was confirmed live (round 3 had already deployed successfully by
  then).** Ran an even broader sweep this time: every bold-weight leaf text
  node on the fully-expanded Settings page, grouped by font-size/weight/
  color signature (not just clickable rows), plus explicit checks for every
  known top-level section by name. Found exactly one more genuine miss:
  the "☁ Config Sync" status banner (a non-collapsible sticky info bar, not
  a section header — but visually reads as one at the top of the page) was
  10px/`var(--text)` instead of 11px/`var(--blue)`. Fixed to match. Every
  other top-level section (User Management, Calendar Availability, Data
  Actions, API Usage Monitor, Session Handover Generator, Field Registry,
  Connections & API Keys, Quick Setup, Role & Feature Defaults) and every
  nested tier (role rows, `_roleSub`/`_userSub`, Connections' integration
  sub-rows) independently re-confirmed byte-identical within their own
  tier. **Given round 3 WAS confirmed live before this third report came
  in, and this session separately discovered GitHub Pages can silently
  fail a deploy and keep serving stale content with no visible error (see
  the deploy-failure entry below) — if "still doesn't match" comes in a
  FOURTH time, check the deployment status FIRST via
  `curl -s "https://api.github.com/repos/dgenuth/vcs/deployments?per_page=3"`
  then that deployment's `/statuses` endpoint, before assuming another
  code gap exists.** The code-side sweep is now about as exhaustive as it
  can get without a visual diffing tool.
- **GitHub Pages can silently fail a deploy and keep serving the previous
  commit's content indefinitely, with no error visible anywhere in the app
  or a normal `curl`.** Found 2026-07-05: a push (`e61edb5`) looked
  successful (`git push` returned normal output, `origin/main` updated),
  but the live site kept serving the prior commit's content. `curl`'s
  response headers looked like ordinary CDN caching (`Cache-Control:
  max-age=600`, growing `Age`) and were the first, wrong, explanation
  tried. The real cause only surfaced via GitHub's deployments API:
  `curl -s "https://api.github.com/repos/{owner}/{repo}/deployments?per_page=5"`
  to find the deployment for the commit SHA in question, then
  `curl -s ".../deployments/{id}/statuses"` — this showed a `state:
  "failure"` with description "Deployment failed, try again later" (a
  transient GitHub-side error; the Jekyll build step itself succeeded,
  only the deploy step failed). No public, unauthenticated way was found
  to see WHY beyond that generic message (the Pages-specific `/pages/
  builds/latest` API 404s without auth even on a public repo; the Actions
  job's own annotation was the only place the real error string appeared:
  `curl -s ".../check-runs/{deploy_job_id}/annotations"`). Fix: an empty
  `git commit --allow-empty` + push retriggers a fresh deploy attempt —
  this succeeded on retry. **If a push appears to have no effect on the
  live site and plain caching explanations don't pan out (cache-busting
  query strings, explicit `no-cache` headers all still show the OLD
  `Last-Modified`/`ETag`), check the deployments API before spending more
  time on CDN theories — it directly says whether the deploy for that
  exact commit succeeded, and this class of failure is otherwise
  invisible.**
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
- **The parallel session independently built almost this exact same body
  of work (header consistency, status indicators, role rename/delete,
  bulk-action 4th buttons) in parallel, same session window, 2026-07-05 —
  the second time this has happened for role management specifically (see
  the `getDefaultHiddenFields` entry above for the first).** Reconciled via
  `git rebase`, 9 conflict regions. Two of those had NO conflict markers at
  all — both sides added a near-identical status-indicator badge
  (Role & Feature Defaults role-count, User Management user-count) with
  different variable names, so git's 3-way merge spliced both in side by
  side instead of flagging a conflict. **Grepping for the specific
  indicator/badge text after any rebase in an area both lineages are known
  to be working in is not optional — conflict markers alone do not surface
  this class of duplication.** Where actual conflicts existed: kept this
  lineage's `createCustomRole` (the other session's never cloned Tab Access
  or per-field Edit defaults) and this lineage's built-in-role-key-rename
  block (the other session's `renameRole` allowed changing ANY role's key
  unconditionally — a real risk given the 275+ hardcoded-literal count
  above); adopted the other session's icon-only ✎/✕ buttons (closer to
  the literal spec) and its role-color-editing field in the rename modal
  (real enhancement, safe for custom roles, not persisted for built-in
  roles since there's no override store for that — same gap class as
  `BUILTIN_ROLE_LABEL_OVERRIDES` had to solve for labels). The "which 6"
  ambiguity flagged during that reconciliation resolved itself in the merge
  — only this lineage's version of the Connections badge survived (SF/
  MS365/Fathom/Renzo/Supabase/Drive, excluding Claude AI and Deploy to
  Production), so it's settled, not still open.
- **Role & Feature Defaults propagation was redesigned again same day
  (2026-07-05, evening)** — the "confirm via `showAffectedUsersModal()`
  after every single toggle" design two entries below/above (same date,
  earlier that day) was replaced per David's explicit follow-up: an admin
  making several changes in a row was getting interrupted by a popup after
  each one. Current, current architecture: **every individual toggle in
  Permissions/Tab Access/Field Visibility Defaults now ONLY writes the
  role-level default** (immediate, no modal, no per-user propagation) —
  this is what any NEW user or a user moved into that role picks up
  automatically. Syncing that change onto ALREADY-existing role members is
  a separate, deliberate action: each of the three sections has its own
  bottom button, built via the shared `buildApplyToExistingUsersButton(role,
  sectionLabel, doSync)`, reading **"✅ Apply Changes to Existing Users."**
  Clicking it shows `showAffectedUsersModal()` (checkbox list of that
  role's current users) exactly once, and `doSync(selectedUsers)` applies
  the section's FULL current state (not just the one most-recent change) —
  so several toggles made in a row all land in one batch when the admin is
  ready. The three `doSync` implementations: `_syncPermissionsToUsers`,
  `_syncTabAccessToUsers`, and an inline callback wrapping
  `syncFieldVisibilityDefaultsToUsers(role, selectedUsers)` (also reused
  by the Permissions sync, since "See Financials" writes the same
  `vcs_role_fields_<role>` key Field Visibility Defaults owns). Verified
  live end-to-end for all three sections 2026-07-05: toggle → no modal, no
  change on an existing test user → click the batch button → modal → Apply
  to Selected → all pending changes land at once. **If a "my toggle
  changed an existing user immediately" report comes in, that's the bug —
  only the batch button should ever touch existing users.**
- **CRITICAL, DATA-AFFECTING BUG (2026-07-05, found and fixed same evening
  as introduced) — `getApprovedUsers()` must NEVER auto-reseed any field on
  read, not even gated by a "have I seen this user before" flag.** The
  first attempt at fixing the migration bypass (documented in the entry
  this replaces) added a `_hiddenFieldsRole` tracker to `getApprovedUsers()`
  so it would only reseed `hiddenFields` for a "new or moved" user, not one
  staying on the same role. This looked correct in isolated testing with
  freshly-created fake users, but was fundamentally broken for the REAL
  user base: no real user had ever had `_hiddenFieldsRole` set before this
  code shipped, so EVERY existing real user looked "unseeded" on the very
  first call after deploy — meaning `getApprovedUsers()` mass-reseeded
  `hiddenFields` for the entire real, non-customized user base to whatever
  the role default happened to be at that exact moment, the instant
  ANYONE's browser (including a test session) called it — which happens on
  nearly every render. Confirmed live against the actual shared backend
  (24 real users, not test data — see the sandbox-isolation entry below):
  several real sales_reps (`mdelora@primesourcex.com`,
  `bflekel@primesourcex.com`, `swithers@primesourcex.com`,
  `erock@primesourcex.com`, plus David's own `dgenuthps@gmail.com`) were
  found with `hiddenFields: []` (nothing hidden) — not their intended
  sales_rep-restricted set — almost certainly this bug catching them
  mid-session while role defaults were being toggled during testing. This
  is the real root cause of David's report that a restriction applied to
  specific selected users bled out to "all users under that profile," and
  of syncs appearing to silently revert. **Fix: removed ALL reseeding logic
  from `getApprovedUsers()` — it is now a pure, side-effect-free read of
  `localStorage`.** The "new or moved into a role" case doesn't need
  reseeding-on-read at all; it's already handled correctly, deterministically,
  exactly at the two moments a role actually changes: the individual
  per-user role `<select>` change handler and the bulk role-change action
  (both already seeded `hiddenFields`/`fieldEditPerms`/`featureFlags`/
  `tabOverrides` from `getDefault*(newRole)` at that exact moment, before
  this bug was ever introduced) — plus Add User seeds `hiddenFields`/
  `featureFlags` from the role at creation. Verified the fix live: toggled
  a role default back and forth, synced to ONE explicitly-selected test
  user via the modal, confirmed every other real sales_rep's `hiddenFields`
  stayed byte-for-byte unchanged both times. **General lesson: if
  `getApprovedUsers()` (or any "get" function) ever needs to react to a
  user's role, it must do so once, at the specific place the role actually
  changes — never as a blanket "looks stale, refresh it" check on read, no
  matter how it's gated. That gating always breaks the same way the first
  time it meets data older than the gate itself.**
  **David should re-run "Apply Changes to Existing Users" for Field
  Visibility Defaults (and Permissions Defaults, since it also drives
  Financials via the same key) for the sales_rep role once the real
  intended defaults are set, to correct the real users named above —** this
  fix stops further damage but does not retroactively repair state already
  written by the bug.
- **There is no isolated sandbox test environment — logging in during
  live-browser testing (even with a fake/bypassed email) fetches the REAL,
  shared production Supabase database and the real GAS proxy, and any
  `saveUsersViaProxy()`/`debouncedSaveSettings()` call during that test
  session writes back to that same real backend.** Confirmed 2026-07-05:
  a test browser logged in as a fake `test-admin@primesourcex.com` still
  pulled 24 real users (`dgenuth@primesourcex.com`,
  `aschwartz@primesourcex.com`, etc.) via live network calls to
  `sjooaeopwimukmhgfwxs.supabase.co` and the real
  `script.googleusercontent.com` GAS proxy — confirmed via the preview's
  network log, not assumed. `saveUsersViaProxy()`'s merge logic (see its
  own code comment) does protect untouched real records from being
  clobbered wholesale by a save from a stale/fake session, but any record a
  test session explicitly touches DOES persist to the real backend. This is
  almost certainly how `test-admin@primesourcex.com`, `jane@primesourcex.com`,
  and `bob@primesourcex.com` ended up as real, persisted rows in David's
  live user list — they're test artifacts from earlier sessions' testing
  (this one included), not real employees, and Jane's record in particular
  shows heavy contamination (every field visible, `fieldEditPerms` all
  true, nearly every tab enabled) from repeated test cycles across this
  whole engagement. **David should confirm whether these 3 accounts
  (plus any `zztest-*@primesourcex.com` rows) should be deleted** — flagged,
  not deleted unilaterally. **Going forward: any live-browser verification
  step in this workflow must treat writes as reaching the real backend,
  full stop — there is no safe-to-corrupt copy to test destructive actions
  against.** Prefer read-only checks (`getApprovedUsers()`/`localStorage`
  inspection) wherever a claim can be verified without a save; when a save
  IS required to prove a fix, use a clearly-named, disposable test account
  (like `zztest-*`) and never reuse or mutate the existing test artifacts
  above, since their contaminated state makes them useless as a clean
  before/after baseline.
- **Tab Access Defaults was, briefly earlier the same day, the one section
  missing this confirm-before-propagating treatment at all** — its own
  code comment already said it should get this treatment (see
  `resolveRoleTabState`'s doc comment) but it never actually got wired up;
  it silently applied to every existing user unconditionally. That gap is
  now moot under the redesign above (nothing propagates to existing users
  without the batch button, for any of the three sections) but the
  underlying per-user write helper from that fix, `_applyTabStateToUsers()`,
  is still what the current `_syncTabAccessToUsers` calls.
- **The per-role "N tabs on" badge could show "undefined tabs on."**
  It read `vcs_role_tab_overrides[role]` directly and assumed it was always
  an array — true only when a role had zero explicit tab overrides yet
  (then it fell through to `ROLE_PERMS[role].tabs`, a real array). The
  moment any single tab got toggled for that role, the stored value became
  the real `{tabId:{view,edit}}` object shape every override actually
  uses, and `.length` on a plain object is `undefined`. Fixed: now counts
  by calling `resolveRoleTabState()` for every `PAGE_HIERARCHY` entry and
  tallying how many resolve to `view:true`, regardless of how many explicit
  overrides exist. **Same lesson as the legacy-array-value traps already
  in this file — don't assume a role-level storage key's shape without
  checking whether it's ever been written to.**
- **When a bug report says a fix "isn't working" and the sandbox code looks
  correct, check whether it's actually a sandbox-vs-production gap before
  assuming a code bug.** Production (`primesource-cms`) only updates on an
  explicit, separate deploy step — a fix landing in `dgenuth/vcs` has no
  effect on what real users see until that deploy happens. Worth asking
  directly rather than re-diagnosing sandbox code that already works.
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
- **Role-level Field Visibility Defaults' "Apply Changes to Existing
  Users" wrote correct data but visibly appeared to do nothing** (found
  2026-07-06, David's report). `syncFieldVisibilityDefaultsToUsers()`'s
  write was always correct (confirmed via direct `getApprovedUsers()`
  inspection) — the actual gap was that any already-open per-user Field
  Visibility panel in User Management stayed rendered with pre-sync data,
  since nothing rebuilt it afterward. Tab Access has its own
  `refreshOpenUserTabSections()` for exactly this; Field Visibility had no
  equivalent. David's own diagnostic (a per-user "Reset to Role Defaults"
  button DOES visibly update) was really just proof that THAT button
  explicitly rebuilds its own panel afterward, not that the sync's write
  was wrong. Fixed by adding the same pattern: `[data-bfa-email]` elements
  belonging to a just-synced user are rebuilt via `buildFieldAccess()`
  right after the write. **The per-user Permissions panel
  (`_buildPermissionsPanel`) has this same latent risk and was NOT fixed
  here — it's an inline function, not a reusable global like
  `buildFieldAccess`/`buildTabAccessSection`, so refreshing it needs a
  small refactor first. Not reported broken yet, but check here first if
  it is.**
- **`getDefaultFeatureFlags(role)` was never the full picture for what a
  new user should inherit — it only reflects role-level AI/Renzo
  customizations, not export/addVendor/canAccessArchive (a separate
  storage key via `setRolePermissionDefault`) or `requireSearchToList`
  (never set at all).** Add User used this function alone to seed a new
  user's `featureFlags`, so any admin customization to those 4 values via
  Permissions Defaults was silently ignored for brand-new users of that
  role (confirmed live 2026-07-06: customized sales_rep Permissions
  Defaults, created a new sales_rep user, got the hardcoded map instead).
  Field Visibility and Tab Access didn't have this gap since they already
  use their own correct accessors. Fixed by extracting the ALREADY-correct
  fallback-resolution logic (previously duplicated inline inside
  `_syncPermissionsToUsers`) into one shared `getResolvedRolePermissionDefaults(role)`,
  used by both Add User and `_syncPermissionsToUsers` now. **If a "new
  user doesn't match the role" report comes in for anything else, check
  whether Add User's seeding call actually uses the same resolved-default
  accessor the relevant Defaults page uses — `getDefaultHiddenFields`/
  `getDefaultFeatureFlags`/this new function are the three that matter.**
- **Per-user Tab Access "enabling a child auto-enables its parent"
  silently failed for a user with NO prior `tabOverrides` at all (i.e. any
  brand-new user) — the reverse cascade (restricting a parent restricts
  its children) was unaffected.** `persistTabState()`'s parent-cascade
  check assumed "no explicit override on the parent" meant "parent is
  already visible," unconditionally — never actually consulting the
  parent's real role-default visibility. For a user with SOME override
  history this rarely showed since the parent usually had its own real
  override by then; for a fresh user (every tab unset) it was wrong every
  time the parent's role default was actually hidden, since the check
  never even looked. Fixed to resolve the parent's visibility the same way
  `tabState()` does (persisted role-level override, then the static
  `ROLE_PERMS` set) instead of defaulting blindly to visible. Verified live
  on a freshly-created user: child toggle now correctly auto-enables a
  hidden parent, and the parent-restricts-children direction still works
  as before.
- **Settings header height/alignment: two more concrete, measurable causes
  found 2026-07-06 via pixel-level `getBoundingClientRect()` comparison
  across every top-level section (not computed-style-only, and not a
  screenshot) — David's report that "heights aren't symmetrical" and
  "emojis/arrows aren't aligned" was correct and had two distinct,
  independent causes:**
  1. **Field Registry's emoji was its own separate `14px` span** (every
     other header embeds its emoji in the SAME string as the title, at the
     title's own 11px) — the taller glyph made that one row 35px against
     31px everywhere else. Fixed by merging it into the title string like
     every other header.
  2. **Role & Feature Defaults embeds 3 real `<button>` elements
     (▼ All / ▶ All / ➕ Create New Role) directly in its title row** — the
     shared `.btn-xs` class's default padding renders at ~18px tall, vs.
     ~14-15px for a plain text badge, making that row 34px. Fixed by
     tightening padding/line-height on just these 3 buttons via inline
     style (NOT the shared `.btn-xs` class, to avoid touching every other
     button in the app). This is the only header with real interactive
     controls embedded in the row itself — worth remembering if a NEW
     section ever adds buttons to its title bar.
  **After both fixes, every one of the 13 top-level section headers
  measured pixel-identical: 31px tall, arrow and title both perfectly
  centered (0px offset from row-center) in every row.** One negligible 1px
  difference remains on Connections & API Keys specifically, caused by its
  intentional color-coded status border (amber/green/red) on the "N/6
  connected" badge — not worth removing a meaningful visual signal to
  chase 1px.
- **Separately, three bespoke headers (Connections & API Keys, Role &
  Feature Defaults, User Management) were missing `flex:'1'` on their
  title element** — `makeCollapsibleSection()`'s title already has this,
  which is WHY its badges reach the far-right column; without it, a badge
  just sits with a small fixed gap after the title, wherever that happens
  to land. This is what made User Management's "N users - M logged in"
  text sit right next to the title while File Info's "N vendors" badge
  reached the far right, despite both badges having identical inline
  styles otherwise. Fixed all three to match. **If a badge/indicator on
  any NEW section header doesn't reach the far right, check whether the
  TITLE element has `flex:'1'` before touching the badge's own margin —
  the badge's margin was never the actual mechanism, the title's flex-grow
  is.**
- **The REAL title-bar bug (finally) — a horizontal indent mismatch,
  found only by measuring absolute pixel positions across all 13 headers,
  not computed-style string comparison or a screenshot glance.** David
  pointed out directly that arrows/emojis/labels sat at different indents,
  and the same on the right side — correct, and something 3 prior passes
  (all of which checked font-size/weight/color/gap/vertical-centering)
  never actually measured. Root cause: `sec`, the container passed into
  `makeCollapsibleSection()` (and the equivalent bespoke containers for
  Role & Feature Defaults, User Management, Calendar Availability, and API
  Usage Monitor), always carries a `.settings-section` or `.summary-section`
  CSS class — both apply `padding:12px` on every side (`grep` for these
  class names to see all ~50 other uses across the file; this padding is
  real and needed for those containers' BODY content, not a mistake).
  Since each header is a direct child of that padded container, headers
  belonging to these specific containers rendered 12px further right/
  narrower than every OTHER header, whose containers (`settingsCard()`'s
  own `card` div, and the fully bespoke Connections/Quick Setup/Field
  Registry headers) have no such surrounding class and thus nothing extra
  to indent them. Fixed by adding `margin:'-12px -12px 0'` (or `...4px`
  where an existing bottom margin needed preserving) to each of the 5
  affected headers, canceling the inherited padding so they sit flush with
  the card edge — same effective position as every other header, achieved
  via the header's own `padding:'8px 12px'` doing the visual inset instead
  of the parent's class padding doing it. **Verified via
  `getBoundingClientRect()` on all 13 top-level headers: every single one
  now has identical `left` (191px), `right` (1973px), and `height` (31px)
  — not just matching computed style strings, actual absolute pixel
  position.** **If ANY future header still looks misaligned, measure
  absolute `left`/`right` position across ALL headers being compared, not
  just each one's own inline style values in isolation — two headers can
  have byte-identical inline styles and still render at different absolute
  positions if their PARENT containers apply different padding/margin.
  This is exactly what let the bug hide through 3 previous "uniformity"
  passes.**
- **Title bar heights, final pass: switched from content-driven sizing to
  an explicit `height:'32px', boxSizing:'border-box'` on all 9 header
  element definitions** (2026-07-06, David asked for uniform height
  matching Connections & API Keys specifically). Content-driven sizing
  (padding + whatever the tallest child naturally needs) is what caused
  every height mismatch fixed earlier that same night — any future badge
  with a border, embedded button, or oversized emoji span would silently
  reintroduce a 1-2px drift the same way. An explicit height with
  `boxSizing:'border-box'` makes every header immune to that regardless of
  what's inside it. 32px was chosen to match Connections & API Keys (which
  has a legitimate 1px status-color border on its badge, hence the extra
  pixel over the other rows' natural ~31px) rather than shrinking it down.
  **If a NEW header is ever added to Settings, give it the same
  `height:'32px',boxSizing:'border-box'` from the start — don't rely on
  padding+content sizing to happen to match.**
- **"View As" (admin preview-as-user) silently ignored most of the target
  user's actual permission overrides — found 2026-07-06 via David's report
  that setting a specific user's Permissions to "Full list browsable"
  (`requireSearchToList:false`) and then using View As still behaved as if
  search were required.** Two separate, stacked bugs:
  1. Both places that build the impersonation payload (the same-tab
     "View As" button handler, and the `vcs_impersonate_*` localStorage
     payload for the hash-routing path used on a fresh page load) called
     `loginAs({email, name, role, hiddenFields})` — only 4 fields, dropping
     `tabOverrides`, `featureFlags`, `fieldEditPerms`, `requireSearchToList`,
     `permissions`, `perms`, and `assistantAdmin` entirely. The hash-routing
     path happened to get away with it because it calls `completeLogin()`
     afterward, which independently re-fetches the real user record and
     re-applies all of these — but the same-tab path (the one the button
     actually uses) only calls `loadFromSupabase()` for vendor data
     afterward, never `completeLogin()`, so nothing ever corrected it.
  2. Separately, and more fundamentally: **`loginAs()` itself never sets
     `USER.featureFlags` at all**, regardless of what's passed in — every
     sibling field (`tabOverrides`, `permissions`, `perms`,
     `fieldEditPerms`, `requireSearchToList`, `assistantAdmin`) is copied
     from `userObj` onto `USER`, but `featureFlags` was simply left out.
     `USER.featureFlags` therefore always retained whatever the PREVIOUS
     session had (e.g. the admin's own permissive flags) until something
     else happened to reset it. `completeLogin()`'s post-sync and
     `restoreSession()` both independently re-set `USER.featureFlags`
     correctly elsewhere (from the approved-users record, not from
     `loginAs`'s argument) — which is exactly why a full page reload always
     "fixed" it and made this hard to notice: the gap is specific to
     `loginAs()` itself, not the surrounding login flow.
  Fixed: (1) both impersonation payload sites now pass the full permission
  surface from the target user record; (2) `loginAs()` now sets
  `USER.featureFlags = userObj.featureFlags || {}`, matching its siblings.
  Verified live: set a per-user `requireSearchToList` override and a
  distinct `featureFlags` combination on a test user, clicked View As, and
  confirmed `USER.featureFlags`/`USER.requireSearchToList` matched the
  stored record exactly (previously `featureFlags` showed the admin's own
  permissive defaults regardless of what the target user actually had).
  **If ANY future "shows the wrong permission" report involves View As or
  impersonation specifically (not a normal login), check whether
  `loginAs()` actually sets the field in question — the pattern of "some
  other code path happens to correct it after a full reload" makes gaps
  like this easy to miss for a long time.**
- **CRITICAL SECURITY: a deleted user could still log in indefinitely from
  any browser that had them cached before the deletion** (found and fixed
  2026-07-06, David's report — he deleted a user and could still log in as
  them from another browser). Three stacked gaps, all in the same area of
  the auth code:
  1. `loadGlobalSettingsViaProxy()`'s user-list merge (used during login)
     started from the LOCAL cache and only ever added/updated from the
     server's list — never removed. A user deleted from User Management
     (no longer in the server's list) stayed in any browser's local cache
     forever, since this function only ever unioned, never pruned.
     `saveUsersViaProxy()` already got this right (an untouched local-only
     record is treated as "deleted elsewhere, don't resurrect it") — this
     function just never got the same treatment. Fixed the same way, using
     the same `_TOUCHED_USERS` distinction: a local-only record survives
     the merge only if THIS tab just created it and hasn't synced yet.
  2. `handleOAuthLogin()` only ever synced with the server when the local
     cache was EMPTY and in production mode — the common case (non-empty
     cache, or sandbox) validated the login gate against whatever was
     cached locally with no freshness check at all. `attemptLogin()` (the
     sandbox email/password path) never synced at all, ever. Both now
     always attempt a fresh sync before checking membership (best-effort —
     falls back to the cached list if the network call fails, so a
     transient outage doesn't hard-lock out every login).
  3. `completeLogin()`'s existing post-sync check already correctly
     detected "this user is no longer in the authoritative list" but did
     nothing about it — no `else` branch, so an ALREADY-OPEN session for a
     since-deleted user stayed fully logged in with its old permissions
     until the tab was closed. Added the missing branch: force an
     immediate `logout()` when a fresh, non-empty server list doesn't
     contain the current user.
  **Verified all three live** without touching real backend data: seeded a
  local-only "phantom" user (simulating a stale cache from before a real
  deletion), confirmed `loadGlobalSettingsViaProxy()` correctly pruned them;
  confirmed both `attemptLogin()` and `handleOAuthLogin()` correctly denied
  a login attempt for that phantom user even though they were present in
  the local cache moments before the call; confirmed `completeLogin()`
  force-logged-out an already-active phantom session (`USER.loggedIn`
  false, login screen shown) the moment it ran. **If a "revoked user still
  has access" report ever comes back, check whether ALL THREE of these
  layers are still intact — a fix to just one (e.g. only the merge, or
  only the login gate) leaves the other two as a residual gap.**

## CURRENT PRIORITY LIST

See `VCS_MASTER_TASKLIST.md` in the repo root for the live, actively
maintained task list — that file is the source of truth for what's
in-progress/blocked/not-started, updated at the end of every session.

## DEPLOYMENT

Sandbox and production are separate repos — pushing to `dgenuth/vcs` does
NOT touch production. Production deploy is a manual, explicit step (GitHub
Actions, gated behind confirmation) from `primesource-cms`. Never assume a
sandbox push reached production.
