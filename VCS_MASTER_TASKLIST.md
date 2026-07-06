# VCS — Master Task List
**Last updated:** Mon Jul 06, 2026, 1:25 AM EDT (this session, Claude Code)
**Checkpoint at this update:** MD5 `a1131232a9b700e1b2803a90ba770393`, 31,717 lines

This is the standing, running list for VCS. Update it at the end of any
session with real progress — add anything new, remove anything fully done,
never silently drop something that isn't actually finished.

---

## JUST FIXED — confirm before treating as closed
- **"View As" ignored most of a target user's real permission overrides**
  (2026-07-06, David's report — set a user's Permissions to "Full list
  browsable" and View As still acted like search was required). Two
  stacked bugs: (1) the impersonation payload only ever carried
  email/name/role/hiddenFields, dropping featureFlags/requireSearchToList/
  tabOverrides/fieldEditPerms/permissions/perms/assistantAdmin entirely —
  the same-tab "View As" button path never self-corrected this since it
  doesn't call completeLogin() afterward (only loadFromSupabase() for
  vendor data); (2) `loginAs()` itself never set `USER.featureFlags` at
  all, regardless of what was passed to it — every sibling field was
  handled except this one. Fixed both. Verified live: View As now shows
  `USER.featureFlags`/`USER.requireSearchToList` matching the target
  user's actual stored record exactly. See CLAUDE.md Known Traps for full
  mechanism detail.
- **Title bar heights, final pass (2026-07-06)** — David confirmed the
  indent fix looked good and asked specifically for all header heights to
  match, using Connections & API Keys (32px) as the reference. Switched
  all 9 header element definitions from content-driven height (padding +
  whatever the tallest child happens to need) to an explicit
  `height:'32px', boxSizing:'border-box'` — immune to any future badge/
  button/emoji difference silently reintroducing a 1-2px drift, which is
  exactly the class of bug fixed twice already that night. Verified: all
  13 top-level headers now measure exactly 32px.
- **The actual title-bar bug, found after David pointed out the previous
  "measured pixel-perfect" claim was wrong** (2026-07-06). He was right —
  arrows/emojis/labels sat at genuinely different horizontal indents
  across sections, and badges landed at different positions on the right
  too. The prior passes measured font-size/weight/color/vertical-centering
  but never actual absolute left/right pixel position across all headers
  at once — that's what hid this. Root cause: 5 headers (Role & Feature
  Defaults, User Management, Calendar Availability, API Usage Monitor,
  and everything using the shared `makeCollapsibleSection()`) sit inside a
  container carrying a `.settings-section`/`.summary-section` CSS class
  that applies `padding:12px` — pushing those headers 12px further in than
  every other header, whose containers don't have that class. Fixed with
  a negative margin on each of the 5 headers to cancel the inherited
  padding. **Verified properly this time**: measured absolute
  `getBoundingClientRect()` position on all 13 top-level headers — every
  one now has identical left edge, right edge, and height, not just
  matching style strings. See CLAUDE.md Known Traps for the full mechanism
  and why 3 prior passes missed it.
- **Five more real bugs from David's next round of testing (2026-07-06),
  all found and fixed live, not just traced through source:**
  1. Field Visibility Defaults' "Apply Changes to Existing Users" was
     writing correct data all along — the actual bug was that an already-
     open per-user Field Visibility panel in User Management never
     refreshed afterward (Tab Access already had this refresh, Field
     Visibility didn't). Fixed.
  2. New users never inherited role-level Permissions Defaults
     customizations (export/addVendor/canAccessArchive/requireSearchToList)
     — only Field Visibility and Tab Access adapted correctly. Root cause:
     Add User seeded from `getDefaultFeatureFlags()`, which only ever
     reflected AI/Renzo customizations. Fixed via a new shared
     `getResolvedRolePermissionDefaults(role)` used by both Add User and
     the existing sync function.
  3. For a brand-new user specifically, checking a child tab did not
     auto-enable its parent (the reverse — restricting a parent restricts
     its children — worked fine). The parent-cascade check assumed "no
     override on the parent" meant "already visible" without ever
     checking the parent's real role default. Fixed.
  4. Three bespoke section headers (Connections & API Keys, Role & Feature
     Defaults, User Management) were missing `flex:'1'` on their title,
     so their badges/indicators sat right after the title instead of
     reaching the far-right column every other section's indicator uses.
     Fixed — all 13 top-level section badges now sit exactly 12px from
     the row's right edge.
  5. Two independent causes of uneven header-row heights, found via
     pixel-level `getBoundingClientRect()` measurement across all 13
     top-level sections: Field Registry's emoji was its own oversized
     14px span (vs. 11px everywhere else), and Role & Feature Defaults'
     3 embedded buttons rendered taller than a plain text badge via the
     shared `.btn-xs` class's default padding. Both fixed (the buttons via
     inline style only, not the shared class). Every top-level header row
     now measures 31px tall with the arrow and title perfectly centered.
  See CLAUDE.md Known Traps for full mechanism detail on all five.
  **Not yet done: the per-user Permissions panel has the same latent
  refresh gap as (1) above but wasn't fixed — it needs a small refactor
  first since it isn't a reusable global function like the other two
  panels. Not reported broken yet.**
