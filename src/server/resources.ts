import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemFSEngine } from "../memfs/engine.js";

export function registerResources(server: McpServer, memfs: MemFSEngine): void {
  server.registerResource(
    "context-snapshot",
    "maryn://context/snapshot",
    { description: "Combined pinned context from system/ files" },
    async (uri) => {
      const snapshot = await memfs.getContextSnapshot();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: snapshot.systemContext || "(empty)",
          },
        ],
      };
    },
  );

  server.registerResource(
    "memory-tree",
    "maryn://context/tree",
    { description: "File listing with pinned/unpinned classification" },
    async (uri) => {
      const tree = await memfs.getTree();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(tree, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "memory-file",
    new ResourceTemplate("maryn://context/file/{+path}", { list: undefined }),
    { description: "Read a specific memory file by path" },
    async (uri, variables) => {
      const filePath = String(variables.path);
      try {
        const file = await memfs.readFile(filePath);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: `---\n${JSON.stringify(file.frontmatter, null, 2)}\n---\n\n${file.content}`,
            },
          ],
        };
      } catch {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `Not found: ${filePath}`,
            },
          ],
        };
      }
    },
  );
}
