import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent } from "../agent";
import { type ChatEvent, chatBus } from "../logger";
import type { Message } from "../model";
import type { DB } from "../database";

// Re-use the DB Message type for chat display
export type ChatMessage = Pick<Message, "id" | "role" | "content" | "source">;

export function useStreamAgent(agent: Agent | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  // When true, we suppress chatBus events for CLI assistant messages
  // since we're already rendering chunks in real time.
  const suppressCliRef = useRef(false);

  // Subscribe to ALL messages via chatBus (fed by db.saveMessage)
  useEffect(() => {
    const handler = (event: ChatEvent) => {
      // While streaming from CLI, suppress the user message (already shown
      // via chatBus from db.saveMessage in agent.stream) is fine — but
      // suppress the final assistant save since we built it from chunks.
      if (
        suppressCliRef.current &&
        event.source === "cli" &&
        event.role === "assistant"
      ) {
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: event.id,
          role: event.role,
          content: event.content,
          source: event.source as Message["source"],
        },
      ]);
    };
    chatBus.on("message", handler);
    return () => {
      chatBus.off("message", handler);
    };
  }, []);

  const loadHistory = useCallback(async (db: DB) => {
    const recent = await db.getRecentMessages(20);
    const loaded: ChatMessage[] = recent
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        source: m.source,
      }));
    if (loaded.length > 0) {
      setMessages(loaded);
    }
  }, []);

  const send = useCallback(
    async (input: string) => {
      if (!agent || isStreaming) return;

      // Don't add user message manually — agent.stream() calls
      // db.saveMessage("user", ...) which emits on chatBus.
      // But we DO need the empty assistant placeholder for streaming chunks.
      setIsStreaming(true);
      suppressCliRef.current = true;

      const placeholderId = `streaming-${Date.now()}`;

      // We need to wait for the user message to come through chatBus
      // before adding the assistant placeholder. agent.stream() saves the
      // user message first, then starts streaming. We add the placeholder
      // after a microtask so the chatBus user event fires first.
      let started = false;

      try {
        for await (const chunk of agent.stream(input)) {
          if (!started) {
            // First chunk — add the assistant placeholder
            setMessages((prev) => [
              ...prev,
              {
                id: placeholderId,
                role: "assistant" as const,
                content: chunk,
                source: "cli" as const,
              },
            ]);
            started = true;
          } else {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1]!;
              updated[updated.length - 1] = {
                ...last,
                content: last.content + chunk,
              };
              return updated;
            });
          }
        }
      } catch (err) {
        if (!started) {
          setMessages((prev) => [
            ...prev,
            {
              id: placeholderId,
              role: "assistant" as const,
              content: `[Error: ${(err as Error).message}]`,
              source: "cli" as const,
            },
          ]);
        } else {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1]!;
            updated[updated.length - 1] = {
              ...last,
              content: last.content + `\n[Error: ${(err as Error).message}]`,
            };
            return updated;
          });
        }
      } finally {
        // Small delay so the final db.saveMessage chatBus event
        // (assistant, cli) is still suppressed, then re-enable.
        setTimeout(() => {
          suppressCliRef.current = false;
        }, 500);
        setIsStreaming(false);
      }
    },
    [agent, isStreaming],
  );

  const addSystemMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `sys-${Date.now()}`,
        role: "system" as const,
        content,
        source: "cli" as const,
      },
    ]);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isStreaming, send, addSystemMessage, clear, loadHistory };
}
