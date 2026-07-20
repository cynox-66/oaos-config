# Evidence Inventory (C4 source of truth)

Last updated: 2026-07-09
Source: verified against cynox-66 GitHub canonical record (2026-07-09)

```json
[
  {
    "id": "heka-bearerguard-fix",
    "title": "BearerGuard Authorization crash fix (missing/malformed header → 401 not 500)",
    "type": "PR",
    "url": "https://github.com/hiero-ledger/heka-identity-platform/pull/124",
    "tech_tags": ["NestJS", "TypeScript", "Auth", "Guards"],
    "domains": ["Security", "Backend"],
    "relevance_blurb": "Fixed a crash-to-500 vulnerability where a missing or malformed Authorization header caused an unhandled exception in an authentication guard instead of a proper 401 — merged into an LF Decentralized Trust identity platform.",
    "recency_date": "2026-05-05",
    "strength": 4
  },
  {
    "id": "heka-oid4vp-sdjwt-hardening",
    "title": "OpenID4VP / SD-JWT verification type-safety hardening (4 merged PRs)",
    "type": "PR",
    "url": "https://github.com/hiero-ledger/heka-identity-platform/pull/159",
    "tech_tags": ["TypeScript", "Credo-ts", "OpenID4VP", "SD-JWT", "VerifiableCredentials"],
    "domains": ["Security", "Backend"],
    "relevance_blurb": "Restored SD-JWT attribute extraction via claimFormat discriminants, replaced unsafe any vp_token typing with strict OpenID4VP payload types, and resolved type-safety suppressions at the Credo-ts framework boundary in a decentralized-identity credential-verification pipeline. See also PRs #158, #150, #127.",
    "recency_date": "2026-05-30",
    "strength": 4
  },
  {
    "id": "heka-rfc-commit-identity-binding",
    "title": "RFC — Binding contributor identity to commit signatures via OID4VP",
    "type": "RFC",
    "url": "https://github.com/hiero-ledger/heka-identity-platform/issues/74",
    "tech_tags": ["OID4VP", "Git", "Cryptography", "DecentralizedIdentity"],
    "domains": ["Security", "DevTools"],
    "relevance_blurb": "Authored an RFC proposing a mechanism to cryptographically bind verified contributor identity to Git commit signatures using OID4VP, for an LF Decentralized Trust project.",
    "recency_date": "2026-04-26",
    "strength": 4
  },
  {
    "id": "heka-oid4vp-replay-prevention",
    "title": "OID4VP replay-attack prevention proposal (PR-context binding)",
    "type": "RFC",
    "url": "https://github.com/hiero-ledger/heka-identity-platform/issues/75",
    "tech_tags": ["OID4VP", "Cryptography", "SessionSecurity"],
    "domains": ["Security", "Backend"],
    "relevance_blurb": "Identified replay-attack exposure in OID4VP presentation flows and proposed session/PR-context binding as a mitigation. Proposal stage, not yet implemented.",
    "recency_date": "2026-04-26",
    "strength": 3
  },
  {
    "id": "krkn-rollback-systemexit",
    "title": "Chaos rollback safety — SystemExit bypasses rollback execution",
    "type": "PR",
    "url": "https://github.com/krkn-chaos/krkn/pull/1425",
    "tech_tags": ["Python", "Kubernetes", "ExceptionHandling"],
    "domains": ["Chaos-Engineering", "Infra"],
    "relevance_blurb": "Diagnosed that SystemExit (inheriting BaseException, not Exception) bypasses the scenario-plugin rollback handler, leaving cluster changes unreverted after an early plugin exit. Fix submitted to a CNCF-adjacent chaos framework; pending review.",
    "recency_date": "2026-06-25",
    "strength": 3
  },
  {
    "id": "krkn-lib-execcmd-args",
    "title": "exec_cmd_in_pod multi-element argument mishandling under bash -c",
    "type": "PR",
    "url": "https://github.com/krkn-chaos/krkn-lib/pull/291",
    "tech_tags": ["Python", "Kubernetes", "ShellExecution"],
    "domains": ["Chaos-Engineering", "Kubernetes"],
    "relevance_blurb": "Found and fixed a silent bug where multi-element shell commands passed to exec_cmd_in_pod() dropped arguments under bash -c, causing commands to appear to succeed while producing incorrect results. Fix submitted; pending review.",
    "recency_date": "2026-06-25",
    "strength": 3
  },
  {
    "id": "krkn-ci-sha-pinning",
    "title": "CI supply-chain hardening — pin workflow actions to commit SHAs",
    "type": "PR",
    "url": "https://github.com/krkn-chaos/krkn/pull/1417",
    "tech_tags": ["GitHubActions", "CI", "SupplyChainSecurity"],
    "domains": ["Security", "DevTools"],
    "relevance_blurb": "Pinned CI workflow action references to commit SHAs instead of mutable tags, closing a supply-chain attack vector. Merged into a CNCF-adjacent chaos framework.",
    "recency_date": "2026-06-21",
    "strength": 3
  },
  {
    "id": "kubearmor-test-coverage",
    "title": "KubeArmor unit-test coverage — config, cert (TLS), common, presets (submitted)",
    "type": "PR",
    "url": "https://github.com/kubearmor/KubeArmor/pull/2752",
    "tech_tags": ["Go", "UnitTesting", "TLS", "PKI"],
    "domains": ["Kubernetes", "Security", "Cloud-Native"],
    "relevance_blurb": "Submitted Go unit-test coverage for KubeArmor's config parsing, TLS certificate infrastructure, common utilities, and preset functions in a CNCF sandbox runtime-security project. Cite as submitted / pending review, not merged. PRs #2752, #2711, #2709, #2700.",
    "recency_date": "2026-07-08",
    "strength": 2
  },
  {
    "id": "buriburi-backend-security",
    "title": "Backend security hardening — trading system (collaborator)",
    "type": "PR",
    "url": "https://github.com/mrhapile/BuriBuri_Trading/pull/9",
    "tech_tags": ["Python", "APISecurity", "RateLimiting", "CORS"],
    "domains": ["Security", "Backend"],
    "relevance_blurb": "As a collaborator (not owner), implemented rate limiting, CORS restriction, log sanitization, request-size limits, sector-concentration risk guards, and a final risk-guardrail safety gate on a live algorithmic-trading backend.",
    "recency_date": "2026-02-15",
    "strength": 3
  },
  {
    "id": "mini-spv-node",
    "title": "Bitcoin SPV header-validation engine (Rust)",
    "type": "Project",
    "url": "https://github.com/cynox-66/mini-spv-node",
    "tech_tags": ["Rust", "Bitcoin", "Cryptography", "Consensus"],
    "domains": ["Security", "Backend", "Data"],
    "relevance_blurb": "Built a Rust implementation of a Bitcoin SPV client core — proof-of-work verification, cumulative chainwork tracking, and fork resolution. Systems-level cryptographic/consensus engineering outside any managed framework.",
    "recency_date": "2026-02-13",
    "strength": 3
  },
  {
    "id": "hyperhid-software-kvm",
    "title": "HyperHID — cross-platform low-latency software KVM",
    "type": "Project",
    "url": "https://github.com/cynox-66/HyperHID",
    "tech_tags": ["SystemsProgramming", "Networking", "LowLatency"],
    "domains": ["Infra", "Networking"],
    "relevance_blurb": "Engineered a cross-platform (Windows/macOS/Linux) software KVM focused on low-latency, measurable input responsiveness. Systems/networking work; currently dormant.",
    "recency_date": "2026-06-10",
    "strength": 3
  },
  {
    "id": "portfolio-devjaiswal",
    "title": "Personal engineering portfolio",
    "type": "Project",
    "url": "https://devjaiswal.me",
    "tech_tags": ["Web/Frontend", "TypeScript"],
    "domains": ["Web/Frontend", "Other"],
    "relevance_blurb": "Public portfolio aggregating projects, OSS contributions, and engineering writing. General-purpose evidence for outreach where a single link to a body of work is more useful than one specific artifact.",
    "recency_date": "2026-07-09",
    "strength": 2
  }
]
```