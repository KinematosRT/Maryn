import type { JiraSyncConfig, SyncRunResult, SyncWrite } from "./types.js";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "entry";
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  updated: string;
  assignee?: string;
  url?: string;
}

export function buildJiraSyncWrites(
  issues: JiraIssue[],
  config: JiraSyncConfig,
  now = new Date(),
): SyncRunResult {
  const actor = config.actor || "jira-sync";
  const date = isoDate(now);
  const writes: SyncWrite[] = [];

  for (const issue of issues) {
    const summarySlug = slugify(issue.summary);
    const journalPath = `journal/${date}/${actor}/${issue.key}-${summarySlug}.md`;
    const featureKey = issue.key;
    const featurePath = `features/${featureKey}/status.md`;

    const journalContent = [
      `# Jira Sync — ${issue.key}`,
      "",
      `- Summary: ${issue.summary}`,
      `- Status: ${issue.status}`,
      `- Updated: ${issue.updated}`,
      `- Assignee: ${issue.assignee || "unassigned"}`,
      issue.url ? `- URL: ${issue.url}` : undefined,
    ]
      .filter(Boolean)
      .join("\n");

    const featureContent = [
      `# Feature ${featureKey}`,
      "",
      `## Current State`,
      `- Summary: ${issue.summary}`,
      `- Status: ${issue.status}`,
      `- Last synced: ${now.toISOString()}`,
      `- Source actor: ${actor}`,
      `- Assignee: ${issue.assignee || "unassigned"}`,
      issue.url ? `- Jira URL: ${issue.url}` : undefined,
    ]
      .filter(Boolean)
      .join("\n");

    writes.push({
      path: journalPath,
      content: journalContent,
      description: `Jira sync journal entry for ${issue.key}`,
      tags: ["sync", "jira", actor, "journal", issue.key.toLowerCase()],
    });

    writes.push({
      path: featurePath,
      content: featureContent,
      description: `Feature status for ${featureKey}`,
      tags: ["feature", "jira", actor, issue.key.toLowerCase()],
    });
  }

  return {
    actor,
    writes,
    cursor: now.toISOString(),
  };
}

