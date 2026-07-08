// tests/parse.test.ts
// Unit tests for Stage 2 alert parsing: per-source multi-listing extraction,
// source detection, graceful handling of malformed input, and the seam into
// Engine 1 (normalize). All pure — no network, no LLM, no mocks.

import { describe, it, expect } from "vitest";
import {
  detectSource,
  parseAlertEmail,
  parseLinkedInAlert,
  parseIndeedAlert,
  parseWellfoundAlert,
  parseWeWorkRemotelyAlert,
  parseUpworkAlert,
  parseRemoteOkAlert,
} from "../index";
import type { AlertSource } from "../index";
import { normalize } from "../../../engines/normalization";

const DATE = "Tue, 08 Jul 2026 09:00:00 +0000";

// ============================================================
// Fixtures — hand-written, representative of each product's format
// ============================================================

const LINKEDIN = `From: LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>
Subject: 3 new jobs for "backend engineer"
Date: ${DATE}

<html><body><table>
<tr><td>
  <a href="https://www.linkedin.com/comm/jobs/view/3901234567">Senior Backend Engineer</a>
  <p>Acme Corp · San Francisco, CA (Remote)</p>
  <p>$160,000 - $190,000</p>
</td></tr>
<tr><td>
  <a href="https://www.linkedin.com/comm/jobs/view/3907654321">Platform Engineer</a>
  <p>Globex · Bengaluru, India</p>
</td></tr>
</table></body></html>`;

const INDEED = `From: Indeed <alert@indeed.com>
Subject: New jobs for data analyst
Date: ${DATE}

<div>
  <a href="https://www.indeed.com/rc/clk?jk=abc123">Data Analyst</a>
  <div>DataViz Inc</div>
  <div>New York, NY</div>
  <div>$95,000 - $115,000 a year</div>
</div>
<div>
  <a href="https://www.indeed.com/rc/clk?jk=def456">Business Analyst</a>
  <div>Insight LLC</div>
  <div>Remote</div>
</div>`;

const WELLFOUND = `From: Wellfound <team@hi.wellfound.com>
Subject: New startup jobs for you
Date: ${DATE}

<a href="https://wellfound.com/jobs/123456-senior-frontend-engineer">Senior Frontend Engineer</a>
<div>Rocket Labs</div>
<div>Remote (US)</div>
<div>$130k – $170k · 0.1% – 0.5%</div>
<a href="https://wellfound.com/jobs/987654-growth-marketer">Growth Marketer</a>
<div>Nimbus AI</div>
<div>New York</div>`;

const WEWORKREMOTELY = `From: We Work Remotely <hello@weworkremotely.com>
Subject: Your remote jobs digest
Date: ${DATE}

<a href="https://weworkremotely.com/remote-jobs/acme-senior-rails-developer">Senior Rails Developer</a>
<div>Acme Software</div>
<div>Anywhere in the World</div>
<a href="https://weworkremotely.com/remote-jobs/globex-devops-engineer">DevOps Engineer</a>
<div>Globex</div>
<div>USA Only</div>`;

const UPWORK = `From: Upwork <do-not-reply@upwork.com>
Subject: New jobs from your saved search
Date: ${DATE}

<a href="https://www.upwork.com/jobs/~01abc">Build a React dashboard</a>
<div>Hourly: $30 - $50</div>
<div>Client: Bright Agency (United States)</div>
<div>Looking for a React dev to build an analytics dashboard.</div>
<a href="https://www.upwork.com/jobs/~02def">Node.js API developer</a>
<div>Fixed-Price: $1,500</div>
<div>Client: DataWorks (Canada)</div>
<div>Need a REST API built with Node and Postgres.</div>`;

const REMOTEOK = `From: Remote OK <Nick@remoteok.com>
Subject: New remote jobs this week
Date: ${DATE}

<a href="https://remoteok.com/remote-jobs/123-senior-rust-engineer-fintech-co">Senior Rust Engineer</a>
<div>Fintech Co</div>
<div>💰 $120k - $160k</div>
<div>🌏 Worldwide</div>
<a href="https://remoteok.com/remote-jobs/456-golang-developer-cloudscale">Golang Developer</a>
<div>CloudScale</div>
<div>🌏 Europe</div>`;

// ============================================================
// Per-parser extraction
// ============================================================