- **Title bars, third report same day — one real remaining miss found and
  fixed: "☁ Config Sync"** (the sticky status banner at the top of
  Settings) was still 10px/default-color instead of the 11px/blue every
  other section header uses. Fixed. Re-verified EVERY other top-level
  section and every nested tier via a broader sweep (all bold-weight text
  on the page, not just clickable rows) — all confirmed byte-identical
  within their tier. **Also important: this session confirmed GitHub Pages
  can silently fail a deploy and keep serving stale content indefinitely
  with no visible error** — a push earlier this session (`e61edb5`) looked
  successful but the live site didn't update because the deploy step
  itself failed server-side (confirmed via GitHub's deployments API, not
  visible any other way); an empty-commit retrigger fixed it. Given round 3
  of the title-bar fix WAS confirmed live before this third report came in,
  it's possible some of David's "still doesn't match" reports were partly
  hitting this same silent-deploy-failure class of issue rather than a pure
  code gap — worth keeping in mind if reports continue after this push.
  See CLAUDE.md Known Traps for the deployment-debugging steps if it
  recurs.
- **CRITICAL: real user data was being silently corrupted by the previous
  fix below (2026-07-05, late evening) — David reported this himself after
  testing** ("restrictions applied to specific users ended up affecting all
  the users under that profile," Financials showing restricted right after
  being explicitly synced as viewable). Root cause: the `_hiddenFieldsRole`
  fix described in the entry below was itself broken — it couldn't tell a
  genuinely new/moved user apart from a real, pre-existing user simply
  encountering the new tracking flag for the first time, so it mass-
  reseeded `hiddenFields` for the ENTIRE real user base to whatever the
  role default happened to be at that instant, the first time anyone's
  browser called `getApprovedUsers()` after the earlier fix went live —
  which is nearly every render. Confirmed against the REAL shared backend
  (not test data): several real sales_reps
  (`mdelora@primesourcex.com`, `bflekel@primesourcex.com`,
  `swithers@primesourcex.com`, `erock@primesourcex.com`, and David's own
  `dgenuthps@gmail.com`) were found with `hiddenFields: []` instead of
  their intended restricted set. **Fixed by removing ALL reseeding logic
  from `getApprovedUsers()` — it's now a pure read.** The new/moved-user
  case doesn't need it: role changes already correctly seed
  `hiddenFields`/`featureFlags`/`tabOverrides` at the two places a role
  actually changes (the per-user role dropdown and the bulk role-change
  action), and Add User seeds at creation. Verified live: toggled a role
  default twice, synced to exactly one explicitly-selected test account
  both times, confirmed every other real sales_rep's `hiddenFields` stayed
  byte-for-byte unchanged. **David: please re-run "Apply Changes to
  Existing Users" for the sales_rep role (Field Visibility + Permissions
  Defaults) once you're happy with the real defaults, to correct the real
  users named above — this fix stops further damage but doesn't
  retroactively repair what the bug already wrote.**
  **Also discovered in the process, unrelated to this bug but important:**
  there is no isolated sandbox — live-browser testing (even via a fake
  bypass login) hits the real shared Supabase/GAS backend, and `jane@`/
  `bob@`/`test-admin@primesourcex.com` are test artifacts from earlier
  testing sessions (this one included) sitting in the real live user list,
  not real employees — Jane's record in particular is heavily contaminated
  from repeated test cycles. Flagging for David to confirm deletion; see
  CLAUDE.md Known Traps for the full account and the new testing
  discipline this requires going forward.
