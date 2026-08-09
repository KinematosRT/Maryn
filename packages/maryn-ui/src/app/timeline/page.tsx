import { contextLog } from "@/lib/maryn-client";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const log = await contextLog(50);

  // Group commits by date
  const grouped = new Map<string, typeof log>();
  for (const entry of log) {
    const date = entry.date.split("T")[0] || entry.date.split(" ")[0];
    const group = grouped.get(date) || [];
    group.push(entry);
    grouped.set(date, group);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Timeline</h1>

      {grouped.size === 0 && (
        <p className="text-zinc-500 italic">No activity recorded yet.</p>
      )}

      {Array.from(grouped.entries()).map(([date, entries]) => (
        <div key={date} className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3 border-b border-zinc-800 pb-2">
            {date}
          </h2>
          <div className="space-y-2">
            {entries.map((c) => (
              <div
                key={c.hash}
                className="bg-zinc-900 border border-zinc-800 rounded p-3 text-sm flex items-start gap-3"
              >
                <code className="text-blue-400 shrink-0">
                  {c.hash.slice(0, 7)}
                </code>
                <div>
                  <div className="text-zinc-200">{c.message}</div>
                  <div className="text-xs text-zinc-500 mt-1">{c.author}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
