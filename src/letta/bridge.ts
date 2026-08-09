import type { Letta } from "@letta-ai/letta-client";
import type { MemFSEngine } from "../memfs/engine.js";
import type { SyncResult } from "./types.js";
import matter from "gray-matter";

/**
 * Bidirectional bridge between the Git-backed context repo (MemFS)
 * and Letta's stateful core memory blocks.
 *
 * - syncToLetta: pushes pinned system/ files into Letta agent memory blocks
 * - snapshotToGit: pulls Letta block state and commits it as YAML
 */
export class LettaMemoryBridge {
  constructor(
    private readonly client: Letta,
    private readonly memfs: MemFSEngine,
  ) {}

  /**
   * Push the pinned context (system/ files) into a Letta agent's core memory.
   * Each pinned file becomes a block labeled by its filename stem.
   */
  async syncToLetta(agentId: string): Promise<SyncResult> {
    const snapshot = await this.memfs.getContextSnapshot();
    let blocksUpdated = 0;

    const existingBlocks = await this.client.agents.blocks.list(agentId);
    const blockLabels = new Set<string>();
    for await (const block of existingBlocks) {
      if (block.label) blockLabels.add(block.label);
    }

    for (const path of snapshot.tree.pinned) {
      const file = await this.memfs.readFile(path);
      const label = path.replace(/^system\//, "").replace(/\.md$/, "");
      const value = file.content.slice(0, 5000); // Letta block size limit

      if (blockLabels.has(label)) {
        await this.client.agents.blocks.update(label, {
          agent_id: agentId,
          value,
        });
      } else {
        const block = await this.client.blocks.create({
          label,
          value,
        });
        await this.client.agents.blocks.attach(block.id!, {
          agent_id: agentId,
        });
      }
      blocksUpdated++;
    }

    return {
      direction: "to-letta",
      blocksUpdated,
      filesCommitted: 0,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Pull Letta agent memory blocks and commit them to the context repo
   * under state/letta/ as YAML-frontmatter markdown files.
   */
  async snapshotToGit(
    agentId: string,
    commitMessage?: string,
  ): Promise<SyncResult> {
    const blocks = this.client.agents.blocks.list(agentId);
    let filesCommitted = 0;

    for await (const block of blocks) {
      const label = block.label ?? block.id ?? "unknown";
      const path = `state/letta/${label}.md`;

      await this.memfs.writeFile(path, block.value ?? "", {
        description: `Letta memory block: ${label}`,
        tags: ["letta", "memory-block"],
        created: block.created_by_id ? undefined : new Date().toISOString(),
        updated: new Date().toISOString(),
      });
      filesCommitted++;
    }

    return {
      direction: "to-git",
      blocksUpdated: 0,
      filesCommitted,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Send a message to a Letta agent and return the response text.
   */
  async sendMessage(agentId: string, text: string): Promise<string> {
    const response = await this.client.agents.messages.create(agentId, {
      messages: [{ role: "user", content: text }],
    });

    const parts: string[] = [];
    for (const msg of response.messages) {
      if ("content" in msg && typeof msg.content === "string") {
        parts.push(msg.content);
      }
    }

    return parts.join("\n") || "(no response)";
  }

  /**
   * List all agents visible to the configured Letta account.
   */
  async listAgents(): Promise<Array<{ id: string; name: string }>> {
    const agents = this.client.agents.list();
    const result: Array<{ id: string; name: string }> = [];
    for await (const agent of agents) {
      result.push({
        id: agent.id ?? "",
        name: agent.name ?? "(unnamed)",
      });
    }
    return result;
  }
}
