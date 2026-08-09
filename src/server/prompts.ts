import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "dor-checklist",
    {
      description: "Definition of Ready checklist for a user story",
      argsSchema: { story_title: z.string().describe("Title or key of the user story") },
    },
    ({ story_title }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Review story "${story_title}" against DoR. For each item, state PASS/FAIL with evidence from context_search.

1. Acceptance criteria defined and testable
2. Dependencies identified
3. Story estimated
4. Technical approach documented in context repo
5. Security/compliance requirements identified
6. Test strategy defined
7. NFRs specified`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "dora-metrics",
    {
      description: "DORA metrics analysis for a given period",
      argsSchema: {
        period: z.string().default("last sprint").describe("Time period"),
      },
    },
    ({ period }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Analyze DORA metrics for: ${period}

Search context repo for deployment logs, incidents, pipeline data. Report:
1. Deployment Frequency
2. Lead Time for Changes
3. Change Failure Rate
4. MTTR

Benchmarks (Elite): DF=on-demand, LT<1hr, CFR<5%, MTTR<1hr.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "ecodesign-review",
    {
      description: "Ecodesign review of a component",
      argsSchema: {
        component: z.string().describe("Component or feature to review"),
      },
    },
    ({ component }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Ecodesign review: ${component}

Evaluate:
1. Resource efficiency (CPU, memory, network)
2. Data minimization
3. Cache effectiveness
4. Transfer optimization (payload size, compression)
5. Lifecycle (clean shutdown, no leaks)

Reference context repo for existing guidelines.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "incident-context",
    {
      description: "Gather context repo history for incident resolution",
      argsSchema: {
        incident_description: z.string().describe("Incident description"),
      },
    },
    ({ incident_description }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Incident: ${incident_description}

Search context repo for:
1. Similar past incidents
2. Relevant architectural decisions
3. Recent changes (deploys, config, deps)
4. Runbooks

Cite memory file paths. Prioritize actionable steps.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "session-handoff",
    {
      description: "Package session context for handoff to another agent or person",
      argsSchema: {
        target: z.string().describe("Recipient (name or agent ID)"),
        focus_areas: z.string().optional().describe("Areas to emphasize"),
      },
    },
    ({ target, focus_areas }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Handoff for: ${target}${focus_areas ? `\nFocus: ${focus_areas}` : ""}

Compile from context repo:
1. Current state and blockers
2. Key decisions with rationale
3. Open questions
4. Priority context files

Write to reference/handoffs/<date>-${target}.md.`,
          },
        },
      ],
    }),
  );
}
