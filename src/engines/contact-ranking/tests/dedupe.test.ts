// tests/dedupe.test.ts
// Deduplication, identity_uncertain, the GitHub scan adapter, and the
// compile-time compatibility guard with the Contact view Engines 2/4 consume.

import { describe, it, expect } from "vitest";
import { rankContacts } from "../rank";
import { fromGithubScan } from "../adapters";
import type { Contact as Engine5Contact, DiscoveryRequest } from "../types";
import type { Contact as Engine2Contact } from "../../scoring/types";
import { NOW, makeOpportunity, manual, scanContact } from "./helpers";

const opts = { now: NOW };

describe("dedupe", () => {
  it("merges the same person seen via name+company AND via github handle into one", () => {
    const req: DiscoveryRequest = {
      opportunity: makeOpportunity(),
      githubScan: [scanContact({ name: "Jane Doe", github_username: "janedoe", email: "jane@acme.com", company: "Acme" })],
      manual: [manual("Jane Doe", "Security Engineer", { github: "janedoe", company: "Acme" })],
    };
    const result = rankContacts(req, opts);
    expect(result.ordered.length).toBe(1);
    // merged contact keeps the strongest signals (email from the scan).
    expect(result.ordered[0].channels.email).toBe("jane@acme.com");
  });

  it("merges across sources on a shared github handle even if titles differ", () => {
    const req: DiscoveryRequest = {
      opportunity: makeOpportunity(),
      manual: [
        manual("J. Doe", "Engineer", { github: "https://github.com/janedoe" }),
        manual("Jane Doe", "Security Engineer", { github: "janedoe" }),
      ],
    };
    expect(rankContacts(req, opts).ordered.length).toBe(1);
  });
});

describe("identity_uncertain", () => {
  it("same first name + company + different github → not merged, both flagged", () => {
    const req: DiscoveryRequest = {
      opportunity: makeOpportunity(),
      manual: [
        manual("Jane Smith", "Security Engineer", { github: "janesmith" }),
        manual("Jane Doe", "Security Engineer", { github: "janedoe" }),
      ],
    };
    const result = rankContacts(req, opts);
    expect(result.ordered.length).toBe(2);
    expect(result.ordered.every((c) => c.identity_uncertain)).toBe(true);
  });

  it("distinct first names are not flagged", () => {
    const req: DiscoveryRequest = {
      opportunity: makeOpportunity(),
      manual: [
        manual("Alice Smith", "Security Engineer", { github: "alice" }),
        manual("Bob Jones", "Security Engineer", { github: "bob" }),
      ],
    };
    const result = rankContacts(req, opts);
    expect(result.ordered.every((c) => c.identity_uncertain === false)).toBe(true);
  });
});

describe("github scan adapter", () => {
  it("maps scan output to a candidate correctly", () => {
    const c = fromGithubScan(
      scanContact({
        name: "Pat Maintainer",
        github_username: "patm",
        email: "pat@x.com",
        blog: "https://pat.dev",
        twitter: "https://twitter.com/patm",
        followers: 250,
        airtable_title: "Maintainer",
        airtable_oss_overlap: "KubeArmor — eBPF",
        airtable_relationship: "Warm",
        source_repo: "kubearmor/KubeArmor",
      })
    );
    expect(c.name).toBe("Pat Maintainer");
    expect(c.title).toBe("Maintainer");
    expect(c.channels.github).toBe("patm");
    expect(c.channels.email).toBe("pat@x.com");
    expect(c.blog).toBe("https://pat.dev");
    expect(c.followers).toBe(250);
    expect(c.oss_overlap).toBe("KubeArmor — eBPF");
    expect(c.relationship).toBe("Warm");
    expect(c.source).toBe("github:kubearmor/KubeArmor");
  });

  it("converts empty scan strings to null channels", () => {
    const c = fromGithubScan(scanContact({ email: "", twitter: "", blog: "" }));
    expect(c.channels.email).toBeNull();
    expect(c.twitter).toBeNull();
    expect(c.blog).toBeNull();
  });

  it("flows through rankContacts into a Contact", () => {
    const result = rankContacts(
      { opportunity: makeOpportunity(), githubScan: [scanContact({ email: "s@acme.com" })] },
      opts
    );
    expect(result.ordered.length).toBe(1);
    const contact = result.ordered[0];
    expect(contact.title).toBe("Security Engineer");
    expect(contact.channels.github).toBe("scanperson");
    expect(contact.relationship).toBe("Cold");
    expect(contact.primary).toBe(true);
  });
});

describe("type compatibility with Engines 2/4", () => {
  it("Engine 5 Contact is assignable to the Contact view Engines 2/4 consume", () => {
    // Compile-time guarantee: only type-checks if E5 Contact ⊇ E2 Contact.
    const assignToEngine2 = (c: Engine5Contact): Engine2Contact => c;
    const sample = rankContacts(
      { opportunity: makeOpportunity(), manual: [manual("A B", "Security Engineer", { email: "a@b.com" })] },
      opts
    ).ordered[0];
    const asE2 = assignToEngine2(sample);
    expect(typeof asE2.reachability).toBe("number");
    expect(asE2.relationship).toBe("Cold");
  });
});
