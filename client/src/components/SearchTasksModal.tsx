import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2, MessageSquarePlus, Search, SquarePlus, X } from "lucide-react";
import { useMemo, useState } from "react";

function formatRelativeTime(date: Date | string, t: SearchModalTexts): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return t.today;
  if (diffDays === 1) return t.yesterday;
  if (diffDays < 7) return `${diffDays} ${t.daysAgo}`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} ${t.weeksAgo}`;
  return d.toLocaleDateString();
}

type ConvItem = {
  id: number;
  uniqueId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

type SearchModalTexts = {
  searchPlaceholder: string;
  newTask: string;
  searchResults: string;
  last30Days: string;
  noMatchingTasks: string;
  noTasksLast30Days: string;
  today: string;
  yesterday: string;
  daysAgo: string;
  weeksAgo: string;
};

export function SearchTasksModal({
  open,
  onClose,
  onSelectConversation,
  onNewTask,
  texts,
}: {
  open: boolean;
  onClose: () => void;
  onSelectConversation: (uniqueId: string) => void;
  onNewTask: () => void;
  texts: SearchModalTexts;
}) {
  const [query, setQuery] = useState("");
  const { data: convList, isLoading } = trpc.conversations.list.useQuery(undefined, {
    enabled: open,
  });

  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.getTime();
  }, []);

  const filteredList = useMemo(() => {
    if (!convList) return [];
    const q = query.trim().toLowerCase();
    let list = convList as ConvItem[];
    if (q) {
      list = list.filter((c) => c.title.toLowerCase().includes(q));
    }
    return list;
  }, [convList, query]);

  // When searching: show all matches. When not: show only last 30 days.
  const displayList = useMemo(() => {
    const hasSearch = query.trim().length > 0;
    if (hasSearch) return filteredList;
    return filteredList.filter((c) => new Date(c.updatedAt).getTime() >= thirtyDaysAgo);
  }, [filteredList, query, thirtyDaysAgo]);

  const sectionTitle = query.trim() ? texts.searchResults : texts.last30Days;

  const handleSelect = (uniqueId: string) => {
    onSelectConversation(uniqueId);
    onClose();
  };

  const handleNewTask = () => {
    onNewTask();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-[480px] p-0 gap-0 overflow-hidden"
        showCloseButton={false}
      >
        <div className="flex flex-col max-h-[70vh]">
          {/* Search bar with close button aligned */}
          <div className="flex items-center gap-2 p-4 border-b border-border/60">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder={texts.searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 h-10 rounded-lg"
                autoFocus
              />
            </div>
            <DialogClose asChild>
              <button
                type="button"
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-70 hover:opacity-100 hover:bg-muted/60 transition-all"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </DialogClose>
          </div>

          {/* New task button */}
          <div className="px-4 py-3">
            <Button
              onClick={handleNewTask}
              variant="outline"
              className="w-full justify-center gap-2 h-9 rounded-lg"
            >
              <SquarePlus className="size-4" />
              {texts.newTask}
            </Button>
          </div>

          {/* Last 30 days section */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="px-4 py-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {sectionTitle}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              {isLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-6 animate-spin text-primary" />
                </div>
              )}
              {!isLoading && displayList.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {query.trim() ? texts.noMatchingTasks : texts.noTasksLast30Days}
                </p>
              )}
              {!isLoading && displayList.length > 0 && (
                <div className="space-y-1">
                  {displayList.map((conv) => (
                    <button
                      key={conv.uniqueId}
                      onClick={() => handleSelect(conv.uniqueId)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left",
                        "hover:bg-muted/70 transition-colors"
                      )}
                    >
                      <div className="shrink-0 w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
                        <MessageSquarePlus className="size-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{conv.title}</div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {formatRelativeTime(conv.updatedAt, texts)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