- **Role & Feature Defaults propagation redesigned again, same evening
  (2026-07-05, later)** — supersedes the entry directly below. David's
  follow-up: the "confirm via popup after every toggle" design (just
  shipped that same evening) interrupted making several changes in a row.
  New architecture: every toggle in Permissions/Tab Access/Field
  Visibility Defaults now only writes the role-level default immediately
  (no modal) — new/moved-into-role users pick this up automatically.
  Syncing already-existing role members is now a separate, explicit
  action: each section's old "Apply Changes" button is now **"✅ Apply
  Changes to Existing Users,"** and clicking it is what shows the "which
  users" confirmation modal — once, applying the section's FULL current
  state (every pending toggle, not just the last one) in a single batch.
  Verified live end-to-end for all three sections: toggle → no modal, no
  change on an existing test user → click the batch button → modal →
  confirm → all pending changes land at once. **Also found and fixed in
  the process** (not visible from reading the sync code, only from live
  testing): `getApprovedUsers()` had a pre-existing per-render migration
  that re-mirrored every non-customized user's `hiddenFields` to the
  current role default on every single call — which silently bypassed the
  new batch-gate for Field Visibility Defaults specifically, re-applying a
  role-default edit to existing users immediately regardless of the batch
  button. Fixed to only re-seed a user's `hiddenFields` when they've never
  been seeded or their role just changed, not on every render. See
  CLAUDE.md Known Traps for full mechanism detail on both fixes.
