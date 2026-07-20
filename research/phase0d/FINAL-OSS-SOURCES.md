# FINAL OSS Paid-Work Source List (Phase 0d — locked)

This is the terminal output of the OSS-work source research thread
(Phase 0 → 0c → 0d). It supersedes prior OSS-source claims in
`research/phase0c/SOURCE-PRIORITY.md` where they conflict (that file's
scope was job/aggregator/ATS sources generally — OSS-specific findings
here are the authoritative resolution). **No implementation sequencing
decided here** — same convention as `SOURCE-PRIORITY.md`: this is
source viability and priority only.

---

## (a) Automatable now — verified access path

Sources with a confirmed, working, public/official access mechanism
this session.

1. **CNCF LFX Mentorship** — `github.com/cncf/mentoring` repo,
   `programs/lfx-mentorship/{year}` directory structure. GitHub
   Contents API, no auth required (though authenticated calls get the
   5000/hr rate limit vs. 60/hr unauthenticated). Confirmed live,
   current-year-adjacent term directories present.
2. **LFDT (LF Decentralized Trust) Mentorship** — dedicated repo
   `github.com/lf-decentralized-trust-mentorships/mentorship-program`.
   Confirmed to exist (200 OK). Same GitHub-Contents-API mechanism as
   CNCF; internal directory structure not yet enumerated — do a
   contents-listing call before building the parser, don't assume
   CNCF's exact layout carries over unmodified.
3. **ESoC (European Summer of Code)** — repo
   `github.com/european-summer-of-code/esoc2026`. Confirmed active,
   current-cycle, recently pushed (2026-06-07), not archived. Same
   GitHub-Contents-API pattern as items 1–2.
4. **NLnet news/grants feed** — `https://nlnet.nl/feed.atom` (**not**
   `news.xml` as earlier reports claimed — that path 404s). Confirmed
   live, current (most recent entry within a week of this session),
   valid Atom XML. Carries both grant-award announcements (freelance
   outreach targets — a project that just got funded may need
   contractor help) and call-for-proposal deadline announcements in
   one interleaved feed. **Caveat to carry into any calendar/watcher
   built on this: as of this session, NLnet's NGI-branded open calls
   are flagged in the feed itself as "temporarily paused" during a
   transition to "Open Internet Stack" branding** — don't hardcode a
   "quarterly deadline" assumption without checking current feed state.
5. **Outreachy cohort-timing feed** — `outreachy.org/blog/feed/`.
   Confirmed live Atom feed, reliably carries cohort application-window
   and mentoring-org call-for-proposal timing going back through
   multiple 2025/2026 cycles. **Timing/cadence only** — per-project
   detail remains manual, as expected; this feed exists purely to
   auto-populate calendar dates instead of hand-tracking them.

**Not yet confirmed but same mechanism family, worth a fast follow-up
(no new source-family investigation needed, just one more GitHub
Contents API call each):**
- LFDT mentorship-program repo's internal directory structure (item 2
  above — existence confirmed, structure isn't).

---

## (b) Calendar-file entries — static/manual track

The full list carried over from the source research reports plus this
session's confirmations of "static page, no feed" status. This is the
spec for the operator's static OSS-calendar:

- **GSoC (Google Summer of Code)** — program windows, application
  deadlines. Org-level machine-readable data is **unresolved** (see
  Rejected/Unresolved below) — track timing manually regardless of
  which org-data path (if any) eventually gets built.
- **eBPF Foundation Mentorship** — highest operator-fit program, but
  confirmed this session to have **no dedicated GitHub repo** — it
  rides the central `mentorship.lfx.linuxfoundation.org` JS-app portal
  (confirmed client-rendered, no server-side project data in the raw
  HTML). Calendar-track until/unless a future session adds browser
  automation (separate scope decision).
- **LFX Mentorship — all foundations besides CNCF/LFDT** — same
  central-portal limitation as eBPF above. Calendar-track.
- **Summer of Bitcoin** — carried from source reports, not independently
  probed this session (out of the 8-probe scope). Calendar-track.
- **FOSS United** — carried from source reports, not independently
  probed this session. Calendar-track.
- **MLH (Major League Hacking) Fellowship** — carried from source
  reports, not independently probed this session. Calendar-track.
- **Igalia Coding Experience** — carried from source reports, not
  independently probed this session. Calendar-track.
- **Outreachy project specifics** (mentoring-org project list, as
  opposed to the timing feed in (a) above) — per-project detail stays
  manual; the feed only automates *when* to look, not *what's listed*.
