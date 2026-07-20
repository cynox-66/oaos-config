// github-contributor-scan.ts
// File: scripts/github-contributor-scan.ts
// Purpose: Scan GitHub repositories for contributors and extract contact info
// for importing into Airtable Contacts table
//
// Usage:
//   npx tsx scripts/github-contributor-scan.ts --repo krkn-chaos/krkn --min-contributions 3
//   npx tsx scripts/github-contributor-scan.ts --repo kubearmor/KubeArmor --min-contributions 5
//   npx tsx scripts/github-contributor-scan.ts --repo antrea-io/antrea --min-contributions 5
//
// Output:
//   JSON file in scripts/output/ ready for Airtable import
//
// Setup:
//   npm init -y
//   npm install @octokit/rest tsx dotenv
//   Add GITHUB_TOKEN to .env

import { Octokit } from "@octokit/rest";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

// ============================================================
// Types
// ============================================================

interface Contact {
  name: string;
  github_username: string;
  github_url: string;
  company: string;
  bio: string;
  email: string;
  location: string;
  blog: string;
  contributions: number;
  source_repo: string;
  twitter: string;
  followers: number;
  // Airtable-ready fields
  airtable_title: string;
  airtable_relationship: string;
  airtable_oss_overlap: string;
  airtable_reachability: number;
}

interface ScanResult {
  repo: string;
  scanned_at: string;
  total_contributors_found: number;
  contacts: Contact[];
  skipped: { username: string; reason: string }[];
}

// ============================================================
// Configuration
// ============================================================

const RATE_LIMIT_DELAY_MS = 1200; // 1.2 seconds between user lookups
const BOT_KEYWORDS = ["bot", "ci", "github-actions", "dependabot", "renovate"];

// Keywords that suggest a contributor is at a company (not a student project)
const PROFESSIONAL_INDICATORS = [
  "engineer",
  "developer",
  "architect",
  "sre",
  "devops",
  "platform",
  "infrastructure",
  "security",
  "software",
  "staff",
  "senior",
  "principal",
  "cto",
  "founder",
];

// ============================================================
// Helpers
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBot(username: string, type: string): boolean {
  if (type !== "User") return true;
  return BOT_KEYWORDS.some((kw) => username.toLowerCase().includes(kw));
}

// Spec (engine-specs.md §5): 1 base +2 email +1 twitter/blog +1 followers>100,
// capped 5. A direct channel (GitHub/Slack where they're active) counts as
// email-equivalent, so `activeDirectChannel` earns the same +2 as a public
// email. twitter/blog is a single +1 signal category (not +1 each).
export function calculateReachability(
  user: {
    email: string | null;
    blog: string | null;
    twitter_username: string | null;
    public_repos: number;
    followers: number;
  },
  activeDirectChannel = false
): number {
  let score = 1;
  if (user.email || activeDirectChannel) score += 2;
  if (user.twitter_username || user.blog) score += 1;
  if (user.followers > 100) score += 1;
  return Math.min(score, 5);
}

function inferOssOverlap(repo: string, bio: string, company: string): string {
  const repoName = repo.toLowerCase();
  const combined = `${bio} ${company}`.toLowerCase();

  if (repoName.includes("krkn")) {
    return "Krkn Chaos contributor — chaos engineering, Kubernetes resilience";
  }
  if (repoName.includes("kubearmor")) {
    return "KubeArmor contributor — eBPF security, runtime policy enforcement";
  }
  if (repoName.includes("antrea")) {
    return "Antrea contributor — Kubernetes CNI, network policy";
  }

  // Infer from bio/company
  const overlaps: string[] = [];
  if (combined.includes("ebpf")) overlaps.push("eBPF");
  if (combined.includes("kubernetes") || combined.includes("k8s"))
    overlaps.push("Kubernetes");
  if (combined.includes("security")) overlaps.push("security");
  if (combined.includes("chaos")) overlaps.push("chaos engineering");
  if (combined.includes("cncf")) overlaps.push("CNCF ecosystem");

  return overlaps.length > 0
    ? `Works with: ${overlaps.join(", ")}`
    : "Contributor to same OSS ecosystem";
}

function inferTitle(bio: string): string {
  if (!bio) return "Engineer";
  const lower = bio.toLowerCase();
  if (lower.includes("founder") || lower.includes("ceo")) return "Founder/CEO";
  if (lower.includes("cto")) return "CTO";
  if (lower.includes("staff")) return "Staff Engineer";
  if (lower.includes("principal")) return "Principal Engineer";
  if (lower.includes("senior") || lower.includes("sr.")) return "Senior Engineer";
  if (lower.includes("sre")) return "SRE";
  if (lower.includes("platform")) return "Platform Engineer";
  if (lower.includes("security")) return "Security Engineer";
  if (lower.includes("devops")) return "DevOps Engineer";
  if (lower.includes("maintainer")) return "Maintainer";
  return "Engineer";
}

// ============================================================
// Main Scanner
// ============================================================

