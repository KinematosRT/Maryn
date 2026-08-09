import { raw } from "hono/html";
import type { FC, Child } from "hono/jsx";
import type { MemoryFile, CommitInfo } from "../memfs/types.js";

const NAV_LINKS = [
  { name: "overview", href: "/" },
  { name: "files", href: "/files" },
  { name: "history", href: "/history" },
  { name: "search", href: "/search" },
] as const;

export const Layout: FC<{ title: string; active: string; children?: Child }> = ({
  title,
  active,
  children,
}) => (
  <>
    {raw("<!DOCTYPE html>")}
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Maryn - {title}</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <div class="topbar">
          <h1>Maryn</h1>
          <nav>
            {NAV_LINKS.map((l) => (
              <a href={l.href} class={active === l.name ? "active" : ""}>
                {l.name}
              </a>
            ))}
          </nav>
        </div>
        <div class="container">{children}</div>
      </body>
    </html>
  </>
);

export const StatCard: FC<{ num: number; label: string }> = ({ num, label }) => (
  <div class="stat">
    <div class="num">{num}</div>
    <div class="label">{label}</div>
  </div>
);

export const SectionTitle: FC<{ children?: Child }> = ({ children }) => (
  <div class="section-title">{children}</div>
);

export const EmptyState: FC<{ children?: Child }> = ({ children }) => (
  <div class="empty">{children}</div>
);

const TagBadge: FC<{ tag: string }> = ({ tag }) => (
  <span class="tag">{tag}</span>
);

export const FileCard: FC<{ file: MemoryFile; pinned: boolean }> = ({
  file,
  pinned,
}) => {
  const tags = file.frontmatter.tags || [];
  return (
    <div class="card">
      <div class="card-header">
        <a href={`/file?path=${encodeURIComponent(file.path)}`}>
          {file.path}
        </a>
        {pinned ? (
          <span class="badge pinned">pinned</span>
        ) : (
          <span class="badge">reference</span>
        )}
      </div>
      {file.frontmatter.description && (
        <div class="card-desc">{file.frontmatter.description}</div>
      )}
      {tags.length > 0 && (
        <div class="card-tags">
          {tags.map((t) => <TagBadge tag={t} />)}
        </div>
      )}
    </div>
  );
};

export const CommitTable: FC<{ commits: CommitInfo[] }> = ({ commits }) => {
  if (commits.length === 0) {
    return <EmptyState>No commits yet.</EmptyState>;
  }
  return (
    <table>
      <tbody>
        <tr>
          <th>Hash</th>
          <th>Message</th>
          <th>Date</th>
          <th>Author</th>
        </tr>
      </tbody>
      {commits.map((c) => (
        <tr>
          <td class="hash">{c.hash.slice(0, 7)}</td>
          <td>{c.message}</td>
          <td class="meta">{c.date}</td>
          <td class="meta">{c.author}</td>
        </tr>
      ))}
    </table>
  );
};

export const FileView: FC<{ file: MemoryFile }> = ({ file }) => {
  const tags = file.frontmatter.tags || [];
  const isPinned = file.path.startsWith("system/");
  const fm = file.frontmatter;
  return (
    <div class="file-view">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:16px;font-weight:600">{file.path}</span>
        {isPinned ? (
          <span class="badge pinned">pinned</span>
        ) : (
          <span class="badge">reference</span>
        )}
      </div>
      <div class="file-meta">
        {fm.description && <span>{fm.description}</span>}
        {fm.created && <span>created: {fm.created}</span>}
        {fm.updated && <span>updated: {fm.updated}</span>}
        {fm.char_limit && <span>limit: {String(fm.char_limit)}</span>}
        {fm.read_only && <span>read-only</span>}
      </div>
      {tags.length > 0 && (
        <div style="margin-top:8px">
          {tags.map((t) => <TagBadge tag={t} />)}
        </div>
      )}
      <pre>{file.content}</pre>
    </div>
  );
};

export const SearchForm: FC<{ query: string }> = ({ query }) => (
  <form class="search-form" action="/search" method="get">
    <input name="q" value={query} placeholder="Search memory files..." />
    <button type="submit">Search</button>
  </form>
);
