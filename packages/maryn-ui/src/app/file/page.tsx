import { contextRead } from "@/lib/maryn-client";

export const dynamic = "force-dynamic";

export default async function FilePage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  const { path } = await searchParams;
  if (!path) {
    return <p className="text-zinc-500">No file path specified.</p>;
  }

  let file;
  try {
    file = await contextRead(path);
  } catch {
    return <p className="text-red-400">File not found: {path}</p>;
  }

  const fm = file.frontmatter as Record<string, string | boolean | string[] | undefined>;

  return (
    <div>
      <a
        href="/"
        className="text-sm text-zinc-500 hover:text-zinc-300 mb-4 inline-block"
      >
        &larr; Back
      </a>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-xl font-semibold">{file.path}</h1>
          {file.path.startsWith("system/") && (
            <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full">
              pinned
            </span>
          )}
        </div>

        {fm.description && (
          <p className="text-zinc-400 text-sm mb-3">{String(fm.description)}</p>
        )}

        <div className="flex gap-4 text-xs text-zinc-500 mb-4">
          {fm.created && <span>created: {String(fm.created)}</span>}
          {fm.updated && <span>updated: {String(fm.updated)}</span>}
          {fm.char_limit && <span>limit: {String(fm.char_limit)}</span>}
          {fm.read_only && <span>read-only</span>}
        </div>

        {Array.isArray(fm.tags) && fm.tags.length > 0 && (
          <div className="flex gap-2 mb-4">
            {fm.tags.map((t: string) => (
              <span
                key={t}
                className="text-xs bg-zinc-800 text-blue-300 px-2 py-0.5 rounded-full"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <pre className="bg-zinc-950 p-4 rounded text-sm text-zinc-200 whitespace-pre-wrap overflow-auto">
          {file.content}
        </pre>
      </div>
    </div>
  );
}