async function scanRepo(
  owner: string,
  repo: string,
  minContributions: number
): Promise<ScanResult> {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  console.log(`\nScanning ${owner}/${repo} (min ${minContributions} contributions)...`);

  const contacts: Contact[] = [];
  const skipped: { username: string; reason: string }[] = [];

  // Fetch all contributors
  const contributors = await octokit.paginate(
    octokit.repos.listContributors,
    { owner, repo, per_page: 100 },
    (response) => response.data
  );

  console.log(`Found ${contributors.length} total contributors`);

  for (const contributor of contributors) {
    const username = contributor.login;
    const contributions = contributor.contributions || 0;
    const type = contributor.type || "User";

    // Skip bots
    if (isBot(username!, type)) {
      skipped.push({ username: username!, reason: "bot" });
      continue;
    }

    // Skip below threshold
    if (contributions < minContributions) {
      skipped.push({
        username: username!,
        reason: `below threshold (${contributions} < ${minContributions})`,
      });
      continue;
    }

    // Rate limit: wait between requests
    await sleep(RATE_LIMIT_DELAY_MS);

    try {
      const { data: user } = await octokit.users.getByUsername({
        username: username!,
      });

      // Every scanned user is an active contributor on this repo, so GitHub is
      // an active direct channel (email-equivalent per spec §5).
      const reachability = calculateReachability(user, true);
      const ossOverlap = inferOssOverlap(
        `${owner}/${repo}`,
        user.bio || "",
        user.company || ""
      );
      const title = inferTitle(user.bio || "");

      const contact: Contact = {
        name: user.name || user.login,
        github_username: user.login,
        github_url: `https://github.com/${user.login}`,
        company: (user.company || "").replace(/^@/, "").trim(),
        bio: user.bio || "",
        email: user.email || "",
        location: user.location || "",
        blog: user.blog || "",
        twitter: user.twitter_username
          ? `https://twitter.com/${user.twitter_username}`
          : "",
        contributions,
        source_repo: `${owner}/${repo}`,
        followers: user.followers,
        // Airtable-ready
        airtable_title: title,
        airtable_relationship: "Cold",
        airtable_oss_overlap: ossOverlap,
        airtable_reachability: reachability,
      };

      contacts.push(contact);
      console.log(
        `  ✓ ${contact.name} (${contact.company || "independent"}) — ${contributions} contributions — reachability: ${reachability}/5`
      );
    } catch (error) {
      console.error(`  ✗ Failed to fetch user ${username}: ${error}`);
      skipped.push({ username: username!, reason: "API error" });
    }
  }

  // Sort by contributions descending
  contacts.sort((a, b) => b.contributions - a.contributions);

  return {
    repo: `${owner}/${repo}`,
    scanned_at: new Date().toISOString(),
    total_contributors_found: contacts.length,
    contacts,
    skipped,
  };
}

// ============================================================
// Airtable Import Format
// ============================================================

function toAirtableFormat(contacts: Contact[]): object[] {
  return contacts.map((c) => ({
    Name: c.name,
    Title: c.airtable_title,
    "GitHub URL": c.github_url,
    Email: c.email,
    Relationship: c.airtable_relationship,
    "OSS Overlap": c.airtable_oss_overlap,
    Reachability: c.airtable_reachability,
    Notes: [
      c.bio ? `Bio: ${c.bio}` : "",
      c.company ? `Company: ${c.company}` : "",
      c.location ? `Location: ${c.location}` : "",
      c.blog ? `Blog: ${c.blog}` : "",
      c.twitter ? `Twitter: ${c.twitter}` : "",
      `Contributions to ${c.source_repo}: ${c.contributions}`,
      `Followers: ${c.followers}`,
    ]
      .filter(Boolean)
      .join("\n"),
  }));
}

// ============================================================
// CLI Entry Point
// ============================================================

async function main() {
  const args = process.argv.slice(2);

  // Parse args
  const repoIndex = args.indexOf("--repo");
  const minIndex = args.indexOf("--min-contributions");

  if (repoIndex === -1) {
    console.error("Usage: npx tsx github-contributor-scan.ts --repo owner/repo --min-contributions N");
    console.error("Example: npx tsx github-contributor-scan.ts --repo krkn-chaos/krkn --min-contributions 3");
    process.exit(1);
  }

  const repoArg = args[repoIndex + 1];
  const minContributions = minIndex !== -1 ? parseInt(args[minIndex + 1]) : 3;

  if (!repoArg || !repoArg.includes("/")) {
    console.error("Repository must be in format: owner/repo");
    process.exit(1);
  }

  const [owner, repo] = repoArg.split("/");

  if (!process.env.GITHUB_TOKEN) {
    console.error("GITHUB_TOKEN not found in .env");
    console.error("Get a token from: https://github.com/settings/tokens");
    console.error("Required scopes: read:user, public_repo");
    process.exit(1);
  }

  // Create output directory
  const outputDir = path.join(path.dirname(__filename), "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Run scan
  const result = await scanRepo(owner, repo, minContributions);

  // Write full results
  const outputFile = path.join(
    outputDir,
    `${owner}-${repo}-${Date.now()}.json`
  );
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  console.log(`\nFull results written to: ${outputFile}`);

  // Write Airtable import format
  const airtableFile = path.join(
    outputDir,
    `${owner}-${repo}-airtable-${Date.now()}.json`
  );
  const airtableData = toAirtableFormat(result.contacts);
  fs.writeFileSync(airtableFile, JSON.stringify(airtableData, null, 2));
  console.log(`Airtable import format written to: ${airtableFile}`);

  // Summary
  console.log(`\n========================================`);
  console.log(`SCAN COMPLETE: ${owner}/${repo}`);
  console.log(`========================================`);
  console.log(`Contacts found: ${result.total_contributors_found}`);
  console.log(`Skipped: ${result.skipped.length}`);
  console.log(
    `High reachability (4-5): ${result.contacts.filter((c) => c.airtable_reachability >= 4).length}`
  );
  console.log(
    `Have email: ${result.contacts.filter((c) => c.email).length}`
  );
  console.log(`\nTop 10 contacts by contributions:`);
  result.contacts.slice(0, 10).forEach((c, i) => {
    console.log(
      `  ${i + 1}. ${c.name} (${c.company || "independent"}) — ${c.contributions} contributions`
    );
  });
}

// Only run as a CLI when executed directly (not when imported, e.g. by tests).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
