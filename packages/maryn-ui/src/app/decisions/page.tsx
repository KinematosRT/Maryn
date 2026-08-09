import { contextSearch } from "@/lib/maryn-client";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const results = await contextSearch("adr");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Decision Log</h1>

      {results.length === 0 && (
        <p className="text-zinc-500 italic">
          No decisions recorded yet. Write ADRs to the context repo.
        </p>
      )}

      <div className="space-y-3">
        {results.map((r) => (
          <a
            key={r.path}
            href={`/file?path=${encodeURIComponent(r.path)}`}
            className="block bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-600 transition-colors"
          >
            <div className="font-medium text-blue-400">{r.path}</div>
            <div className="text-sm text-zinc-400 mt-1">{r.description}</div>
            {r.tags?.length > 0 && (
              <div className="flex gap-2 mt-2">
                {r.tags.map((t) => (
                  <span
                    key={t}
                    className="text-xs bg-zinc-800 text-blue-300 px-2 py-0.5 rounded-full"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="text-xs text-zinc-600 mt-2">
              {r.preview.slice(0, 120)}...
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
