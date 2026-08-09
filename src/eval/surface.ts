/**
 * Typed accessors over Maryn's MCP tools. Tasks read through these so that an
 * assertion reads as a statement about memory, not about JSON plumbing.
 */

import { check } from "./expect.js";
import type { MarynSession, ToolReply } from "./session.js";

export interface MemoryFileView {
  path: string;
  frontmatter: Record<string, unknown>;
  content: string;
  data?: Record<string, unknown>;
}

export interface TreeView {
  files: string[];
  pinned: string[];
  unpinned: string[];
}

export interface CommitView {
  hash: string;
  date: string;
  message: string;
  author: string;
}

export interface WriteRequest {
  path: string;
  content: string;
  description: string;
  tags?: string[];
  data?: Record<string, unknown>;
  write_key?: string;
}

function parse<T>(reply: ToolReply, tool: string): T {
  check(!reply.isError, `${tool} returned an error: ${reply.text}`);
  try {
    return JSON.parse(reply.text) as T;
  } catch {
    throw new Error(`${tool} returned content that is not JSON: ${reply.text.slice(0, 120)}`);
  }
}

export async function readMemory(session: MarynSession, path: string): Promise<MemoryFileView> {
  return parse<MemoryFileView>(await session.call("context_read", { path }), "context_read");
}

export async function readTree(session: MarynSession): Promise<TreeView> {
  return parse<TreeView>(await session.call("context_tree"), "context_tree");
}

export async function readLog(session: MarynSession, count = 50): Promise<CommitView[]> {
  const reply = await session.call("context_log", { count });
  check(!reply.isError, `context_log returned an error: ${reply.text}`);
  if (reply.text.startsWith("No commits")) return [];
  return JSON.parse(reply.text) as CommitView[];
}

export async function readSnapshot(session: MarynSession): Promise<string> {
  const reply = await session.call("context_snapshot");
  check(!reply.isError, `context_snapshot returned an error: ${reply.text}`);
  return reply.text;
}

export async function listDir(session: MarynSession, path: string): Promise<string[]> {
  const reply = await session.call("context_list_dir", { path });
  check(!reply.isError, `context_list_dir returned an error: ${reply.text}`);
  if (reply.text === "(empty)") return [];
  return reply.text.split("\n").filter(Boolean);
}

/** Raw search reply, kept unparsed for tasks that assert on the empty form. */
export async function search(session: MarynSession, query: string): Promise<ToolReply> {
  return session.call("context_search", { query });
}

export async function searchPaths(session: MarynSession, query: string): Promise<string[]> {
  const reply = await search(session, query);
  check(!reply.isError, `context_search returned an error: ${reply.text}`);
  if (reply.text.startsWith("No results")) return [];
  const hits = JSON.parse(reply.text) as Array<{ path: string }>;
  return hits.map((hit) => hit.path);
}

export async function writeMemory(
  session: MarynSession,
  request: WriteRequest,
): Promise<ToolReply> {
  return session.call("context_write", { ...request });
}
