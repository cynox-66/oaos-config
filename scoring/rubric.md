# OAOS Opportunity Scoring Rubric
# File: scoring/rubric.md
# Reference document for manual scoring in Airtable

---

## Overview

Every opportunity is scored on two axes:
- **Quality Score (0-50):** How good is this opportunity for Dev's long-term trajectory?
- **Match Score (0-50):** How strong is Dev's specific leverage for this opportunity?

**Total Score = Quality + Match (0-100)**

Tier thresholds:
- **S (85-100):** Pursue immediately. Maximum effort. Draft outreach this week.
- **A (70-84):** Strong fit. Active pursuit. Personalized outreach within 3 days.
- **B (50-69):** Moderate fit. Pursue if pipeline is thin.
- **C (0-49):** Skip or minimal effort.

---

## Axis 1: Quality Score (0-50)

### Factor 1: Domain Alignment (0-15)

| Score | Criteria |
|---|---|
| 13-15 | Core product is Kubernetes, eBPF, chaos engineering, runtime security, or cloud-native infrastructure |
| 9-12 | Adjacent to cloud-native: DevTools, general Infra, platform engineering, observability |
| 4-8 | Generic tech company with some cloud usage |
| 0-3 | No alignment with Dev's target domain |

**Examples:**
- Isovalent (Cilium/eBPF): 15
- Teleport (infra security tooling): 12
- Wiz (cloud security, less K8s-native): 10
- Generic React SaaS startup: 3

---

### Factor 2: OSS Friendliness (0-10)

| Score | Criteria |
|---|---|
| 9-10 | Maintains their own OSS project(s) actively (e.g., Cilium, Falco, Krkn) |
| 6-8 | Major contributor to upstream OSS projects |
| 3-5 | Uses OSS tools in their stack but does not contribute back |
| 0-2 | Closed-source only, no OSS involvement |

---

### Factor 3: Career Leverage (0-15)

| Score | Criteria |
|---|---|
| 13-15 | LFX Mentorship, GSoC, or equivalent structured OSS program with a mentor |
| 10-12 | Seed/early startup with < 30 engineers — direct exposure to technical decisions |
| 6-9 | Growth startup (30-200 engineers) — good exposure but more process |
| 2-5 | Corporate internship — structured but lower leverage |
| 0-1 | No meaningful career compound |

---

### Factor 4: Stage Fit (0-10)

| Score | Criteria |
|---|---|
| 9-10 | Seed or pre-seed startup (< 20 employees). Direct access to founders. |
| 6-8 | Early stage (20-50 employees). Probably still < Series B. |
| 3-5 | Growth stage (50-200 employees). Series B/C. |
| 1-2 | Late stage or public company. Enterprise culture. |

---

## Axis 2: Match Score (0-50)

### Factor 5: OSS Tech Overlap (0-20)

| Score | Criteria |
|---|---|
| 18-20 | Dev's Krkn/KubeArmor/Antrea work maps DIRECTLY to their stack (e.g., they use KubeArmor, contribute to Krkn, or have the same eBPF security focus) |
| 13-17 | Significant adjacent overlap (same ecosystem, different tools — e.g., they do chaos engineering on K8s, Dev does chaos engineering on K8s) |
| 7-12 | Partial overlap (they use Kubernetes, Dev knows Kubernetes — but different layer) |
| 2-6 | General K8s/cloud-native knowledge applies but no specific overlap |
| 0-1 | No meaningful OSS tech overlap |

---

### Factor 6: Evidence Asset (0-10)

| Score | Criteria |
|---|---|
| 9-10 | Specific PR/RFC/article can be cited that directly proves capability for this role (e.g., KubeArmor PR for an eBPF security role) |
| 6-8 | Portfolio piece directly relevant (e.g., KubeStellar PR for a K8s frontend role) |
| 3-5 | General OSS work shows engineering capability, nothing role-specific |
| 0-2 | Nothing specific to cite |

**Available evidence assets:**
- KubeStellar UI XL PR — proves: large-scale frontend contribution, CNCF project experience
- OID4VP RFC Authorship — proves: protocol design, standards-track work, security awareness
- Krkn Chaos contributions — proves: chaos engineering, Kubernetes, Go
- KubeArmor contributions — proves: eBPF, runtime security, Linux security
- Antrea contributions — proves: Kubernetes CNI, networking, Go
- devjaiswal.me — proves: full-stack TypeScript/React engineering

---

### Factor 7: Contact Accessibility (0-10)

| Score | Criteria |
|---|---|
| 9-10 | Engineer or founder directly reachable via GitHub issues, CNCF Slack, or open-source community |
| 6-8 | Professional email findable via Hunter.io or directly on their GitHub profile |
| 3-5 | LinkedIn reachable but cold |
| 0-2 | Only recruiter contact available (ATS application required) |

---

### Factor 8: Network Bridge (0-10)

| Score | Criteria |
|---|---|
| 9-10 | Active GitHub interaction history (Dev has commented on their issue, they responded, etc.) |
| 6-8 | Common contributor network: they contribute to same CNCF projects as Dev |
| 3-5 | Mutual LinkedIn connection or indirect community connection |
| 1-2 | Weak indirect connection (e.g., they follow someone Dev knows) |
| 0 | Fully cold, no connection |

---

## Scoring Examples

### Example 1: Isovalent (Cilium maintainers)

**Quality Score:**
- Domain alignment: 15 (eBPF is their core product)
- OSS friendliness: 10 (Cilium is a major CNCF OSS project they maintain)
- Career leverage: 12 (growth startup, strong engineering team)
- Stage fit: 5 (acquired by Cisco, but engineering culture still startup-ish)
- **Quality Total: 42/50**

**Match Score:**
- OSS tech overlap: 18 (KubeArmor uses eBPF — direct overlap with Cilium's eBPF focus)
- Evidence asset: 9 (KubeArmor contributions directly prove eBPF capability)
- Contact accessibility: 8 (maintainers are active on GitHub and CNCF Slack)
- Network bridge: 6 (shared CNCF contributor network)
- **Match Total: 41/50**

**Total: 83 → Tier A**

---

### Example 2: Generic React SaaS Startup

**Quality Score:**
- Domain alignment: 3 (no K8s/security/eBPF focus)
- OSS friendliness: 2 (closed-source product)
- Career leverage: 6 (small startup, some leverage)
- Stage fit: 7 (seed stage)
- **Quality Total: 18/50**

**Match Score:**
- OSS tech overlap: 2 (React skills relevant but no OSS connection)
- Evidence asset: 5 (devjaiswal.me shows React capability)
- Contact accessibility: 5 (LinkedIn accessible)
- Network bridge: 0 (no connection)
- **Match Total: 12/50**

**Total: 30 → Tier C (skip)**