- **MITACS** — carried from source reports, not independently probed
  this session. Calendar-track.
- **IIT SURGE / IISc programs** — carried from source reports, not
  independently probed this session. Calendar-track.
- **SigNoz writer program** — carried from source reports, not
  independently probed this session. Calendar-track. (Note: SigNoz
  itself is already a confirmed Ashby ATS watcher target in
  `SOURCE-PRIORITY.md` (b) for its actual job postings — this is a
  separate, non-employment writer program from the same company.)
- **Corporate FOSS funds** (general category — vendor-specific OSS
  funding programs) — carried from source reports, not independently
  probed this session. Calendar-track.
- **GitHub Security Lab bounties** — confirmed this session: static
  marketing page (`securitylab.github.com/bounties/`), category tiers
  only, no live bounty-target listing or visible feed in the fetched
  page. One loose thread: the page references a `/feed.xml` at
  `securitylab.github.com` root that was **not fetched this session**
  (session request cap reached) — worth one follow-up fetch before
  finalizing this as pure calendar-track.

---

## (c) Rejected — with reason

- **Algora via generic GitHub search (`"/bounty" in:comments
  state:open`)** — **verified and rejected this session.** Returns
  22,851 results dominated by bot/AI-agent-farm repos
  (`mergeos-bounties/*`, `algo-bounty`-style auto-generated PRs), not
  genuine funded bounty discussions on established OSS projects. The
  literal substring `/bounty` is too common to be a usable Algora
  signal. If Algora integration is wanted, it needs Algora's own
  API/webhook — a real integration task, not the zero-effort shortcut
  the source reports hoped for.
- **Bug bounty platform scraping** (general) — out of scope per the
  standing OAOS security/ethics posture; not probed.
- **Immunefi** — web3/smart-contract security bounty platform, outside
  OAOS's stated OSS-paid-work target area (backend/infra/devtools/
  security-adjacent freelance and mentorship work, not smart-contract
  auditing). Not probed, rejected on scope-fit.
- **Web3 smart-contract audits** (general category) — same scope-fit
  rejection as Immunefi.
- **Maintainer funding platforms** (e.g. general "sponsor a maintainer"
  mechanisms not tied to a specific bounty/task) — rejected on
  scope-fit: these are recurring-sponsorship relationships, not
  discrete paid-work opportunities that fit OAOS's opportunity model.
- **Discontinued programs** (any program in the source reports flagged
  as no-longer-running) — rejected on currency grounds; not
  independently re-verified this session since the input reports
  already flagged them as dead.

---

## Unresolved — flagged for a future follow-up, not rejected

- **GSoC org-level machine-readable data.** Neither
  `api.gsocorganizations.dev`'s actual JSON endpoint nor
  `summerofcode.withgoogle.com`'s rendering mode was confirmed within
  this session's budget. `gsocorganizations.dev` is the more promising
  candidate (purpose-built, JSON-native per its own docs) — next step
  is reading its source repo's README (a file read, not a live probe)
  to find the real path, not guessing further endpoints live.
- **Polar API.** Docs site is a JS-rendered Mintlify app; the one
  endpoint guess tried (`/v1/issues/`) 404'd cleanly (wrong path, not
  gated). Needs either a rendered-docs read or a raw OpenAPI spec file
  in a follow-up session before it can be ranked.
- **GitHub Security Lab `/feed.xml`.** Existence confirmed via page
  source reference only; content never fetched (session cap reached).
  One fetch away from resolving whether GHSL has an actual feed
  underneath its static marketing page.
- **LFDT mentorship-program repo's internal structure.** Repo existence
  confirmed; directory/file layout not yet enumerated.

---

## Summary verdict for Phase 1 planning

Five sources are **fully locked and buildable today** using the exact
same GitHub-Contents-API / Atom-feed mechanisms already proven out in
Phase 0c's job-source work: **CNCF LFX, LFDT, ESoC** (all GitHub repos)
and **NLnet + Outreachy** (both Atom feeds, with NLnet's URL correction
now recorded). Everything else in the two source reports either needs
one more targeted follow-up (GSoC, Polar, GHSL's feed.xml, LFDT's
internal structure) or is confirmed calendar-only / rejected outright.
The eBPF Foundation — the operator's stated top-fit program — lands in
the calendar-only bucket this session; automating it specifically would
require a browser-automation approach against the JS-rendered LFX
portal, a distinct scope decision for a later session.