- **Settings title bar consistency, round 3 (2026-07-05, later same
  evening)** — David reported, a second time that day, that the title bars
  still didn't match after the "round 2" fix directly below. A live
  computed-style sweep (not a screenshot) found the round-2 pass only
  covered TOP-level section headers; three more deeply-nested bespoke
  headers still had the old inconsistent styling: `_roleSub()` (the
  Permissions/Tab Access/Field Visibility Defaults headers inside each
  role — the exact section under active testing that day),
  `_userSub()` (the same three panels' per-user equivalents in User
  Management), and `buildIntegrationSubsection()` (the Salesforce/MS365/
  Fathom/etc. rows nested inside Connections & API Keys), plus the Quick
  Setup checklist header. All four reconciled to the same convention;
  `_roleSub`/`_userSub` additionally gained the same right-aligned
  summary-badge treatment the top-level headers already had (e.g. "2/7
  on," "17 tabs on," "56 fields hidden"). See CLAUDE.md Known Traps for
  why this recurred and what to check first if it comes back a third time.
- **Role & Feature Defaults: Tab Access Defaults changes weren't reliably
  reaching existing users (superseded by the redesign above — this
  entry's per-toggle-modal mechanism no longer exists, but the underlying
  per-user write helper it introduced is still in use)** (David's report,
  2026-07-05 evening). Root
  cause: Tab Access was the one of the three role-default sections that
  never got the "ask which existing users" confirmation flow (Permissions
  and Field Visibility already had it) — it silently applied every change
  to every existing user unconditionally instead, with no way to say
  "just update the default for now." Wired in `showAffectedUsersModal()`
  the same way the other two sections use it: `persistRoleTabState()` now
  returns the change(s) it made instead of writing to users directly, bulk
  actions accumulate all their changes into one combined modal instead of
  one per tab, and a new `_applyTabStateToUsers()` does the actual per-user
  write only after the admin confirms who. Verified live end-to-end
  (individual toggle + bulk "Restrict All"), not just traced through
  source. **Also found and fixed in the process**: the per-role "N tabs on"
  badge could show "undefined tabs on" once a role had any real tab
  override (it assumed the stored value was always an array; it's an
  object after the first toggle) — now computed via `resolveRoleTabState()`
  across `PAGE_HIERARCHY`, correct regardless of override count.
  **Worth confirming with David**: whether he tested this on sandbox or
  production — production only updates on an explicit separate deploy, so
  if he tested production, this fix won't be visible there until that
  deploy happens.
- **Settings title bar consistency, round 2 (2026-07-05 evening).** A prior
  pass fixed most sections' font/color/padding but missed a few: API Usage
  Monitor's header row had no padding at all, and every section's collapse
  arrow had an inconsistent, redundant margin on top of (or instead of) the
  row's own flex `gap` — normalized everything to one mechanism (`gap:
  6px` on the row, no margin on the arrow) so spacing is now byte-for-byte
  identical across all 12 top-level Settings sections, not just
  visually close.
- **Status indicators added to every remaining title bar** (previously
  only Connections & API Keys, Role & Feature Defaults, and User
  Management had one): Click-to-Call ("Configured"/"Not configured"),
  Calendar Availability ("N days blocked"), Startup & Navigation ("Opens
  to: X"), Display Preferences ("Dark"/"Light"), File Info ("N vendors"
  + unsaved-changes count), API Usage Monitor (estimated cost total, now
  computed unconditionally instead of only when expanded), and Field
  Registry (custom field count, when known). `makeCollapsibleSection()`
  and `settingsCard()` both gained an optional `badge` parameter — all
  existing call sites that don't pass one are unaffected. Data Actions and
  Session Handover Generator deliberately left without a badge — neither
  has a single piece of state worth summarizing (the former is a list of
  export/import actions, the latter a one-shot document generator).
- **Deployment takeover (2026-07-05):** the other conversation's manual
  GitHub-web-editor deploys were unreliable at this file's size and had
  started creating stray duplicate files (`index (4).html`) instead of
  overwriting `index.html` — removed the stray file; all further pushes for
  either lineage now go through this git workflow, no more browser paste
  deploys. See CLAUDE.md rule 12.
- **Role creation/rename/delete — verified against the fuller spec David
  described, not just re-confirmed as "present."** Found and fixed real
  gaps in what had been deployed:
  - `createCustomRole` took a manual key field; now auto-generates the key
    from the display label (slugified, de-duplicated with a numeric suffix
    on collision) — no key field in the Create modal anymore.
  - `createCustomRole` was NOT cloning Tab Access or per-field Edit
    defaults at all (only Field Visibility + feature flags + the two
    hardcoded-fallback permissions were being cloned) — now clones all
    four role-level stores via their real accessors (`resolveRoleTabState`,
    `getDefaultHiddenFields`, `getRoleFieldEditDefault`,
    `getDefaultFeatureFlags`/`getRoleFeatureDefault`), verified by direct
    comparison against the source role after cloning `sales_rep`.
  - `renameCustomRole`/`deleteCustomRole` only ever worked on custom roles.
    Replaced with `renameRole`/`deleteRole`: rename now works for ANY role
    (built-in or custom) for a label-only change, tested live; KEY changes
    remain custom-roles-only — grepped 275+ hardcoded built-in-role-name
    string literals across the file, confirmed extending key-migration to
    built-in roles is unsafe without auditing all of them, so it's blocked
    with a clear message rather than silently risking a mismatch. Custom
    role key-rename (atomic across all 4 storage locations + reassigning
    every affected user) tested live and confirmed correct. Delete now
    works for any role except `admin` (hard-blocked unconditionally) —
    tested live: blocked while a user was assigned (named them in the
    error), succeeded immediately after reassignment, role fully removed
    from `ROLES`/`ROLE_PERMS`/`ROLE_COLORS`/all localStorage keys.
  - Bulk actions on Tab Access Defaults and Field Visibility Defaults only
    had 3 of the required 4 buttons (missing "Make All Non-Editable" on
    both) — added, same shared-function-reuse pattern as the other three.
  - Per-role row: font-weight was 700 (spec: 600), vertical padding was 6px
    (spec: 4px), and Rename/Delete sat immediately after the role name
    instead of after the tabs/fields-count info at the far right — all
    three fixed and confirmed via live computed-style inspection, not just
    source reading.
  - All of the above tested live in a browser preview (bypassed
    OAuth/Supabase by mutating `USER`/`getApprovedUsers()` state directly
    and calling `completeLogin()`), not just traced through source.
  - **Mid-session, the parallel session pushed 7 more commits building
    almost this exact same body of work independently** (see CLAUDE.md's
    Known Traps for the full account). Reconciled via `git rebase` — 9
    conflict regions, plus 2 silently-duplicated status-indicator badges
    that had NO conflict markers at all (git spliced both sides' near-
    identical additions in side by side). Kept this lineage's more-complete
    `createCustomRole` cloning and its stricter built-in-role-key-rename
    block; adopted the other lineage's icon-only ✎/✕ buttons and its
    role-color-editing field. Re-ran the full test suite above (create,
    clone-verify, rename+color, built-in label rename, built-in key-rename
    block, admin-delete block, delete-blocked-then-succeeds) against the
    final reconciled file — all still passing. One open, unresolved
    ambiguity from the reconciliation: which 6 services count toward
    Connections & API Keys' "N/6 connected" badge (this lineage: SF/MS365/
    Fathom/Renzo/Supabase/Drive; the other: SF/MS365/Claude AI/Renzo/
    Supabase/Drive) — worth confirming directly with David.
- **Settings header consistency** — Connections & API Keys was the only
  section actually matching its own reference style. `makeCollapsibleSection`,
  `settingsCard`, and the bespoke headers for Role & Feature Defaults, User
  Management, Calendar Availability, and Field Registry all had at least
  one drifted value (row padding almost everywhere; `settingsCard`'s title
  was also 700-weight `var(--text)` instead of 600-weight `var(--blue)`;
  Calendar Availability's title was 13px instead of 11px and still had the
  redundant "click to expand/collapse" text removed from every other
  section 2 sessions ago). Reconciled all of them to the reference values;
  confirmed live via computed-style inspection, not just source reading.
- **Three status indicators added** (none existed before this session,
  confirmed by direct code search before assuming otherwise):
  Connections & API Keys now shows "N/6 connected" (color-coded
  green/amber/red, tracking the same 6 real connections — Salesforce,
  MS365, Fathom, Renzo, Supabase, Drive — each already has its own
  `isConnectedFn` for; deliberately excludes Claude AI and Deploy to
  Production, neither of which is a data connection). Role & Feature
  Defaults shows the role count. User Management shows user count plus how
  many have ever logged in (`u.lastLogin` truthy).
- **Settings UI/UX consistency pass (4 items):**
  - Role & Feature Defaults and User Management section order unified to
    Permissions → Tab Access → Field Visibility (Connections stays last in
    User Management). Found exact block boundaries via matching `}));` at
    consistent indentation with assertion-guarded extraction, not
    brace-counting, per standing practice for large embedded blocks.
  - Bulk actions added to role-level Tab Access Defaults ("Make All
    Visible"/"Restrict All") and Field Visibility Defaults (same two, plus
    "Make All Editable"). Both route through the exact same persistence
    functions the individual tiles already call (`persistRoleTabState()` for
    Tab Access; new shared `_applyFieldVisibility()`/`_applyFieldEdit()` —
    extracted from the individual tiles' inline logic, not duplicated —
    for Field Visibility) so user propagation and the parent/child cascade
    apply identically to a bulk click as to a manual one.
  - Role-level Permissions Defaults now shows the same explanatory text as
    the equivalent per-user Permissions panel toggles under AI Assistant
    ("When disabled, AI calls return a 'contact admin' message") and Renzo
    Access ("Renzo outreach button visibility per user") — verified these
    are the *only* two toggles with per-toggle description text in the
    per-user panel before adding matching text elsewhere.
  - "Apply Changes" buttons added to all three role-level sections, reusing
    `buildApplyButton()` (extended with an optional `customFlush` callback,
    defaulting to its original `saveUsersViaProxy()`-only behavior — all 3
    existing per-user call sites still pass exactly 2 args, confirmed
    unchanged). Each section's flush was checked individually, not assumed:
    Permissions Defaults needed its own wiring (`saveSettings()` +
    `saveUsersViaProxy()`, since it writes to the debounced
    `S.settings.roleDefaults`); Tab Access and Field Visibility only needed
    `saveUsersViaProxy()` (their role-level keys already save synchronously
    on every toggle — only the per-user propagation is debounced).
    **Found in the process**: `vcs_role_fields_<role>` and
    `vcs_role_field_edit_<role>` are pure localStorage, not included in
    `GLOBAL_SETTING_KEYS`, and not pushed to the backend by any existing
    code path — this predates this session's work and isn't something an
    Apply button can fix on its own; flagging as a real gap if role-level
    Field Visibility Defaults are ever expected to sync across devices.
  - Landed on top of 5 parallel-session commits that touched this exact
    area since the last checkpoint (Field Visibility Defaults refactored to
    `buildPermTile`, old standalone "Feature Defaults" section merged into
    Permissions Defaults, per-field edit defaults added, Tab Access gained
    parent-restricts-children cascade) — re-verified the live structure
    fresh rather than assuming the prior session's line numbers still held.
- Role-based field/tab visibility now actually follows role (independently
  re-verified this session, holds correctly for at least two roles traced
  by hand — sales_rep and ops_qc — and structurally guaranteed for all
  roles since both the role-change path and the Reset-to-defaults path call
  the exact same pure function with the exact same single argument).
- Parent/child Tab Access dependency — re-verified this session: the
  mechanism (`_findParentPageId`) is data-driven off `PAGE_HIERARCHY`, not
  hardcoded per-child, so it already covers all 3 current parent groups
  (today: 10 children, sfboard: 3, analytics: 4) and any future additions
  automatically, for both per-user and role-level Tab Access.
- **Role & Feature Defaults → Field Visibility Defaults page was
  completely disconnected from the real permission-resolution path.** The
  page read/wrote its own `vcs_role_fields_<role>` localStorage key, which
  `getDefaultHiddenFields()` never consulted — so the page showed
  "everything visible" for every role regardless of that role's real
  hardcoded restrictions (visibly contradicting the role header's own,
  already-correct "N fields hidden" badge on the same page), and toggling
  a field there had zero effect on any real user. Fixed:
  `getDefaultHiddenFields(role)` now checks that key first; the Field
  Visibility Defaults section seeds its initial display from
  `getDefaultHiddenFields(role)` (not an empty set) whenever the key has
  never been explicitly saved, and immediately persists that seed so the
  key is never actually unset again. Both the individual field-toggle and
  the "See Financials" bulk-toggle write handlers were additionally
  hardened to seed from `getDefaultHiddenFields(role)` rather than assume a
  non-null key, as defense in depth — without it, the very first toggle on
  a previously-untouched role could have silently revealed every OTHER
  field that role's hardcoded defaults were hiding. **Verified:**
  single-argument-only calling convention re-confirmed at all 13 real call
  sites; toggling a field updates `getDefaultHiddenFields(role)`'s return
  value immediately with no reload (reads localStorage live, not a cached
  snapshot); the "Reset to role defaults" and amber-outline-mismatch paths
  (Item 1) re-verified — both correctly treat an admin-customized role
  default as the role's real standard now, which is the intended effect.
  This exact fix was independently implemented by the parallel session in
  commit `0276d32` during this same session window and landed on
  `origin/main` before this lineage's own version was committed; reconciled
  via `git rebase` — `getDefaultHiddenFields` had auto-merged with both
  lineages' checks present (the redundant, unreachable one removed), and
  the two competing seed-and-persist implementations for the display side
  were resolved in favor of the already-live version (functionally sound:
  confirmed `_roleSub()`'s builder always runs at construction regardless of
  collapse state, and Field Visibility Defaults is always constructed before
  "See Financials" for a given role, so the shared key is guaranteed
  populated before either toggle handler can ever fire).
- Settings UI/UX: Field Visibility and Tab Access checkboxes now render to
  the left of the label they control (inside `buildPermTile()`, confirmed
  scoped to only the 3 relevant call sites out of 14 total).
- Duplicate settings sections fully migrated and removed: Renzo (including
  its full 5-step Quick Setup Wizard), Salesforce, Supabase (including
  upgrading a weaker duplicate "Check Record Counts" that only checked 1
  table to the full 9-table version, and moving the SQL schema/RLS
  reference), Google Drive, and Microsoft 365 — all 5 old standalone
  sections deleted after their content was confirmed present and rendering
  in Connections & API Keys. Caught 2 real gaps in what had previously been
  reported as "already migrated": Google Drive's intro/closing text and
  MS365's intro text were missing from the new sections entirely.
- Discovery module: file content was never actually sent to the AI for
  non-PDF uploads (only the filename); multi-file upload now supported.
- Google Drive "Connected" status no longer misleading (checklist + sticky
  banner both use a real proxy-or-token signal now).
- Settings UI/UX: duplicate Display Preferences section removed, header
  styling unified to match Connections & API Keys, amber-outline disclaimers
  added where missing, sticky banner reworded, stale keyboard shortcut
  labels fixed, all collapsibles default to collapsed with a one-time
  migration so existing browsers see it immediately.
- Salesforce vendor panel: "Matched" text is now a clickable link to the
  actual record, Details tab shows every populated SF field (not just a
  fixed subset), new Contacts tab, duplicate/wrong-object SF icon fixed.
- `lastComm` (drives Summary's "Recently Contacted") now updates from Add
  Note and Log Activity, not just the separate Mark Done action.
- Theme and startup-view settings now actually persist across a refresh.

## NEEDS YOUR CONFIRMATION
- Perpetuity badge still only shows for vendors with the field populated —
  no "?" for blank/unknown as originally asked for. Confirmed still open.
- Checklist Training UI (admin/manager pin/suppress vendors per category) —
  confirmed genuinely missing, not just hidden.
- Vendor panel B1 layout (identity section label/value overlap) — can't
  verify from code, needs a screenshot.

## RESOLVED — confirmed via direct query, no longer a concern
- Supabase seed completeness — confirmed Jul 3 2026: vendors (196),
  channel_partners (4,209), itw_vendors (230), reviews (16), vendor_contacts
  (4,059) are all populated. Not a rollout blocker.
- Informational, not bugs: vendor_documents (0 rows) is empty because the
  Contract Module hasn't been built yet; activity_log (0 rows) is empty
  because logHistory() currently writes to an in-memory array (S.history),
  not this table — worth wiring up before building anything that expects to
  read activity data from Supabase (Rep Activity Tracking, Communications
  Intelligence panel).
- "Excel column map audit & safe write path" — investigated this session;
  substantially more complete than this list previously reflected. See
  ROLLOUT-BLOCKING #1 below for the re-scoped remainder.

## ROLLOUT-BLOCKING
1. **Excel column map audit & safe write path — re-scoped.** The Excel-side
   audit is already done (`PSD_FIELD_MAP`, `checkPsdSchemaDrift()`, admin
   System Health status card, all working). Not finished: the reverse map
   (`PSD_FIELD_TO_COL`) is never actually consumed by the write path — lower
   priority now since Supabase, not Excel, is the live production write
   path for most usage. Real remaining work: audit `vendorToRow()`'s
   field→Supabase-column mapping against the actual table schema. Scoping
   only has been done — implementation not started, awaiting direction on
   whether the Excel-side gap is still worth finishing too.
2. Verify Discovery Step 3 (Seed Checklist) + downstream flow now that
   Steps 1–2 are fixed.
3. Settings sub-section-level Tab Access (which Settings sub-sections a
   role/user can see, separate from main-page Tab Access) — was blocked on
   role creation landing; role creation is done (see JUST FIXED above), so
   this is now unblocked whenever it's prioritized.
4. **Custom roles are still localStorage-only, not synced via the GAS
   proxy/Drive config path** — same known gap as the Field Visibility
   Defaults customizations (see CLAUDE.md Known Traps). David has
   pre-approved the GAS Apps Script schema addition needed for cross-device
   sync when it's time to build it — not started.

## NOT STARTED — real features
- Add Channel Partner Vendor flow (doesn't exist at all currently)
- Bulk channel-partner vendor list replace tool
- Side-by-side contract viewer (two contracts from same vendor)
- Contract Economics channel-partner calculator (per-vendor revenue split)
- Analytics: clickable chart bars/points to drill into vendor list
- Rep performance: SF owner attribution bug (Owner.Name vs plain owner field)
- Vendor DB: sortable last-contact-date column
- Notes restructure (timestamped structured model — types, filters, search)
- Contract module (OCR upload, auto-fill, version history)
- Communications Intelligence panel (Outlook + Fathom + logged notes,
  unified/searchable, in vendor and customer panels)
- Full Sales Outreach Program / VCS↔Renzo integration

## DEFERRED — longer-term, explicitly not urgent
- Supabase Auth for secure per-user credential storage (Fathom keys, OAuth
  tokens) — architecturally correct approach identified, non-trivial to build
- Eliminate Google Drive dependency entirely, move Contracts & Pricing fully
  into Supabase — would also retire the PC-dependent VCS Watcher script
- JS obfuscation for the deployed bundle — low priority, no embedded secrets

---

## Known traps (check these mechanisms first if a similar symptom reappears)
See `CLAUDE.md` in the repo root for the full technical list — this section
intentionally stays short; that file has the mechanism-level detail.
