# CLAUDE.md — VCS (Vendor Contract Scheduler) Build Rules & State

**Last updated:** Tue Jul 07, 2026 (this session, continued)
**Current checkpoint:** MD5 `c1c3512c76a5b063932506faf1e17267`, 31,631 lines
**Prior checkpoint (pre-cleanup, easy revert point):** commit `2f87c8d` /
MD5 `3836efef35df40f7cd667179712249d2`, 32,599 lines. Also saved as a
standalone file at
`.../scratchpad/index-BACKUP-before-fable5-cleanup-2f87c8d.html` for this
session. `git checkout 2f87c8d -- index.html` reverts instantly if the
2026-07-07 cleanup below causes any issue.

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

- **`loginAs()` is now the ONE place that refreshes the sidebar after any
  login/impersonation — don't add a new sidebar-dependent side effect to
  a caller without checking whether `loginAs()` already covers it
  first.** Root cause of yet another "View As doesn't reflect real
  restrictions" report (2026-07-07, after this exact bug class had
  already been patched multiple times this session for other specific
  fields — tabOverrides passing, featureFlags passing, requireSearchToList
  passing): `loginAs()` correctly set every permission field on `USER`,
  but never refreshed the sidebar nav that's actually BUILT from that
  state. Callers that go through `completeLogin()` afterward (normal
  OAuth login, hash-based impersonation) got a correct sidebar by
  accident, because `completeLogin()` calls `updateSidebar()` itself —
  but the same-tab "View As" button deliberately skips `completeLogin()`
  (only calls `loadFromSupabase()` + `render()` for vendor data) and
  never called `updateSidebar()` on its own. Confirmed live: a user with
  7 explicitly restricted tabs (verified correct in both
  `USER.tabOverrides` and `isTabAllowedForUser()`'s return value) still
  showed all 7 in the sidebar after View As — neither the subsequent
  `render()` nor `loadFromSupabase()` ever touched the sidebar DOM.
  Fixed at the ROOT rather than patching this one caller: `loginAs()`
  itself now calls `updateSidebar()` unconditionally at the end, so EVERY
  current and future caller gets a correct sidebar automatically, instead
  of each one having to separately remember to do it (which is exactly
  how this class of bug kept recurring one field at a time). If you ever
  see "the setting is correct on the server / in `USER` but not
  reflected in the UI" again, check whether the specific UI element in
  question is rebuilt by `updateSidebar()`/`render()` at all — the fix
  pattern here (call the refresh function from inside the state-setter,
  not from every caller) generalizes to any future instance of this.
- **CRITICAL SECURITY (2026-07-07): sandbox mode's login-bootstrap path
  could silently hand ANY user full admin rights on a mere sync hiccup —
  PRE-EXISTING bug, not caused by the cleanup below, just exposed by
  active testing.** `handleOAuthLogin()`'s "bootstrap admin on first ever
  login" branch (`if (users.length === 0) { ... }`) fires whenever the
  post-sync local approved-users list is empty. The `CMS_PRODUCTION_MODE`
  branch right above it correctly checks `_syncOk` (a failed/inconclusive
  sync gets a "try again" message, never bootstraps) — but sandbox mode
  (`CMS_PRODUCTION_MODE === false`) skipped that branch entirely and fell
  straight into the bootstrap path with NO `_syncOk` check, despite a
  comment claiming otherwise. Net effect: in sandbox, ANY transient GAS
  failure during login — for ANY existing, already-configured, restricted
  user, not just a genuinely new one — silently treated them as a brand
  new install and handed them either a bare `role:'admin'` (if their email
  isn't in the static `EMPLOYEE_DIRECTORY` seed) or their static seed role
  with ZERO of their real per-user restrictions (hiddenFields/
  tabOverrides/permissions all live server-side, not in the seed). David
  hit this directly: a director_ops user showed as full, unrestricted
  admin after a login where the sync apparently didn't confirm success.
  Fixed: the sandbox bootstrap branch now requires `_syncOk === true`
  before ever seeding — a failed/inconclusive sync gets the same "check
  your connection and try again" treatment production already had,
  instead of silently granting admin. Verified live: simulated a failed
  sync with an empty local cache — login now correctly refuses (`role:
  null`, not logged in) instead of bootstrapping; confirmed a normal,
  successful sync still logs a real user in with their correct role.
- **2026-07-07: adopted a ~1,000-line dead-code cleanup pass generated by a
  SEPARATE AI session (Fable5), after independently re-verifying it rather
  than trusting its own summary.** David's hope was that this would fix
  his ongoing "permission/visibility default changes don't reflect for an
  existing user" reports — it almost certainly does NOT, since that was
  already fixed the same session via `_hydrateRoleConfigFromSettings`'s
  staleness bug and the `_TOUCHED_USERS` reassertion bug (see entries
  below). What this pass actually did: (1) confirmed a REAL duplication —
  the same 19-employee bootstrap list existed twice, as `EMPLOYEE_DIRECTORY`
  (first-ever-login seed) and `FRESH_DIRECTORY` (legacy pre-configVersion-3
  migration path) — consolidated into `buildEmployeeDirectorySeed()`; (2)
  consolidated 3 near-identical vendor-alias-unlink blocks into
  `removeVendorAliasEverywhere(key)` (verified this preserves the
  `_safeguardGlobalSettingsBeforePush` call from the S51/emergency fixes —
  don't strip that call if you ever touch this function again); (3) removed
  27 functions, EVERY ONE independently confirmed to have zero callers
  anywhere in the file before removal (`addContractsDrawerSection`,
  `openContractDetailModal`, `addNotesSection` — superseded by
  `addUnifiedNotesSection`, `addReviewNotesSection`, `savePermToSupabase`,
  `migrateHiddenFieldsToPerms`, `showRenzoModal`+`makeRenzoBtn` — an
  orphaned pair, live Renzo buttons all go through `renzoButton()`+
  `generateRenzoOutreach()` directly instead, and 19 others). The
  incoming file also had inconsistent CRLF/LF line endings — normalized to
  full CRLF before adopting, per this project's hard line-ending rule.
  **If something breaks that traces back to this pass**, the fast fix is
  reverting to commit `2f87c8d` (see checkpoint note above), not trying to
  patch forward into unfamiliar consolidated code.
- **Query `Spend__c.Sales_P__c`/`Spend__c.Admin_Fee_P__c`, never the raw
  `Sales__c`/`Admin_Fee__c`** — confirmed via David's own Salesforce Setup
  audit that the raw fields are FLS-hidden from the Sales Rep profile; the
  `_P` formula-field variants are what Salesforce's permission model
  actually intends every role to read (see memory: vcs-salesforce-p-fields
  for the full investigation). If you add a NEW Spend__c query anywhere,
  use the `_P` fields from the start — don't copy an old raw-field query
  as a template. This does NOT apply to `Vendor__c`'s own `Admin_Fee__c`
  (a different, unrelated field on a different object, no confirmed `_P`
  variant) — don't conflate the two just because the name matches.
- **`AP_Spend__c`'s existing query (~line 17713: `SELECT Id, Name,
  Sales__c, Admin_Fee__c, Period__c FROM AP_Spend__c`) references fields
  that don't exist on that object at all** — confirmed via the same
  Salesforce audit: AP_Spend__c only has `AP_Spend_Amount__c`,
  `Invoiced_Date__c`, `AP_Vendor__c`, `Facility__c`, and a checkbox field.
  This is almost certainly silently failing/returning nothing today. NOT
  fixed yet — it's a different bug (wrong field names for the actual
  schema, not a permissions issue) and AP_Spend__c has no `_P` field built
  yet either. Don't confuse this with the Spend__c fix above when working
  in this area.
- **`_TOUCHED_USERS` (the set of user emails THIS tab has authority to
  overwrite the server's copy of) must be cleared once a save actually
  succeeds — never let it accumulate for the whole session.** It used to
  only grow, never shrink, so any later, unrelated save would re-push
  every previously-touched user's local snapshot, silently reverting
  anything another admin/tab changed to those same users in the meantime.
  `_saveUsersViaProxyImpl()` now snapshots it at the start of each call and
  clears exactly that snapshot after a successful push — anyone touched
  again mid-flight stays protected until THEIR save completes. If you add
  a new code path that calls `touchUser()`, you don't need to do anything
  extra — this cleanup is automatic on the next successful save — but
  don't add a NEW "protect until X" mechanism without matching this
  clear-on-success pattern, or the same staleness bug will recur.
- **Every per-user toggle handler MUST call `touchUser(email)` before its
  save fires — a toggle that skips it has its own edit silently discarded
  by the very next save's merge** (untouched users get overwritten with
  the server's fresh, pre-edit copy). The Assistant Admin toggle was
  missing this for an unknown amount of time before being caught — if you
  add or touch any per-user toggle, verify `touchUser()` is called, don't
  assume it is just because a nearby similar toggle has it.
- **Any function that hydrates role-level config (field visibility, tab
  overrides, custom roles/labels/colors, etc.) from the shared server MUST
  overwrite local storage whenever the server's value actually DIFFERS —
  never gate on "only if local is completely empty."** `_hydrateRoleConfigFromSettings()`
  used the "only if empty" pattern for years; once any browser cached ANY
  value for a role/key, it silently ignored every later server update for
  that same role/key forever. This is the actual root cause behind
  multiple "role default change didn't apply" reports. The per-user list
  merge in `loadGlobalSettingsViaProxy()` already used the correct "server
  wins when different" policy — match that, not the old per-role pattern,
  for anything new. Guard any such overwrite with `_settingsDirty` (or the
  equivalent dirty flag for whatever you're hydrating) so a periodic/
  incidental reload can't stomp a local edit that hasn't been pushed yet.
- **There are now THREE separate "is there an unsaved change" flags, and a
  new save path must set the RIGHT one or `saveFile()`'s dirty-check will
  miss it and falsely claim "No unsaved changes":** `S.dirty`/`v._dirty`
  for vendor records, `_settingsDirty` for role-level defaults (set inside
  `debouncedSaveSettings()`), and `_userSaveDirty` for per-user overrides
  (set inside `scheduleUserSave()`). If you add a fourth kind of save path
  that doesn't funnel through one of these three, either route it through
  the closest existing one or give it its own flag and wire it into
  `saveFile()` — don't leave it invisible to the Save button.
- **The top-bar "💾 Save" button (`saveFile()`) used to ONLY check
  vendor-record dirty state (`S.dirty`/`v._dirty`) — it had zero awareness
  of pending settings/role-default saves, so it would report "No unsaved
  changes — everything is already synced" even while a settings change was
  still sitting on `debouncedSaveSettings()`'s 3-second debounce timer, or
  had silently failed to reach the server.** David hit this live: changed a
  role's Field Visibility default, got a toast, clicked Save, got the false
  "already synced" message, and a different user's refresh confirmed the
  change never reached Supabase. Fixed via a `_settingsDirty` flag (set
  `true` inside `debouncedSaveSettings()`, cleared only on a CONFIRMED
  successful `saveConfigToDrive()`) and `_flushSettingsSaveNow()` (forces an
  immediate save and returns true/false). `saveFile()` now checks and
  flushes BOTH vendor and settings dirty state and reports on both
  honestly. If you add any new debounced-settings-writing path in this
  file, make sure it still ultimately funnels through `debouncedSaveSettings()`
  so `_settingsDirty` stays accurate — a save path that bypasses it will be
  invisible to the Save button's dirty-check again.
- **Every role-default toggle now ALSO fires `_toastSaveResult(savePromise,
  label)` for honest, delayed save confirmation — layered on top of the
  existing immediate optimistic toast, not a replacement for it.** The
  immediate "✓ ... updated" toast only ever reflects the local change; only
  the delayed "✓ ... confirmed saved to server" / "⚠ ... FAILED to reach
  the server" toast reflects the real network outcome. Any NEW role-default
  toggle handler should wrap its save call the same way — see Tab Access
  Defaults' `persistRoleTabState()` (returns true/false, async) and Field
  Visibility/Permissions Defaults' `_toastSaveResult(saveConfigToDrive(), ...)`
  call sites for the two patterns in use.
- **Every single toggle handler that writes a role-level default to
  localStorage MUST also call `debouncedSaveSettings()` (or an equivalent
  save/sync call) — writing to localStorage and re-rendering is NOT
  enough, and this exact gap has now been found independently in TWO
  different Role & Feature Defaults panels.** Field Visibility Defaults'
  individual toggles and both its bulk actions had zero save call at all;
  Permissions Defaults' "See Financials" toggle had the same gap despite
  its sibling toggles in the identical section being correctly wired. If
  you add or touch ANY role-default toggle handler in this file, verify it
  actually calls `debouncedSaveSettings()` (or, for Tab Access Defaults
  specifically, `persistRoleTabState()`'s own direct `saveConfigToDrive()`
  call) — don't assume it does just because a nearby, similar-looking
  toggle does. The fastest way to verify this class of bug for real: set a
  unique, unambiguous test value via the live UI (or by directly
  replicating what the handler does), wait out the debounce timers
  (500ms + 3000ms), then fetch the real server config directly and check
  whether the value actually landed — reading the source code alone is not
  sufficient, since the missing call is easy to miss by eye.
- **Notes now have a real archive/restore cycle, matching vendors'
  archiveVendor()/restoreVendor() pattern — never build a "delete" action
  for anything in this app without checking whether it should route
  through a recoverable archive instead of an outright removal.** David's
  explicit standing preference: all deletions should be soft, recoverable
  from a mistake. The prior note "Hide" button wrote to `S._hiddenNotes`,
  which nothing ever read back — a complete no-op masquerading as a
  working delete (it showed a success toast while doing nothing). Use
  `archiveNoteLogEntry(vendor, logEntry)`/`restoreNoteLogEntry(vendor,
  archivedEntry)` for non-DB notes (operates on `vendor._notesLog` /
  `vendor._archivedNotesLog`, and rebuilds `vendor.notes` via
  `_rebuildNotesFromLog()` — do NOT rebuild that string manually, it must
  preserve each entry's own original timestamp, not "now"). DB
  (Supabase-backed) notes keep the existing `deleted_at` soft-delete but
  must stay in `vendor._sbNotes` (marked `_deleted`) rather than being
  filtered out of the array, or there's no way to restore them within the
  session.
- **The global keyboard-shortcut handler's "don't hijack while typing"
  guard only ever checked `tagName` against INPUT/TEXTAREA/SELECT — any
  `contenteditable` element (the rich-text note editor, and any future
  one) was never excluded, so typing common letters like "f" inside it
  triggered global shortcuts (focus search) instead of typing them. Fixed
  by also checking `.isContentEditable` and the closest
  `[contenteditable="true"]` ancestor. **If a future report says typing
  in some field "randomly" jumps focus or drops keystrokes, check this
  exact handler first** — the same gap will reappear for any new
  contenteditable surface unless it goes through the shared `_kbTypingTarget()`
  check.
- **Notes have TWO separate storage/categorization concerns that are easy to
  conflate: the note's real TYPE (`NOTE_TAGS` — Call/Email/Meeting/Contract/
  Internal/Follow-up/Other/general/sf_log/pipeline/review, what the user
  picks when saving) vs. the DISPLAY SUBSECTION category (Pipeline/Review/
  SF/Contract/DB/Excel/Log, used to group notes in the vendor panel).** These
  don't match 1:1 by name or case (`pipeline`→`Pipeline`, `sf_log`→`SF`,
  etc.) — `addUnifiedNotesSection()` used to hardcode every `_notesLog`
  entry's category to `'Contract'` regardless of its real tag, silently
  discarding the user's actual choice. If you add a new NOTE_TAGS value
  that should map to a specific display subsection, add it to the
  `_NOTE_TAG_TO_CATEGORY` mapping there — anything not in that mapping
  correctly falls through to "Other Notes," which is fine for tags that
  aren't meant to have a dedicated subsection.
- **When a vendor object can be found via more than one lookup path (e.g. a
  vendor viewed directly from ITW/Pipeline vs. cross-referenced from the
  main vendor list by name), always check whether the "other" lookup can
  resolve to the SAME object you already have, not just a different one
  with the same name.** `addUnifiedNotesSection()`'s `_itwSrc` lookup used
  to re-read and re-parse the exact same `.notes` string a second time
  whenever `vendor` itself was the ITW record, with no dedup against
  already-collected entries — silently doubling every note on any
  pipeline vendor. Fixed with an explicit `_itwSrc!==vendor` guard plus a
  content+date dedup check for the genuine cross-reference case.
- **Any NEW surface that reads vendor data (AI context, exports, reports,
  etc.) must redact via `canViewField(fieldKey)` for EVERY field it emits —
  never hand-roll a `hidden.includes(fieldKey)` check against a hardcoded
  subset of fields.** `buildAIContext()`/`buildVendorLookup()` only
  redacted 6 of the ~60 hideable fields (adminFee/tiers/procContact/
  email/notes/adminFeeNotes), silently exposing everything else
  (contractName, autoRenewal, termEffective, perpetuity, tail, minYears,
  status, score, etc.) to the AI assistant regardless of the asking user's
  actual restrictions — on top of two OTHER sections (portfolio-wide fee
  benchmarks, top-urgent/expiring vendor summaries) that had NO redaction
  check at all. Fixed by routing every emitted field through
  `canViewField()` directly. **Also**: don't rely on a prompt instruction
  telling the model "don't reveal restricted fields" as the actual security
  boundary — if the real value is present in the context at all, the model
  can still leak it. Redact AT THE DATA LAYER (replace the value before it
  ever reaches the model), and only use the prompt to explain that
  redaction already happened, not to ask the model to self-censor.
- **Every `action:'saveConfig'` call site must go through the globalSettings
  safeguard — there are SIX of them, not one.** `_saveUsersViaProxyImpl()`
  was the only one originally fixed against blindly overwriting the
  server's real `globalSettings` with a stale/empty local `vcs_config`
  cache. Five other ad-hoc sites (vendor alias link/unlink, contract record
  persistence) independently read the local cache, changed one unrelated
  field, and pushed the whole thing back — bypassing the fix entirely and
  re-wiping `supabaseUrl`/`supabaseKey` hours after they'd already been
  fixed once. All six now call the shared `_safeguardGlobalSettingsBeforePush(cfg)`
  helper right before pushing. **If a NEW feature ever needs to push
  `action:'saveConfig'` directly instead of going through
  `saveUsersViaProxy()`, it MUST call this helper first** — grep for
  `action:'saveConfig'` (or `action: 'saveConfig'`) to find every current
  call site if a new one needs auditing.
- **`ROLE_PERMS[role].tabs` MUST always be an array of tab-id strings —
  never assign an object to it.** A leftover legacy IIFE (near where
  `_hydrateRoleConfigFromSettings` is defined) used to run on every page
  load and directly overwrite it with `vcs_role_tab_overrides[role]` (the
  CURRENT storage format: an object of `{tabId:{view,edit}}` mappings),
  corrupting it for any role with a saved tab override. Since
  `.includes(tabId)` is called against this value in multiple places
  (`isTabAllowedForUser()`'s final fallback, `resolveRoleTabState()`'s
  `builtInDefault`), and plain objects have no `.includes()`, this threw —
  and depending on where the exception surfaced, could cascade into large
  parts of the UI rendering as fully restricted. Confirmed this reproduced
  on a genuinely fresh page load, not just accumulated test-session
  state — deleted the IIFE outright (2026-07-06). **If a role's
  permissions look inexplicably "all-or-nothing" broken again, check
  `Array.isArray(ROLE_PERMS[role].tabs)` first** — this is now the third
  time in one session that `ROLE_PERMS[role].tabs`/`vcs_role_tab_overrides`
  confusion has caused a real bug (see the `canView()`/`TAB_PAGE_DEFAULTS`
  entry below too), and it's an easy trap to reintroduce: anything that
  touches `ROLE_PERMS[role].tabs` must treat it as an array, full stop —
  never assign the tabOverrides object shape to it directly.
- **`canView(key)` has a THIRD data source for tab visibility, separate from
  both `USER.tabOverrides` and `vcs_role_tab_overrides` — a hardcoded static
  object called `TAB_PAGE_DEFAULTS`, and it predates the Tab Access Defaults
  UI entirely.** Only `contracts`/`spend`/`network`/`economics`/`forecast`/
  `reports`/`tiers` route through this specific branch (see
  `_PERM_KEY_TO_LEGACY_TAB`), but for exactly those 7 ids, an admin's
  role-level Tab Access toggle used to have ZERO effect — `canView()` read
  `TAB_PAGE_DEFAULTS[role][tabId]` instead of the real, current
  `vcs_role_tab_overrides` data. Two distinct failure directions from the
  same cause: a tab missing from `TAB_PAGE_DEFAULTS[role]` entirely falls
  through to a hardcoded `return true` (over-permissive, ignores an admin
  marking it restricted); a tab hardcoded to `false` there can never be
  turned ON via the UI (stuck restricted regardless of admin config).
  Fixed (2026-07-06) by having `canView()` call `resolveRoleTabState()` —
  the same function the Tab Access Defaults panel itself uses to decide
  what checkbox to show — so displayed settings and actual enforcement
  cannot diverge for these 7 ids anymore. **If a permission setting
  "doesn't take effect" for one of these 7 specific tabs (or a NEW tab id
  ever gets added to `_PERM_KEY_TO_LEGACY_TAB`), check whether its
  enforcement path actually reads current role/user override data or a
  stale hardcoded snapshot before assuming the UI itself is broken** — this
  is the third time this exact class of bug has been found in a different
  spot this session (`isTabAllowedForUser()`'s object-truthy bug, Today's
  sub-tabs never being gated at all, and now this).
- **A page having sub-tabs in `PAGE_HIERARCHY`/the Tab Access UI does NOT
  mean those sub-tabs are actually enforced anywhere — each page's own
  render function has to explicitly gate on them, and it's easy for a page
  to be missing that gate entirely.** `renderToday()` had zero permission
  checks for any of its 10 sub-sections; only its own collapse/expand UI
  state gated visibility. Found by contrast: Analytics' and SF Board's
  sub-tabs already correctly restrict (both use a `gateKey` filter pattern
  delegating to `userCanSeeTab()`). **If you copy that same
  `userCanSeeTab(gateKey)` pattern to a new page, verify it actually works
  for your specific ids first** — `canView()` (which `userCanSeeTab()`
  delegates to) only reaches `USER.tabOverrides` for a legacy tab id via the
  `_PERM_KEY_TO_LEGACY_TAB` map, and any id missing from that map silently
  falls through to `canView()`'s default `return true`, regardless of the
  real override value. This is exactly what made the first fix attempt for
  Today look plausible but do nothing — caught only by an actual live test
  with real restricted data before it shipped. When in doubt, check
  `USER.tabOverrides[id]` directly (same object-shape handling as
  `isTabAllowedForUser()`) rather than assuming `userCanSeeTab()` covers an
  id just because it covers others.
- **When a user's role changes, EVERY per-user permission field that has a
  role-level default needs to be explicitly reset to it — it's easy to add
  a new one (like `requireSearchToList`) to Add User's seeding logic and
  forget the two separate role-CHANGE code paths (individual dropdown +
  bulk action) that need the identical treatment.** `getResolvedRolePermissionDefaults(role)`
  is the single shared helper for this — use it in all three places, not
  just Add User.
- **Any function that pushes `S.settings` values to the shared backend must
  merge against the server's current state first — never build the outgoing
  payload purely from local state and push it as a replacement.**
  `_saveUsersViaProxyImpl()` already did this carefully for the `users`
  array (pull server's current list, only let a "touched" record's local
  edit win, untouched records take the server's fresh copy) — but its
  `globalSettings` construction had NO equivalent merge: it built
  `globalSettings` fresh from `S.settings` using `S.settings[k] !==
  undefined` as the only guard, then pushed it as a wholesale replacement.
  Since `S.settings` initializes `sfClientId`/`msGraphClientId`/
  `msGraphTenantId`/`driveFileId` etc. as literal `''` (never `undefined`),
  that guard was always true — meaning ANY save from a browser that hadn't
  yet synced a given key silently wiped it from the server for everyone,
  permanently. Confirmed this had already happened to the real production
  backend (2026-07-06) — likely triggered by this session's own
  fresh-browser test cycles, which necessarily perform real
  `recordLogin()`→`saveUsersViaProxy()` writes as a side effect of
  simulating logins. Fixed by reusing the SAME pre-save server fetch
  already happening for the users merge to also read the server's current
  `globalSettings`, and only letting a local value win if it's genuinely
  meaningful (not `''`/`null`/`undefined`/empty-object — booleans are
  always meaningful). **If a "global setting doesn't stick" or "reverts
  after someone else logs in" bug shows up again, check whether the
  relevant save path merges against the server's current state or just
  pushes local state as a wholesale replacement** — this exact class of bug
  is easy to reintroduce on any NEW global setting added later if its
  write path copies the old unmerged pattern instead of the fixed one.
- **`loadGlobalSettingsViaProxy()` never throws — it catches its own errors
  internally and returns `false`.** Any caller's `try/catch` around a call
  to it is catching nothing; the ONLY way to detect failure is checking its
  return value. `handleOAuthLogin()`'s pre-auth sync used to rely on the
  (dead) catch block, meaning a slow/cold GAS response on a genuinely fresh
  browser (nothing cached locally) fell through to `getApprovedUsers()`
  returning `[]`, which production mode treated as "confirmed nobody is
  approved" and permanently denied a real, approved user with no retry.
  Fixed: check the actual boolean return value, retry once on failure, and
  — the more important half of the fix — distinguish "we couldn't verify"
  (sync failed) from "we verified you're not on the list" (sync succeeded,
  genuinely not found); only the latter shows the permanent "Access Denied"
  screen. **If a real, approved user reports being denied access, check
  whether this was a genuine sync failure/timeout racing an empty local
  cache before assuming their account itself is misconfigured.**
- **`USER.tabOverrides[tabId]` has TWO valid shapes — a legacy bare boolean,
  and the current `{view, edit}` object the real Tab Access UI actually
  writes — and not every reader handled both.** `canView()`,
  `resolveRoleTabState()`, and `userCanEditTab()` all correctly check
  `.view !== false` / `.edit === true` for the object shape. But
  `isTabAllowedForUser(tabId)` — the ONE function both `updateSidebar()`'s
  nav-button list and, critically, `render()`'s own content-access guard
  (`!isTabAllowedForUser(S.view)`) depend on — used to do
  `return !!_tabOverrides[tabId]`, which is ALWAYS `true` for any object
  regardless of its actual `.view` value (any non-null object is truthy in
  JS). This silently made every per-user tab restriction a no-op for BOTH
  the sidebar AND actual page content — a real, currently-exploitable
  access-control bug, confirmed live against a real user's (Monica DeLora)
  actual restricted production record, and confirmed present in BOTH
  sandbox and production (not a staleness issue — this has likely never
  worked since the `{view,edit}` object format was introduced). Fixed
  (2026-07-06) to match the same `.view !== false` convention already used
  correctly everywhere else. **If a "restriction doesn't take effect" bug
  shows up again for ANY per-user or per-role override field, check
  whether the specific reader function actually inspects the object's
  properties, or just does a bare truthiness check on the whole object** —
  that's exactly the class of bug this was, and it's an easy one to
  reintroduce by copy-pasting a boolean-style check onto a field that's
  since grown into an object.
- **`loadGlobalSettingsViaProxy()` has ~7 call sites across the file — calling
  it twice in quick succession is real, measured wasted time, not just
  theoretically wasteful.** On a genuinely fresh browser (no localStorage at
  all), `handleOAuthLogin()`'s own pre-auth security-sync call to this
  function succeeds in a few seconds and already populates
  `S.settings.supabaseUrl`/`supabaseKey` (and everything else in
  `SAFE_GLOBAL_KEYS`) — but `completeLogin()`, which runs immediately after,
  has no way to know that just happened and unconditionally calls the exact
  same function again for the exact same data. Live-tested and confirmed:
  that second call reliably burns the FULL 15-second client-side timeout
  before failing — GAS web apps are measurably slow to re-enter the same
  deployed script again this soon after a prior call finished. Since
  `completeLogin()`'s structure requires that second call to resolve before
  it can reach `loadFromSupabase()`, this was costing every fresh OAuth
  login (Google AND Microsoft — both hit this identical path on a fresh
  profile, since `GDriveToken` is set by a separate, explicit "Connect
  Drive" action, never by login itself, despite what this function's own
  header comment implies about being "for non-Google-auth users") a real
  ~15-20 second tax before any vendor data started loading. Fixed
  (2026-07-06) with a 10-second success-cache: `_lastProxySyncSuccessAt`
  timestamp set only on real success, checked at the top of the function —
  a call within 10s of a prior success returns `true` immediately, no
  network round-trip. Failures are never cached, so a genuine retry is
  unaffected. **If a "settings/credentials don't load" bug shows up again
  for a specific call site, check whether ANOTHER call site already fired
  moments earlier in the same sequence before assuming the fetch itself is
  broken** — this function's own logic was correct in isolation; the bug was
  purely from calling it redundantly. Also worth knowing: an earlier pass at
  reproducing this bug (checking `SB.ready()`/vendor count immediately after
  an `await handleOAuthLogin(...)` call) produced a false "total failure"
  reading — `handleOAuthLogin()` fires `completeLogin()` without awaiting
  it, so checking state too early catches it mid-flight, not actually
  broken. Always explicitly `await completeLogin()` directly (bypassing the
  fire-and-forget call site) when live-testing anything downstream of
  login — otherwise you're measuring an arbitrary snapshot mid-sequence, not
  the real outcome.
- **Any role-config or permission data that lives only in localStorage never
  crosses origins — sandbox and production are separate origins and share
  NOTHING except the Supabase DB via the GAS proxy's `getConfig`/`saveConfig`.**
  This exact gap caused production to show a test user with full access
  despite restrictions being set and verified working on sandbox:
  `vcs_role_tab_overrides`, `vcs_role_fields_<role>`, `vcs_role_field_edit_<role>`,
  `vcs_custom_roles`, `vcs_builtin_role_labels`, `vcs_builtin_role_colors` were
  pure localStorage with no sync path at all. Fixed (2026-07-06) by adding all
  6 keys to `GLOBAL_SETTING_KEYS` plus two new functions:
  `_mirrorRoleConfigToSettings()` (outgoing, localStorage → `S.settings`) and
  `_hydrateRoleConfigFromSettings(gs)` (incoming, server → localStorage +
  in-memory globals, gap-fill only — never overwrites an existing local
  value). **If a new role-level or permission-level localStorage key is ever
  added, it needs to be added to both of these functions AND to
  `GLOBAL_SETTING_KEYS` — it will NOT sync automatically just by existing.**
  Deliberately NOT added to `SAFE_GLOBAL_KEYS` (a different, narrower list
  used by a "fill `S.settings[k]` from server only if currently falsy" loop
  elsewhere) — `_hydrateRoleConfigFromSettings()` reads the raw server
  `globalSettings` payload directly instead, specifically to avoid a masking
  bug: an origin that has already mirrored its OWN local role config into
  `S.settings` would otherwise permanently block ever seeing a DIFFERENT
  origin's data for that same key.
  **The harder part of this bug: several real write paths bypass the save
  pipeline entirely.** `debouncedSaveSettings()` was the obvious place to call
  `_mirrorRoleConfigToSettings()`, and it does — but live testing (a real UI
  toggle on Tab Access Defaults) showed `S.settings` never actually updated.
  Root cause: `persistRoleTabState()` (the real toggle handler) and all 3
  custom-role setters (`saveCustomRoles()`, `saveBuiltinRoleLabels()`,
  `saveBuiltinRoleColors()`) all call `saveConfigToDrive()` **directly**,
  never going through `debouncedSaveSettings()` at all. Rather than chase
  every individual bypass, the mirror call was placed at the one true choke
  point every save path funnels through before the network push:
  `_saveUsersViaProxyImpl()`, immediately before it builds the outgoing
  `globalSettings` object. **If a "this setting doesn't sync" bug shows up
  again for anything role/permission-related, check whether its write path
  actually reaches `_saveUsersViaProxyImpl()` before assuming the mirror
  function itself is broken** — `debouncedSaveSettings()` alone is not a
  reliable place to hook outgoing sync in this codebase; several write paths
  skip it.
  Also relevant: `_enforceParentChildTabConsistency` was a dead, unreachable
  IIFE (`(function _enforceParentChildTabConsistency(){...})();` — no way to
  call it again after initial load) and had to be converted to a real named
  function declaration so hydration could re-run it after pulling in new
  server data. If something with a similar "runs once at parse time, never
  again" shape needs to become re-invokable, check for this IIFE pattern.
  Fully verified live against the real shared backend (not just traced
  through source) — see VCS_MASTER_TASKLIST.md's JUST FIXED entry for the
  complete test sequence (outgoing sync, incoming hydration on a simulated
  fresh origin, never-overwrite-local safety property, migration-scope
  re-confirmation).
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
- **Title bar heights, TRUE final pass — the 32px `height` fix from earlier
  that evening wasn't actually the whole story.** David correctly spotted
  that Role & Feature Defaults, User Management, Click-to-Call, Calendar
  Availability, Startup & Navigation, Display Preferences, and API Usage
  Monitor were still visibly taller than Connections & API Keys/Quick
  Setup/File Info/Data Actions/Field Registry when COLLAPSED, despite
  every header ROW measuring an identical 32px. Root cause: the 7 taller
  sections' outer wrapper carries `.settings-section` or `.summary-section`
  — both apply `padding:12px` via CSS on EVERY side, and that padding
  persists on the container regardless of whether the body inside is
  `display:none` (padding is a property of the container, not
  conditionally removed based on a child's visibility). The header's
  existing negative-margin trick (see the indent-fix entry above) only
  ever cancelled top/left/right — nothing cancelled the bottom padding,
  which just sat there as ~12-16px of dead space below a collapsed header.
  Fixed by toggling each container's own `paddingBottom` between `'0'`
  (collapsed) and `''` (expanded, letting the class's normal 12px apply)
  in the exact same places the body's `display` is already toggled — so
  the expanded look is completely unchanged (verified: `paddingBottom`
  computes back to `12px` the moment a section is expanded, real body
  content renders at full size) while collapsed height now drops to
  exactly 34px, matching the un-classed sections precisely.
  **Separately, in the same pass: Field Registry never had a persisted
  collapse state at all** (always hardcoded to start expanded, no
  localStorage key) — which is *why* "Collapse All" visibly skipped it
  (there was no key for that button to reset). Gave it a real key
  (`vcs_s_fieldreg`, defaulting collapsed like every other section) and
  added it everywhere the other sections' keys already get reset:
  the Expand All/Collapse All buttons AND the Ctrl+E/Ctrl+K shortcuts.
  **Verified via `getBoundingClientRect()` on all 13 top-level sections
  after clicking the real "Collapse All" button (not just checking
  computed styles): every single one now measures exactly 34px.** If a
  height mismatch like this recurs, check for a `.settings-section`/
  `.summary-section` class on the container FIRST — its padding is the
  recurring culprit, not the header's own styling.

## CURRENT PRIORITY LIST

See `VCS_MASTER_TASKLIST.md` in the repo root for the live, actively
maintained task list — that file is the source of truth for what's
in-progress/blocked/not-started, updated at the end of every session.

## DEPLOYMENT

Sandbox and production are separate repos — pushing to `dgenuth/vcs` does
NOT touch production. Production deploy is a manual, explicit step (GitHub
Actions, gated behind confirmation) from `primesource-cms`. Never assume a
sandbox push reached production.
