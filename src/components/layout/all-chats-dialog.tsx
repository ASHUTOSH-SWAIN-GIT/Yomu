import { useState } from "react";
import { MessageCircle, Search, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { goHome } from "@/lib/navigate";
import { cn } from "@/lib/utils";
import { useLibraryChatStore } from "@/stores/library-chat-store";
import { useReaderStore } from "@/stores/reader-store";
import { useViewStore } from "@/stores/view-store";
import { useUiStore } from "@/stores/ui-store";

/** Every chat you have had with your blogs, with a box to search them.
 * Opened by "View all" under the sidebar's recent chats. */
export function AllChatsDialog() {
  const open = useUiStore((s) => s.allChatsOpen);
  const setOpen = useUiStore((s) => s.setAllChatsOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[80vh] w-[min(34rem,calc(100vw-2rem))] flex-col p-0">
        {/* Mounted only while open, so the search and any pending delete
            start fresh each time. */}
        {open && <Body close={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ close }: { close: () => void }) {
  const allChats = useLibraryChatStore((s) => s.chats);
  const liveChatId = useLibraryChatStore((s) => s.liveChatId);
  const chats = allChats.filter((c) => c.id !== liveChatId);
  const chatId = useLibraryChatStore((s) => s.chatId);
  const openChat = useLibraryChatStore((s) => s.openChat);
  const deleteChat = useLibraryChatStore((s) => s.deleteChat);
  const setLibraryChat = useViewStore((s) => s.setLibraryChat);
  const reading = useReaderStore((s) => s.state.status === "ready");
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const shown = q
    ? chats.filter((c) => c.title.toLowerCase().includes(q))
    : chats;

  return (
    <>
      <div className="px-6 pt-6 pb-3">
        <DialogTitle className="text-[1.25rem] font-bold tracking-[-0.01em]">
          All chats
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-[0.8125rem]">
          {chats.length} {chats.length === 1 ? "chat" : "chats"} with your
          blogs.
        </DialogDescription>
        <label className="bg-muted mt-4 flex h-10 items-center gap-2.5 rounded-xl px-3.5">
          <Search
            className="text-muted-foreground size-4 shrink-0"
            aria-hidden
          />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[0.875rem] outline-none"
          />
        </label>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {shown.length === 0 && (
          <li className="text-muted-foreground px-3 py-8 text-center text-[0.8125rem]">
            {q ? "No chat matches." : "No chats yet."}
          </li>
        )}
        {shown.map((chat) => (
          <li key={chat.id}>
            <div
              className={cn(
                "group flex items-center gap-1 rounded-lg pr-1.5",
                chat.id === chatId ? "bg-accent/60" : "hover:bg-accent/60",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  void openChat(chat.id);
                  setLibraryChat(true);
                  if (reading) void goHome();
                  close();
                }}
                title={chat.title}
                className="focus-visible:ring-ring/60 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[0.875rem] outline-none focus-visible:ring-2"
              >
                <MessageCircle
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{chat.title}</span>
              </button>
              {confirming === chat.id ? (
                <span className="flex shrink-0 items-center gap-1 text-[0.75rem]">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(null);
                      void deleteChat(chat.id);
                    }}
                    className="bg-destructive text-destructive-foreground focus-visible:ring-ring/60 h-6 rounded-md px-2.5 font-medium outline-none focus-visible:ring-2"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="hover:bg-accent focus-visible:ring-ring/60 h-6 rounded-md px-2 outline-none focus-visible:ring-2"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(chat.id)}
                  aria-label={`Delete the chat “${chat.title}”`}
                  title="Delete this chat"
                  className="text-muted-foreground hover:text-destructive hover:bg-background/60 focus-visible:ring-ring/60 grid size-7 shrink-0 place-items-center rounded-md outline-none focus-visible:ring-2"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
