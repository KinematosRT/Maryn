import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemFSEngine } from "../src/memfs/engine.js";

describe("MemFSEngine", () => {
  let engine: MemFSEngine;
  let tempDir: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "maryn-test-"));
    engine = new MemFSEngine(tempDir);
    await engine.init();
  });

  after(async () => {
    // Windows may hold .git locks; retry once after a short delay
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      await new Promise((r) => setTimeout(r, 200));
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("init creates a git repository", async () => {
    const tree = await engine.getTree();
    assert.ok(Array.isArray(tree.files));
  });

  it("writeFile creates a markdown file with frontmatter", async () => {
    await engine.writeFile("system/test.md", "Test content", {
      description: "A test file",
      tags: ["test"],
    });

    const file = await engine.readFile("system/test.md");
    assert.equal(file.content, "Test content");
    assert.equal(file.frontmatter.description, "A test file");
    assert.deepEqual(file.frontmatter.tags, ["test"]);
  });

  it("writeFile auto-commits to git", async () => {
    await engine.writeFile("system/committed.md", "Committed content", {
      description: "Auto-commit test",
    });

    const log = await engine.getLog(5);
    assert.ok(log.length > 0, "Expected at least one commit");
    const latest = log[0];
    assert.ok(latest.message.includes("committed.md"), "Commit message should reference file path");
  });

  it("getTree classifies system/ files as pinned", async () => {
    await engine.writeFile("reference/unpinned.md", "Not pinned", {
      description: "Unpinned file",
    });

    const tree = await engine.getTree();
    assert.ok(tree.pinned.some((p) => p.startsWith("system/")));
    assert.ok(tree.unpinned.some((p) => p === "reference/unpinned.md"));
  });

  it("search finds files by content", async () => {
    await engine.writeFile("reference/searchable.md", "unique-needle-12345", {
      description: "Searchable",
    });

    const results = await engine.search("unique-needle-12345");
    assert.ok(results.length > 0, "Should find the file by content");
    assert.equal(results[0].path, "reference/searchable.md");
  });

  it("search finds files by tag", async () => {
    await engine.writeFile("reference/tagged.md", "Tagged file", {
      description: "Has tag",
      tags: ["special-tag-xyz"],
    });

    const results = await engine.search("special-tag-xyz");
    assert.ok(results.length > 0, "Should find the file by tag");
  });

  it("getContextSnapshot returns pinned content", async () => {
    const snapshot = await engine.getContextSnapshot();
    assert.ok(snapshot.pinnedChars > 0, "Should have pinned content");
    assert.ok(snapshot.systemContext.includes("system/"), "Should reference system files");
  });

  it("getContextSnapshot respects char_limit", async () => {
    const longContent = "A".repeat(5000);
    await engine.writeFile("system/limited.md", longContent, {
      description: "Limited file",
      char_limit: 100,
    });

    const snapshot = await engine.getContextSnapshot();
    assert.ok(snapshot.systemContext.includes("(truncated)"), "Should truncate at char_limit");
  });

  it("deleteFile removes the file and commits", async () => {
    await engine.writeFile("reference/todelete.md", "Delete me", {
      description: "Will be deleted",
    });

    await engine.deleteFile("reference/todelete.md");

    await assert.rejects(
      () => engine.readFile("reference/todelete.md"),
      "Should throw when reading deleted file"
    );
  });

  it("safePath rejects path traversal", async () => {
    await assert.rejects(
      () => engine.readFile("../../etc/passwd"),
      /Path escapes context repo/
    );
  });

  it("safePath rejects .git access", async () => {
    await assert.rejects(
      () => engine.readFile(".git/config"),
      /Cannot access .git internals/
    );
  });

  it("listDir returns directory contents", async () => {
    const entries = await engine.listDir("system");
    assert.ok(entries.length > 0, "system/ should have files");
    assert.ok(entries.some((e) => e.endsWith(".md")));
  });

  it("getLog returns commit history", async () => {
    const log = await engine.getLog(50);
    assert.ok(log.length > 0);
    assert.ok(log[0].hash.length > 0);
    assert.ok(log[0].date.length > 0);
    assert.ok(log[0].message.length > 0);
  });

  // -- YAML format tests --

  it("writeFile creates a YAML file with structured data", async () => {
    await engine.writeFile(
      "system/config.yaml",
      "",
      { description: "Test YAML config", tags: ["yaml", "test"] },
      { project: { name: "Maryn", status: "active" }, actors: ["E-A_B", "Simon"] },
    );

    const file = await engine.readFile("system/config.yaml");
    assert.equal(file.frontmatter.description, "Test YAML config");
    assert.deepEqual(file.frontmatter.tags, ["yaml", "test"]);
    assert.ok(file.data, "YAML file should have structured data");
    assert.deepEqual(file.data!.project, { name: "Maryn", status: "active" });
    assert.deepEqual(file.data!.actors, ["E-A_B", "Simon"]);
  });

  it("getTree includes both .md and .yaml files", async () => {
    const tree = await engine.getTree();
    assert.ok(tree.files.some((f) => f.endsWith(".md")), "Should include .md files");
    assert.ok(tree.files.some((f) => f.endsWith(".yaml")), "Should include .yaml files");
  });

  it("search finds YAML files by content", async () => {
    await engine.writeFile(
      "reference/searchable.yaml",
      "",
      { description: "YAML search target", tags: ["findme"] },
      { needle: "yaml-needle-99887" },
    );

    const results = await engine.search("yaml-needle-99887");
    assert.ok(results.length > 0, "Should find YAML file by data content");
    assert.equal(results[0].path, "reference/searchable.yaml");
  });

  it("YAML files in system/ are pinned", async () => {
    const tree = await engine.getTree();
    assert.ok(tree.pinned.some((p) => p === "system/config.yaml"));
  });

  it("getContextSnapshot includes YAML pinned files", async () => {
    const snapshot = await engine.getContextSnapshot();
    assert.ok(snapshot.systemContext.includes("system/config.yaml"));
  });

  // -- sanitizer and concurrency tests --

  it("writeFile refuses a secret before it reaches disk", async () => {
    const path = "reference/leaked-key.md";

    await assert.rejects(
      () => engine.writeFile(path, "AKIAIOSFODNN7EXAMPLE", { description: "leak" }),
      /Sanitizer blocked write/
    );

    const tree = await engine.getTree();
    assert.ok(!tree.files.includes(path), "refused write left a file behind");

    const log = await engine.getLog(50);
    assert.ok(
      !log.some((commit) => commit.message.includes("leaked-key")),
      "refused write left a commit behind"
    );
  });

  it("writeFile accepts a connection string that carries no credentials", async () => {
    await engine.writeFile("reference/local-db.md", "postgres://localhost:5432/maryn", {
      description: "Local development target",
    });

    const file = await engine.readFile("reference/local-db.md");
    assert.equal(file.content, "postgres://localhost:5432/maryn");
  });

  it("parallel writes each produce their own commit", async () => {
    const paths = Array.from({ length: 12 }, (_, i) => `journal/parallel/note-${i}.md`);

    await Promise.all(
      paths.map((path, i) =>
        engine.writeFile(path, `note ${i}`, { description: `parallel note ${i}` })
      )
    );

    const tree = await engine.getTree();
    const log = await engine.getLog(200);

    for (const path of paths) {
      assert.ok(tree.files.includes(path), `${path} missing from the tree`);
      assert.ok(
        log.some((commit) => commit.message.includes(path)),
        `${path} missing from git history`
      );
    }
  });
});
