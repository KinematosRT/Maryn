/** MemFS types for git-backed context repository */

export interface MemoryFileFrontmatter {
  description: string;
  char_limit?: number;
  read_only?: boolean;
  tags?: string[];
  created?: string;
  updated?: string;
}

export interface MemoryFile {
  /** Relative path within the context repo, e.g. "system/architecture.yaml" */
  path: string;
  frontmatter: MemoryFileFrontmatter;
  content: string;
  /** Structured data from YAML files (non-frontmatter fields) */
  data?: Record<string, unknown>;
}

export interface MemoryTree {
  /** Flat list of all memory file paths */
  files: string[];
  /** Files pinned to context (inside system/) */
  pinned: string[];
  /** Files available but not pinned (outside system/) */
  unpinned: string[];
}

export interface ContextSnapshot {
  /** Combined content of all pinned files, ready for system prompt injection */
  systemContext: string;
  /** The full memory tree for navigation */
  tree: MemoryTree;
  /** Total character count of pinned context */
  pinnedChars: number;
}

export interface CommitInfo {
  hash: string;
  date: string;
  message: string;
  author: string;
}
