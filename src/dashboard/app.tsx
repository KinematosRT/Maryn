import { Hono } from "hono";
import type { MemFSEngine } from "../memfs/engine.js";
import {
  Layout,
  StatCard,
  FileCard,
  CommitTable,
  SearchForm,
  EmptyState,
  SectionTitle,
  FileView,
} from "./components.js";

export function createApp(memfs: MemFSEngine, css: string): Hono {
  const app = new Hono();

  app.get("/styles.css", (c) => {
    return c.body(css, { headers: { "Content-Type": "text/css; charset=utf-8" } });
  });

  app.get("/", async (c) => {
    const tree = await memfs.getTree();
    const log = await memfs.getLog(5);
    const snapshot = await memfs.getContextSnapshot();
    const pinnedFiles = await Promise.all(
      tree.pinned.map((p) => memfs.readFile(p)),
    );

    return c.html(
      <Layout title="Overview" active="overview">
        <div class="stats">
          <StatCard num={tree.files.length} label="memory files" />
          <StatCard num={tree.pinned.length} label="pinned (system/)" />
          <StatCard num={snapshot.pinnedChars} label="context chars" />
          <StatCard num={log.length} label="recent commits" />
        </div>
        <SectionTitle>Pinned Context</SectionTitle>
        {pinnedFiles.length > 0 ? (
          pinnedFiles.map((f) => <FileCard file={f} pinned />)
        ) : (
          <EmptyState>
            No pinned files yet. Add markdown files to system/.
          </EmptyState>
        )}
        <SectionTitle>Recent History</SectionTitle>
        <CommitTable commits={log} />
      </Layout>,
    );
  });

  app.get("/files", async (c) => {
    const tree = await memfs.getTree();
    const files = await Promise.all(
      tree.files.map((p) => memfs.readFile(p)),
    );
    const pinned = files.filter((f) => f.path.startsWith("system/"));
    const unpinned = files.filter((f) => !f.path.startsWith("system/"));

    return c.html(
      <Layout title="Files" active="files">
        <SectionTitle>Pinned (system/)</SectionTitle>
        {pinned.length > 0 ? (
          pinned.map((f) => <FileCard file={f} pinned />)
        ) : (
          <EmptyState>None</EmptyState>
        )}
        <SectionTitle>Reference</SectionTitle>
        {unpinned.length > 0 ? (
          unpinned.map((f) => <FileCard file={f} pinned={false} />)
        ) : (
          <EmptyState>None</EmptyState>
        )}
      </Layout>,
    );
  });

  app.get("/file", async (c) => {
    const filePath = c.req.query("path") || "";
    try {
      const f = await memfs.readFile(filePath);
      return c.html(
        <Layout title={f.path} active="files">
          <a href="/files" style="font-size:13px">
            ← All files
          </a>
          <FileView file={f} />
        </Layout>,
      );
    } catch {
      return c.html(
        <Layout title="Not Found" active="files">
          <EmptyState>File not found: {filePath}</EmptyState>
        </Layout>,
        404,
      );
    }
  });

  app.get("/history", async (c) => {
    const log = await memfs.getLog(50);
    return c.html(
      <Layout title="History" active="history">
        <SectionTitle>Git Commit Log</SectionTitle>
        <CommitTable commits={log} />
      </Layout>,
    );
  });

  app.get("/search", async (c) => {
    const query = c.req.query("q") || "";
    const matches = query ? await memfs.search(query) : [];

    return c.html(
      <Layout title="Search" active="search">
        <SearchForm query={query} />
        {query && matches.length > 0 && (
          <>
            <SectionTitle>{matches.length} result(s)</SectionTitle>
            {matches.map((f) => (
              <FileCard file={f} pinned={f.path.startsWith("system/")} />
            ))}
          </>
        )}
        {query && matches.length === 0 && (
          <EmptyState>No results for "{query}"</EmptyState>
        )}
      </Layout>,
    );
  });

  app.notFound((c) => c.text("Not found", 404));
  app.onError((err, c) => c.text(err.message, 500));

  return app;
}
