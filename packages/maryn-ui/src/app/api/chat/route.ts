import { NextRequest } from "next/server";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  contextSearch,
  contextRead,
  contextStatus,
} from "@/lib/maryn-client";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) {
    return new Response("messages array required", { status: 400 });
  }
  const lastMessage = String(messages[messages.length - 1]?.content ?? "").slice(0, 500);

  // Gather context from Maryn
  const [searchResults, status] = await Promise.all([
    contextSearch(lastMessage).catch(() => []),
    contextStatus().catch(() => null),
  ]);

  // Read top-3 matching files for full content
  const fileContents = await Promise.all(
    searchResults.slice(0, 3).map((r: { path: string }) =>
      contextRead(r.path).catch(() => null)
    )
  );

  const MAX_CONTEXT_CHARS = 12_000;
  let contextBlock = "";
  for (const f of fileContents) {
    if (!f) continue;
    const section = `--- ${f.path} ---\n${f.content}`;
    if (contextBlock.length + section.length > MAX_CONTEXT_CHARS) break;
    contextBlock += (contextBlock ? "\n\n" : "") + section;
  }

  const systemPrompt = `You are a PM assistant for the Maryn project. Answer questions using the project context below. Cite file paths when referencing information. Be concise.

## Project Status
${status ? JSON.stringify(status, null, 2) : "unavailable"}

## Relevant Context Files
${contextBlock || "No matching context files found."}
`;

  const recentMessages = messages.slice(-20);

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages: recentMessages,
  });

  return result.toUIMessageStreamResponse();
}
