import { type ReactNode, useEffect, useState, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Sparkles, X, Send, Loader2, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

const CHAT_STORAGE_KEY = "coah-ai-chat-v1";

type Msg = { role: "user" | "assistant"; content: string };

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [aiOpen, setAiOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Msg[]) : [];
    } catch {
      return [];
    }
  });
  const [sending, setSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch { /* ignore quota */ }
  }, [messages]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>
    );
  }

  const initials = (user.email ?? "??").slice(0, 2).toUpperCase();

  const runSend = async (history: Msg[]) => {
    setSending(true);
    setLastError(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: history }),
      });

      if (!resp.ok || !resp.body) {
        let msg = "AI request failed.";
        if (resp.status === 429) msg = "Rate limit hit — try again in a moment.";
        else if (resp.status === 402) msg = "AI credits exhausted. Add funds in workspace settings.";
        toast.error(msg);
        setLastError(msg);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      let added = false;

      const pushChunk = (chunk: string) => {
        assistantContent += chunk;
        setMessages((prev) => {
          if (!added) {
            added = true;
            return [...prev, { role: "assistant", content: assistantContent }];
          }
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantContent } : m,
          );
        });
      };

      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) pushChunk(delta);
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      const msg = "AI request failed.";
      toast.error(msg);
      setLastError(msg);
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    await runSend(next);
  };

  const retry = async () => {
    if (sending || messages.length === 0) return;
    // Drop trailing assistant message if any (failed or partial), then resend the conversation
    const trimmed = messages[messages.length - 1]?.role === "assistant"
      ? messages.slice(0, -1)
      : messages;
    setMessages(trimmed);
    await runSend(trimmed);
  };

  const clearChat = () => {
    if (sending) return;
    setMessages([]);
    setLastError(null);
    try { sessionStorage.removeItem(CHAT_STORAGE_KEY); } catch { /* ignore */ }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background text-foreground">
        <AppSidebar />
        <SidebarInset className="flex flex-col min-w-0">
          <header className="h-14 sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/85 backdrop-blur px-4">
            <SidebarTrigger />
            <div className="flex items-center gap-3">
              <button
                onClick={() => signOut()}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Sign out
              </button>
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                {initials}
              </div>
            </div>
          </header>

          <main className="flex-1 px-6 py-8 overflow-x-hidden">{children}</main>
        </SidebarInset>

        {/* AI Assistant FAB */}
        <button
          onClick={() => setAiOpen(true)}
          aria-label="Open AI assistant"
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform z-40"
        >
          <Sparkles className="w-6 h-6" />
        </button>

        {aiOpen && (
          <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setAiOpen(false)}>
            <div className="absolute inset-0 bg-foreground/10 backdrop-blur-sm" />
            <aside
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-surface border-l border-border shadow-xl flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h2 className="font-display font-semibold">Ask the Hub</h2>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setAiOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    Ask anything about meetings, the calendar, or Sunday Reviews. The assistant has live context across the hub.
                  </div>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                      m.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {m.content || "…"}
                  </div>
                ))}
                {sending && messages[messages.length - 1]?.role === "user" && (
                  <div className="bg-muted rounded-2xl px-3 py-2 text-sm w-fit">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="p-3 border-t border-border flex gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything…"
                  className="flex-1 bg-background rounded-lg px-3 py-2 text-sm border border-border outline-none focus:ring-2 focus:ring-primary/30"
                />
                <Button type="submit" size="icon" disabled={!input.trim() || sending}>
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </aside>
          </div>
        )}
      </div>
    </SidebarProvider>
  );
}
