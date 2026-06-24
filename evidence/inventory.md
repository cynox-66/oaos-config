# Evidence Inventory (C4 source of truth)

This file is the canonical inventory of the operator's evidence assets. It is
human-editable: keep the prose notes you like, but the **single fenced `json`
block below is the machine-readable source** consumed by the Evidence Matching
Engine (Engine 3). To add an asset, append an object to the array following the
`Evidence` schema:

```
id              string   stable slug, unique
title           string   human title
type            enum     PR | Article | RFC | Project | Talk | Freelance | Client
url             string   link to the asset
tech_tags       string[] technology tags (align casing with the domain vocab where they overlap)
domains         string[] controlled-vocab domain labels
relevance_blurb string   one line: what this asset proves
recency_date    string   ISO date (YYYY-MM-DD) the work was done/published
strength        number   1..5 subjective strength
```

Engine 3 reads only the `json` block (via `parseInventory`); the rest of this
file is documentation.

```json
[
  {
    "id": "kubestellar-ui-pr",
    "title": "KubeStellar UI XL PR",
    "type": "PR",
    "url": "https://github.com/kubestellar/ui/pull/1",
    "tech_tags": ["TypeScript", "React", "Web/Frontend", "Kubernetes", "CNCF"],
    "domains": ["Web/Frontend", "Kubernetes", "Cloud-Native"],
    "relevance_blurb": "Large-scale frontend contribution to a CNCF Kubernetes project, proving React and TypeScript engineering at scale.",
    "recency_date": "2025-02-15",
    "strength": 4
  },
  {
    "id": "oid4vp-rfc",
    "title": "OID4VP RFC Authorship",
    "type": "RFC",
    "url": "https://example.org/oid4vp-rfc",
    "tech_tags": ["Security", "Protocol Design", "Standards", "Identity"],
    "domains": ["Security"],
    "relevance_blurb": "Authored a standards-track protocol design RFC, proving security awareness and standards work.",
    "recency_date": "2024-09-01",
    "strength": 4
  },
  {
    "id": "krkn-chaos",
    "title": "Krkn Chaos contributions",
    "type": "PR",
    "url": "https://github.com/krkn-chaos/krkn/pulls?q=author",
    "tech_tags": ["Chaos-Engineering", "Kubernetes", "Go", "Resilience"],
    "domains": ["Chaos-Engineering", "Kubernetes"],
    "relevance_blurb": "Chaos engineering contributions in Go to Krkn, proving Kubernetes resilience testing capability.",
    "recency_date": "2025-05-01",
    "strength": 5
  },
  {
    "id": "kubearmor",
    "title": "KubeArmor contributions",
    "type": "PR",
    "url": "https://github.com/kubearmor/KubeArmor/pulls?q=author",
    "tech_tags": ["eBPF", "Security", "Linux", "Runtime Security", "Kubernetes"],
    "domains": ["eBPF", "Security", "Kubernetes"],
    "relevance_blurb": "KubeArmor contributions proving eBPF and Linux runtime security capability.",
    "recency_date": "2025-04-10",
    "strength": 5
  },
  {
    "id": "antrea",
    "title": "Antrea contributions",
    "type": "PR",
    "url": "https://github.com/antrea-io/antrea/pulls?q=author",
    "tech_tags": ["Kubernetes", "Networking", "CNI", "Go"],
    "domains": ["Networking", "Kubernetes"],
    "relevance_blurb": "Antrea contributions proving Kubernetes CNI and networking capability in Go.",
    "recency_date": "2025-01-20",
    "strength": 4
  },
  {
    "id": "devjaiswal-me",
    "title": "devjaiswal.me",
    "type": "Project",
    "url": "https://devjaiswal.me",
    "tech_tags": ["TypeScript", "React", "Web/Frontend", "Backend", "Node.js"],
    "domains": ["Web/Frontend", "Backend"],
    "relevance_blurb": "Personal portfolio proving full-stack TypeScript and React engineering.",
    "recency_date": "2025-06-01",
    "strength": 3
  }
]
```
