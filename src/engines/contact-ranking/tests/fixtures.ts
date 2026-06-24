// tests/fixtures.ts
// Hand-labeled primary-contact scenarios: each request has an expected primary
// contact name. Used to validate "primary is a sane first choice" (≥80%).

import type { DiscoveryRequest } from "../types";
import { makeOpportunity, manual } from "./helpers";

export interface PrimaryFixture {
  name: string;
  request: DiscoveryRequest;
  expectedPrimaryName: string;
}

const email = (e: string) => ({ email: e });

export const PRIMARY_FIXTURES: PrimaryFixture[] = [
  {
    name: "core-domain engineer beats unrelated",
    request: {
      opportunity: makeOpportunity(),
      manual: [
        manual("Sana Sec", "Security Engineer", email("sana@acme.com")),
        manual("Mark Mktg", "Marketing Manager", email("mark@acme.com")),
      ],
    },
    expectedPrimaryName: "Sana Sec",
  },
  {
    name: "maintainer beats recruiter",
    request: {
      opportunity: makeOpportunity(),
      manual: [
        manual("Kira Maint", "KubeArmor Maintainer", email("kira@acme.com")),
        manual("Rhea Rec", "Technical Recruiter", email("rhea@acme.com")),
      ],
    },
    expectedPrimaryName: "Kira Maint",
  },
  {
    name: "higher reachability + core domain wins",
    request: {
      opportunity: makeOpportunity(),
      manual: [
        manual("Seán Snr", "Senior Security Engineer", {
          email: "sean@acme.com",
          twitter: "https://twitter.com/sean",
          followers: 200,
        }),
        manual("Pavel Plat", "Platform Engineer", email("pavel@acme.com")),
      ],
    },
    expectedPrimaryName: "Seán Snr",
  },
  {
    name: "core-domain engineer outranks founder by relevance",
    request: {
      opportunity: makeOpportunity(),
      manual: [
        manual("Felix Found", "Founder", email("felix@acme.com")),
        manual("Sina Sec", "Security Engineer", email("sina@acme.com")),
      ],
    },
    expectedPrimaryName: "Sina Sec",
  },
  {
    name: "recruiter-only → recruiter is primary",
    request: {
      opportunity: makeOpportunity(),
      manual: [manual("Tara Talent", "Technical Recruiter", email("tara@acme.com"))],
    },
    expectedPrimaryName: "Tara Talent",
  },
  {
    name: "tie on relevance broken by reachability (email beats linkedin-only)",
    request: {
      opportunity: makeOpportunity(),
      manual: [
        manual("Alice Ng", "Security Engineer", { linkedin: "alice-ng" }),
        manual("Bob Lee", "Security Engineer", email("bob@acme.com")),
      ],
    },
    expectedPrimaryName: "Bob Lee",
  },
  {
    name: "frontend role for a frontend opportunity",
    request: {
      opportunity: makeOpportunity(["Web/Frontend"], "opp_fe"),
      manual: [
        manual("Fred Front", "Frontend Engineer", email("fred@acme.com")),
        manual("Beth Back", "Backend Engineer", email("beth@acme.com")),
      ],
    },
    expectedPrimaryName: "Fred Front",
  },
  {
    name: "seniority breaks a relevance+reachability tie (Staff > Mid)",
    request: {
      opportunity: makeOpportunity(),
      manual: [
        manual("Mia Mid", "Security Engineer", email("mia@acme.com")),
        manual("Stu Staff", "Staff Security Engineer", email("stu@acme.com")),
      ],
    },
    expectedPrimaryName: "Stu Staff",
  },
  {
    name: "eng manager outranks IC on a tie",
    request: {
      opportunity: makeOpportunity(),
      manual: [
        manual("Ian IC", "Security Engineer", email("ian@acme.com")),
        manual("Ema Mgr", "Engineering Manager, Security", email("ema@acme.com")),
      ],
    },
    expectedPrimaryName: "Ema Mgr",
  },
  {
    name: "chaos engineer for a chaos opportunity beats SRE",
    request: {
      opportunity: makeOpportunity(["Chaos-Engineering"], "opp_chaos"),
      manual: [
        manual("Cara Chaos", "Chaos Engineer", email("cara@acme.com")),
        manual("Sid SRE", "SRE", email("sid@acme.com")),
      ],
    },
    expectedPrimaryName: "Cara Chaos",
  },
];