const CASES: {
  name: AlertSource;
  email: string;
  parse: (s: string) => ReturnType<typeof parseLinkedInAlert>;
  expectedCount: number;
  firstCompany: string;
  firstRole: string;
}[] = [
  { name: "linkedin", email: LINKEDIN, parse: parseLinkedInAlert, expectedCount: 2, firstCompany: "Acme Corp", firstRole: "Senior Backend Engineer" },
  { name: "indeed", email: INDEED, parse: parseIndeedAlert, expectedCount: 2, firstCompany: "DataViz Inc", firstRole: "Data Analyst" },
  { name: "wellfound", email: WELLFOUND, parse: parseWellfoundAlert, expectedCount: 2, firstCompany: "Rocket Labs", firstRole: "Senior Frontend Engineer" },
  { name: "weworkremotely", email: WEWORKREMOTELY, parse: parseWeWorkRemotelyAlert, expectedCount: 2, firstCompany: "Acme Software", firstRole: "Senior Rails Developer" },
  { name: "upwork", email: UPWORK, parse: parseUpworkAlert, expectedCount: 2, firstCompany: "Bright Agency", firstRole: "Build a React dashboard" },
  { name: "remoteok", email: REMOTEOK, parse: parseRemoteOkAlert, expectedCount: 2, firstCompany: "Fintech Co", firstRole: "Senior Rust Engineer" },
];

describe.each(CASES)("$name parser", ({ email, parse, expectedCount, firstCompany, firstRole }) => {
  it("extracts the correct number of listings from a multi-listing alert", () => {
    expect(parse(email)).toHaveLength(expectedCount);
  });

  it("populates company / role / url on every listing", () => {
    for (const item of parse(email)) {
      const payload = item.raw_payload as Record<string, unknown>;
      expect(payload.company, "company").toBeTruthy();
      expect(payload.role, "role").toBeTruthy();
      expect(item.url, "url").toBeTruthy();
    }
  });

  it("extracts the expected first company and role", () => {
    const first = parse(email)[0];
    const payload = first.raw_payload as Record<string, unknown>;
    expect(payload.company).toBe(firstCompany);
    expect(payload.role).toBe(firstRole);
  });

  it("does not throw on malformed input and returns [] when there are no job links", () => {
    const junk = "From: someone\n\n<p>hello, this email has no job listings at all</p>";
    expect(() => parse(junk)).not.toThrow();
    expect(parse(junk)).toEqual([]);
  });

  it("tolerates a listing with a job link but no following fields (partial data, no throw)", () => {
    // A bare job anchor with no company/location lines — parser keeps role+url.
    const header = email.slice(0, email.indexOf("\n\n"));
    const link = email.match(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/)!;
    const bare = `${header}\n\n<a href="${link[1]}">${link[2]}</a>`;
    const out = parse(bare);
    expect(() => parse(bare)).not.toThrow();
    expect(out).toHaveLength(1);
    expect(out[0].url).toBeTruthy();
    expect((out[0].raw_payload as Record<string, unknown>).role).toBeTruthy();
  });
});

// ============================================================
// Source detection
// ============================================================

describe("detectSource", () => {
  it.each(CASES)("selects the $name parser for the $name format", ({ name, email }) => {
    expect(detectSource(email)).toBe(name);
  });

  it("returns null for an unrecognized sender / format", () => {
    const unknown = `From: Random Newsletter <news@somerandomsite.example>
Subject: Weekly roundup
Date: ${DATE}

<p>Nothing job-related here.</p>`;
    expect(detectSource(unknown)).toBeNull();
  });

  it("assigns freelance source_type only to Upwork", () => {
    expect(parseUpworkAlert(UPWORK)[0].source_type).toBe("freelance");
    expect(parseLinkedInAlert(LINKEDIN)[0].source_type).toBe("job_board");
  });
});

// ============================================================
// Dispatcher
// ============================================================

describe("parseAlertEmail", () => {
  it("detects and parses in one call", () => {
    expect(parseAlertEmail(INDEED)).toHaveLength(2);
  });

  it("returns [] (no crash) for an unknown source", () => {
    expect(parseAlertEmail("From: nobody@nowhere.example\n\n<p>x</p>")).toEqual([]);
  });
});

// ============================================================
// Seam into Engine 1 — parsed RawItems normalize into Opportunities
// ============================================================

describe("Stage 2 → Engine 1 flow", () => {
  it("a parsed RawItem normalizes into a canonical Opportunity", () => {
    const item = parseLinkedInAlert(LINKEDIN)[0];
    const opp = normalize(item);
    expect(opp.company).toBe("Acme Corp");
    expect(opp.role).toBe("Senior Backend Engineer");
    expect(opp.category).toBeTruthy(); // Engine 1 always assigns a category
    expect(opp.status).toBe("Discovered");
  });

  it("an Upwork RawItem normalizes to the Freelance category", () => {
    const item = parseUpworkAlert(UPWORK)[0];
    expect(normalize(item).category).toBe("Freelance");
  });
});
