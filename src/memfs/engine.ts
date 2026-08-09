import { readFile, writeFile, mkdir, readdir, unlink, stat } from "node:fs/promises";
import { join, relative, dirname, extname, resolve, isAbsolute, normalize } from "node:path";
import { homedir, tmpdir } from "node:os";
import { createHash } from "node:crypto";
import matter from "gray-matter";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { simpleGit, type SimpleGit } from "simple-git";
import type {
  MemoryFile,
  MemoryFileFrontmatter,
  MemoryTree,
  ContextSnapshot,
  CommitInfo,
} from "./types.js";
import { scanContent } from "../sanitize/scanner.js";

export class SanitizerBlockError extends Error {
  constructor(details: string) {
    super(`Sanitizer blocked commit: ${details}`);
  }
}

const FRONTMATTER_KEYS = new Set([
  "description", "char_limit", "read_only", "tags", "created", "updated",
]);

const CONTEXT_EXTENSIONS = new Set([".md", ".yaml", ".yml"]);

const GIT_URL_RE = /^(https?:\/\/|git@|ssh:\/\/)/;

export class MemFSEngine {
  private root: string;
  private git!: SimpleGit;
  private remoteUrl: string | null = null;
  /** 10 MB cap to prevent memory exhaustion on reads */
  private static readonly MAX_FILE_BYTES = 10 * 1024 * 1024;

