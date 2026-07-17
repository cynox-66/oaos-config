# DEV JAISWAL
+91 9756777417 · devj2311@gmail.com · LinkedIn · github.com/cynox-66 · devjaiswal.me

Systems and infrastructure engineer with 8 merged PRs across CNCF and Linux Foundation projects in chaos engineering, runtime security, and decentralized identity. I dig into unfamiliar production codebases, find the actual root cause, and ship fixes that hold up under maintainer review.

## OPEN SOURCE ENGINEERING

**Krkn · Kubernetes Chaos Engineering (CNCF, Red Hat)** — Jun 2026 – Present
Python · Kubernetes · krkn-chaos/krkn + krkn-lib · 11 PRs, 4 merged

- Tracked down a production bug on Red Hat OpenShift (ROSA) where pod exec silently dropped command arguments under bash -c. Fix submitted upstream with regression tests, pending maintainer review.
- Diagnosed a framework flaw where sys.exit() skipped cluster rollback entirely, leaving iptables rules and privileged pods behind on a live cluster — submitted an exception-safe rollback fix across 4 network chaos modules, pending review.
- Submitted node outage recovery support across AWS, GCP, Azure, OpenStack and IBM Cloud, pending review.
- Merged: CI supply-chain hardening (pinned workflow actions to commit SHAs), branch-coverage and OpenShift telemetry test suites, and CONTRIBUTING.md.

**KubeArmor · Runtime Security Enforcement (CNCF)** — Jun 2026 – Present
Go · eBPF/LSM · 4 PRs in review under the project-wide coverage initiative

- Wrote the first test suites for two security-critical packages, taking TLS certificate infrastructure from 0% to 80.3% coverage and daemon configuration from 0% to 99.5%.
- Refactored production code to kubernetes.Interface (fully backward compatible) so the suite runs against fake clients instead of live clusters.

**Heka Identity Platform · Decentralized Identity (Linux Foundation, Hiero)** — Apr – Jun 2026
TypeScript · NestJS · OpenID4VC · 8 of 14 PRs merged · Interviewed for LFX Mentorship Term 2

- Fixed an SD-JWT verification regression that silently dropped user attributes after a dependency upgrade, restoring 12/12 unit and 2/2 E2E tests.
- Patched an auth middleware crash that returned 500 instead of 401 on malformed Authorization headers, with tests for all 6 failure modes.
- Set up CI-enforced dependency validation that immediately caught 5 latent build-breaking violations in the codebase.

## PROJECTS

**pr-identity-verifier · Cryptographic PR Authorship Verification** — 2026
TypeScript · Ed25519 · GitHub Apps · 113 passing tests

- Built a GitHub webhook service that verifies who actually authored a PR: DID resolution, Ed25519 commit signature checks, and replay attack protection through a SHA-bound signature registry. Ran live against real PR events, backed by 113 tests including adversarial and concurrency suites.

**Meridian · Local-First Desktop Productivity App** — 2026
Electron · React · TypeScript · SQLite (WAL)

- Built a spatial canvas editor with a custom text wrapping engine that reflows text around floating shapes, automatic page overflow handling, and all persistence over a typed IPC bridge so the renderer never touches Node directly.

**knowledge-extractor · Browser Data-Extraction Pipeline** — 2026
TypeScript · Chrome MV3 · IndexedDB/OPFS · Turborepo monorepo

- Designed a 4-layer monorepo with isolated per-source connectors, retry and backoff scheduling, and incremental Obsidian export. Shipped the alpha connector through an RFC-driven process with documented stabilization phases.

**mini-spv-node · Bitcoin SPV Header-Validation Engine** — 2026
Rust

- Implemented Bitcoin header consensus from the protocol spec: proof-of-work verification, compact difficulty decoding, and heaviest-chain fork resolution.

## EDUCATION

**Vedam School of Technology × Ajeenkya DY Patil University, Pune** — Expected 2029
B.Tech, Computer Science & Engineering (AI) · CGPA 7.8/10

## TECHNICAL SKILLS

**Languages:** TypeScript, Python, Go, Rust, JavaScript
**Cloud Native:** Kubernetes, chaos engineering (Krkn), eBPF/LSM concepts, GitHub Actions, OpenSSF supply-chain hardening
**Security:** Ed25519, HMAC-SHA256, DID / OpenID4VC / SD-JWT, TLS and certificate infrastructure, auth boundary hardening
**Backend & Tools:** Node.js, NestJS, Express, Jest, pnpm/Turborepo, SQLite, Git
