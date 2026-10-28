import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { StandingSection, NotesField } from "@/components/meeting/MeetingSections";
import type { ConnectCardsResponse } from "@/lib/connect-cards.functions";

type Fetcher = (args: { data: { meetingId: string } }) => Promise<ConnectCardsResponse>;

export function ConnectCardsSection({
  meetingId,
  fetcher,
}: {
  meetingId: string;
  fetcher: Fetcher;
}) {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["connect-card-submissions", meetingId],
    queryFn: () => fetcher({ data: { meetingId } }),
    staleTime: 60_000,
  });

  const count = data?.submissions.length ?? 0;
  const sinceLabel = data?.sinceLabel;

  return (
    <StandingSection
      title="Connect Cards (Physical)"
      subtitle="Scanned connect cards uploaded by the connect table greeter in Sunday Ops."
      defaultOpen={false}
      badge={
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
          {isLoading ? "…" : `${count} new`}
        </span>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            Refresh
          </Button>
          {sinceLabel ? (
            <span className="text-xs text-muted-foreground">
              Since {formatSinceLabel(sinceLabel)}
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading submissions…
          </div>
        ) : isError ? (
          <div className="text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {(error as Error)?.message ?? "Failed to load submissions."}
          </div>
        ) : data?.error ? (
          <div className="text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {data.error}
          </div>
        ) : count === 0 ? (
          <div className="text-sm text-muted-foreground">
            No connect cards uploaded since the last meeting.
          </div>
        ) : (
          <ul className="space-y-2">
            {data!.submissions.map((s) => (
              <li
                key={s.id}
                className="rounded-md border border-border bg-card p-3 space-y-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm font-medium">
                    {s.submitted_by ?? "Connect table"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s.created_at ? format(new Date(s.created_at), "EEE MMM d, p") : ""}
                  </div>
                </div>

                {s.photos.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {s.photos.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-md border border-border overflow-hidden hover:opacity-90 transition-opacity"
                      >
                        <img
                          src={url}
                          alt={`Connect card scan ${i + 1}`}
                          className="h-28 w-28 object-cover"
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5" /> No photo attached.
                  </div>
                )}

                {s.fields.length > 0 && (
                  <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
                    {s.fields.map((f, i) => (
                      <div key={i} className="contents">
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground pt-0.5">
                          {f.label}
                        </dt>
                        <dd className="whitespace-pre-wrap break-words">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}

        <NotesField meetingId={meetingId} sectionKey="connect_cards" placeholder="Cards reviewed, follow-ups assigned…" />
      </div>
    </StandingSection>
  );
}

function formatSinceLabel(label: string): string {
  try {
    return format(new Date(`${label}T12:00:00`), "EEE MMM d");
  } catch {
    return label;
  }
}