  constructor(repoPath: string) {
    if (GIT_URL_RE.test(repoPath)) {
      const hash = createHash("sha256")
        .update(repoPath)
        .digest("hex")
        .slice(0, 12);
      this.root = resolve(homedir(), ".maryn", "clones", hash);

      const token = process.env.GITLAB_TOKEN;
      if (token && repoPath.startsWith("https://")) {
        const url = new URL(repoPath);
        url.username = "maryn-bot";
        url.password = token;
        this.remoteUrl = url.toString();
      } else {
        this.remoteUrl = repoPath;
      }
    } else {
      this.root = resolve(repoPath);
    }
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });

    if (this.remoteUrl) {
      const git = simpleGit(this.root);
      const isRepo = await git.checkIsRepo().catch(() => false);
      if (!isRepo) {
        await simpleGit().clone(this.remoteUrl, this.root);
      } else {
        await git.pull().catch(() => {});
      }
    } else {
      const git = simpleGit(this.root);
      const isRepo = await git.checkIsRepo().catch(() => false);
      if (!isRepo) {
        await git.init();
      }
    }

    this.git = simpleGit(this.root);
  }

  private safePath(filePath: string): string {
    const normalized = normalize(filePath);
    const abs = resolve(this.root, normalized);
    const rel = relative(this.root, abs);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(`Path escapes context repo: ${filePath}`);
    }
    if (rel === "") {
      throw new Error(`Invalid path: ${filePath}`);
    }
    const segments = rel.split(/[\\/]/);
    if (segments.includes(".git")) {
      throw new Error(`Cannot access .git internals: ${filePath}`);
    }
    return abs;
  }

  async readFile(filePath: string): Promise<MemoryFile> {
    const abs = this.safePath(filePath);
    const info = await stat(abs);
    if (info.size > MemFSEngine.MAX_FILE_BYTES) {
      throw new Error(`File too large: ${info.size} bytes (limit ${MemFSEngine.MAX_FILE_BYTES})`);
    }
    const raw = await readFile(abs, "utf-8");
    const ext = extname(filePath).toLowerCase();

    if (ext === ".yaml" || ext === ".yml") {
      return this.parseYaml(filePath, raw);
    }

    const { data, content } = matter(raw);
    return {
      path: filePath,
      frontmatter: data as MemoryFileFrontmatter,
      content: content.trim(),
    };
  }

  private parseYaml(filePath: string, raw: string): MemoryFile {
    const doc = yamlParse(raw) ?? {};
    const frontmatter: MemoryFileFrontmatter = { description: "" };

    for (const key of FRONTMATTER_KEYS) {
      if (key in doc) {
        (frontmatter as unknown as Record<string, unknown>)[key] = doc[key];
      }
    }

    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(doc)) {
      if (!FRONTMATTER_KEYS.has(k)) data[k] = v;
    }

    return {
      path: filePath,
      frontmatter,
      content: Object.keys(data).length > 0 ? yamlStringify(data).trim() : "",
      data,
    };
  }

  async writeFile(
    filePath: string,
    content: string,
    frontmatter: MemoryFileFrontmatter,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const abs = this.safePath(filePath);
    const ext = extname(filePath).toLowerCase();
    let raw: string;

    if (ext === ".yaml" || ext === ".yml") {
      const doc: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(frontmatter)) {
        if (v !== undefined) doc[k] = v;
      }
      if (data) {
        for (const [k, v] of Object.entries(data)) {
          if (!FRONTMATTER_KEYS.has(k)) doc[k] = v;
        }
      } else if (content) {
        doc.content = content;
      }
      raw = yamlStringify(doc);
    } else {
      const clean = Object.fromEntries(
        Object.entries(frontmatter).filter(([, v]) => v !== undefined),
      );
      raw = matter.stringify(content, clean);
    }

    if (Buffer.byteLength(raw, "utf-8") > MemFSEngine.MAX_FILE_BYTES) {
      throw new Error(`Write payload too large (limit ${MemFSEngine.MAX_FILE_BYTES} bytes)`);
    }
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, raw, "utf-8");
    await this.commit(filePath, `update ${filePath}`);
  }

  async deleteFile(filePath: string): Promise<void> {
    const abs = this.safePath(filePath);
    await unlink(abs);
    await this.commit(filePath, `delete ${filePath}`);
  }

  private async commit(filePath: string, message: string): Promise<void> {
    // Scan content before committing; block if secrets detected
    const abs = resolve(this.root, filePath);
    const content = await readFile(abs, "utf-8").catch(() => "");
    if (content) {
      const violations = scanContent(filePath, content);
      const blockers = violations.filter((v) => v.severity === "block");
      if (blockers.length > 0) {
        const details = blockers
          .map((v) => `${v.rule} at line ${v.line}`)
          .join(", ");
        throw new SanitizerBlockError(details);
      }
    }

    try {
      await this.git.add(filePath);
      await this.git.commit(message, filePath);
      if (this.remoteUrl) {
        await this.git.push("origin", "main").catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          const safe = msg.replace(/https?:\/\/[^@]*@/g, "https://***@");
          process.stderr.write(`PUSH_ERROR ${JSON.stringify({ ts: new Date().toISOString(), file: filePath, error: safe })}\n`);
        });
      }
    } catch {
      // git not available or not initialized; file write still succeeded
    }
  }

  async getLog(maxCount = 20): Promise<CommitInfo[]> {
    try {
      const log = await this.git.log({ maxCount });
      return log.all.map((entry) => ({
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        author: entry.author_name,
      }));
    } catch {
      return [];
    }
  }

  async getTree(): Promise<MemoryTree> {
    const files = await this.walkContextFiles(this.root);
    const relativePaths = files.map((f) => relative(this.root, f).replace(/\\/g, "/"));

    const pinned = relativePaths.filter((p) => p.startsWith("system/"));
    const unpinned = relativePaths.filter((p) => !p.startsWith("system/"));

    return { files: relativePaths, pinned, unpinned };
  }

  async getContextSnapshot(): Promise<ContextSnapshot> {
    const tree = await this.getTree();
    const pinnedContents: string[] = [];
    let pinnedChars = 0;

    for (const path of tree.pinned) {
      const file = await this.readFile(path);
      const desc = file.frontmatter.description ? `> ${file.frontmatter.description}\n` : "";
      let body = file.content;
      if (file.frontmatter.char_limit && body.length > file.frontmatter.char_limit) {
        body = body.slice(0, file.frontmatter.char_limit) + "\n\n(truncated)";
      }
      const section = `## ${path}\n${desc}\n${body}`;
      pinnedContents.push(section);
      pinnedChars += section.length;
    }

    return {
      systemContext: pinnedContents.join("\n\n---\n\n"),
      tree,
      pinnedChars,
    };
  }

  async search(query: string): Promise<MemoryFile[]> {
    const tree = await this.getTree();
    const results: MemoryFile[] = [];
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return results;

    for (const path of tree.files) {
      const file = await this.readFile(path);
      const blob = [
        path,
        file.content,
        file.frontmatter.description || "",
        ...(file.frontmatter.tags || []),
      ].join(" ").toLowerCase();

      if (terms.every((t) => blob.includes(t))) {
        results.push(file);
      }
    }

    return results;
  }

  async listDir(dirPath: string): Promise<string[]> {
    const abs = this.safePath(dirPath || ".");
    try {
      const entries = await readdir(abs, { withFileTypes: true });
      return entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
    } catch {
      return [];
    }
  }

  private async walkContextFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return results;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      if (entry.isDirectory()) {
        results.push(...(await this.walkContextFiles(full)));
      } else if (CONTEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
    return results;
  }
}
