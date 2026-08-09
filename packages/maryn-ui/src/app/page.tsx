import { contextTree, contextLog, contextStatus } from "@/lib/maryn-client";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [tree, log, status] = await Promise.all([
    contextTree(),
    contextLog(10),
    contextStatus(),
  ]);

  const statusLines = status.split("\n");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Project Overview</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {statusLines.map((line, i) => {
          const [label, value] = line.split(": ");
          return (
            <div
              key={i}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4"
            >
              <div className="text-2xl font-semibold text-blue-400">
                {value}
              </div>
              <div className="text-xs text-zinc-500 uppercase tracking-wide">
                {label}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            Pinned Context (system/)
          </h2>
          <ul className="space-y-1">
            {tree.pinned.map((f) => (
              <li key={f}>
                <a
                  href={`/file?path=${encodeURIComponent(f)}`}
                  className="text-blue-400 hover:underline text-sm"
                >
                  {f}
                </a>
              </li>
            ))}
          </ul>

          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3 mt-6">
            Reference Files
          </h2>
          <ul className="space-y-1">
            {tree.unpinned.map((f) => (
              <li key={f}>
                <a
                  href={`/file?path=${encodeURIComponent(f)}`}
                  className="text-zinc-300 hover:underline text-sm"
                >
                  {f}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            Recent Commits
          </h2>
          <div className="space-y-2">
            {log.length === 0 && (
              <p className="text-zinc-500 text-sm italic">No commits yet.</p>
            )}
            {log.map((c) => (
              <div
                key={c.hash}
                className="bg-zinc-900 border border-zinc-800 rounded p-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <code className="text-blue-400">{c.hash.slice(0, 7)}</code>
                  <span className="text-zinc-300">{c.message}</span>
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  {c.author} &middot; {c.date}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
