import type { Conversation, Message } from "./types";

const BASE = "/api";

function hdrs(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    // Bypass ngrok's browser interstitial in free tier
    "ngrok-skip-browser-warning": "1",
  };
}

/* ------------------------------------------------------------------ */
/*  Conversation CRUD                                                 */
/* ------------------------------------------------------------------ */

export async function listConversations(token: string): Promise<Conversation[]> {
  const res = await fetch(`${BASE}/conversations`, { headers: hdrs(token) });
  const data = await res.json();
  return data.conversations ?? [];
}

export async function createConversation(
  token: string,
  title?: string
): Promise<Conversation> {
  const res = await fetch(`${BASE}/conversations`, {
    method: "POST",
    headers: hdrs(token),
    body: JSON.stringify({ title }),
  });
  return res.json();
}

export async function searchConversations(
  token: string,
  query: string
): Promise<Conversation[]> {
  const res = await fetch(
    `${BASE}/conversations/search?q=${encodeURIComponent(query)}`,
    { headers: hdrs(token) }
  );
  const data = await res.json();
  return data.conversations ?? [];
}

export async function getMessages(
  token: string,
  convId: string
): Promise<Message[]> {
  const res = await fetch(`${BASE}/conversations/${convId}/messages`, {
    headers: hdrs(token),
  });
  const data = await res.json();
  return data.messages ?? [];
}

export async function deleteConversation(
  token: string,
  convId: string
): Promise<void> {
  await fetch(`${BASE}/conversations/${convId}`, {
    method: "DELETE",
    headers: hdrs(token),
  });
}

export async function renameConversation(
  token: string,
  convId: string,
  title: string
): Promise<void> {
  await fetch(`${BASE}/conversations/${convId}`, {
    method: "PATCH",
    headers: hdrs(token),
    body: JSON.stringify({ title }),
  });
}

/* ------------------------------------------------------------------ */
/*  DB preference                                                     */
/* ------------------------------------------------------------------ */

export async function getDbPreference(
  token: string
): Promise<{ db_source: string; options: string[] }> {
  const res = await fetch(`${BASE}/preferences/db`, { headers: hdrs(token) });
  return res.json();
}

export async function setDbPreference(
  token: string,
  dbSource: string
): Promise<{ db_source: string; ok: boolean }> {
  const res = await fetch(`${BASE}/preferences/db`, {
    method: "PUT",
    headers: hdrs(token),
    body: JSON.stringify({ db_source: dbSource }),
  });
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Suggestions                                                       */
/* ------------------------------------------------------------------ */

export async function getSuggestions(
  token: string,
  q: string
): Promise<string[]> {
  try {
    const res = await fetch(
      `${BASE}/suggestions?q=${encodeURIComponent(q)}`,
      { headers: hdrs(token) }
    );
    const data = await res.json();
    return data.suggestions ?? [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Send message – reads the SSE stream from the gateway              */
/* ------------------------------------------------------------------ */

export async function sendMessage(
  token: string,
  convId: string,
  text: string,
  onDelta: (accumulatedText: string) => void,
  onDone: (finalText: string) => void,
  onError: (error: string) => void,
  signal?: AbortSignal
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/conversations/${convId}/messages`, {
      method: "POST",
      headers: hdrs(token),
      body: JSON.stringify({ text }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    onError("Network error – please check your connection.");
    return;
  }

  if (!res.ok) {
    onError(`Server error: ${res.status}`);
    return;
  }
  if (!res.body) {
    onError("No response stream");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        if (!part.trim()) continue;
        const lines = part.split("\n");
        let eventType = "";
        let eventData = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) eventType = line.slice(7);
          else if (line.startsWith("data: ")) eventData = line.slice(6);
        }
        try {
          if (eventType === "start") {
            onDelta("");
          } else if (eventType === "delta") {
            const t = JSON.parse(eventData).text ?? "";
            onDelta(t);
          } else if (eventType === "message") {
            const t = JSON.parse(eventData).text ?? "";
            onDone(t);
            return;
          } else if (eventType === "error") {
            const err = JSON.parse(eventData).error ?? "Unknown error";
            onError(err);
            return;
          }
        } catch (e) {
          console.warn("[SSE] parse error:", e);
        }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    onError("Stream interrupted");
  }
}
