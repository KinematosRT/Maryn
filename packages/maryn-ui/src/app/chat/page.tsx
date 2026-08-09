"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

export default function ChatPage() {
  const { messages, sendMessage, status } =
    useChat({ transport: new DefaultChatTransport({ api: "/api/chat" }) });
  const [input, setInput] = useState("");
  const busy = status !== "ready";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    sendMessage({ text: input });
    setInput("");
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      <h1 className="text-2xl font-bold mb-4">Ask the Project</h1>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
        {messages.length === 0 && (
          <div className="text-zinc-500 text-sm italic mt-20 text-center">
            Ask anything about the project. Maryn searches the context repo and
            answers with citations.
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`p-3 rounded-lg text-sm whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-blue-900/30 border border-blue-800 ml-12"
                : "bg-zinc-900 border border-zinc-800 mr-12"
            }`}
          >
            <div className="text-xs text-zinc-500 mb-1 font-semibold">
              {m.role === "user" ? "You" : "Maryn"}
            </div>
            {m.parts?.map((part, i) =>
              part.type === "text" ? <span key={i}>{part.text}</span> : null
            )}
          </div>
        ))}

        {busy && (
          <div className="text-zinc-500 text-sm animate-pulse">
            Searching context...
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What's the status of feature X?"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium"
        >
          Send
        </button>
      </form>
    </div>
  );
}
