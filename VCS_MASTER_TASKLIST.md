# VCS — Master Task List
**Last updated:** Fri Jul 03, 2026 (this session, Claude Code)
**Checkpoint at this update:** MD5 `270c9d9d6d9cebc46fb058fa2d2690d0`, 30,600 lines

This is the standing, running list for VCS. Update it at the end of any
session with real progress — add anything new, remove anything fully done,
never silently drop something that isn't actually finished.

---

## JUST FIXED — confirm before treating as closed
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
3. **New role/profile creation — design approved, implementation not
   started.** Design: a `CUSTOM_ROLES` store (localStorage + synced via the
   existing GAS proxy/Drive config path) merged into `ROLE_PERMS`/`ROLES`/
   `ROLE_COLORS` at load time (before first render), so all ~57 existing
   read sites need zero changes. Two functions (`getDefaultHiddenFields`,
   `getDefaultFeatureFlags`) need one added early-return check each, since
   their per-role data lives in function-local objects that can't be
   merged into from outside. Two hardcoded role-list arrays (role-
   assignment dropdowns) get replaced with `Object.keys(ROLES)`. New
   "Create Role" UI: clone an existing role's full permission/tab/field/
   feature-flag set into a new custom role. Known dependency: syncing
   custom roles across devices needs a schema addition to the GAS Apps
   Script backend (separate project, not in this file) — David has
   pre-approved that change when it's time to build it. Explicitly out of
   scope for this design: edit/delete/rename of an existing custom role.
   **Do not start implementation without confirming with David first** —
   design approval was not a green light to build.
4. Settings sub-section-level Tab Access (which Settings sub-sections a
   role/user can see, separate from main-page Tab Access) — still blocked
   on #3 landing first.

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
