import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { StandingSection } from "@/components/meeting/MeetingSections";
import { NotesField } from "@/components/meeting/MeetingSections";
import type { FormSubmissionsResponse } from "@/lib/pco-forms.functions";

type Fetcher = (args: { data: { meetingId: string } }) => Promise<FormSubmissionsResponse>;

export function PcoFormSection({
  meetingId,
  sectionKey,
  title,
  subtitle,
  fetcher,
}: {
  meetingId: string;
  sectionKey: string;
  title: string;
  subtitle: string;
  fetcher: Fetcher;
}) {
  const run = useServerFn(fetcher as any) as unknown as Fetcher;
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["pco-form-submissions", sectionKey, meetingId],
    queryFn: () => run({ data: { meetingId } }),
    staleTime: 60_000,
  });

  const count = data?.submissions.length ?? 0;
  const sinceLabel = data?.sinceLabel;

  return (
    <StandingSection
      title={title}
      subtitle={subtitle}
      defaultOpen={false}
      badge={
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
          {isLoading ? "…" : `${count} new`}
        </span>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={data?.formUrl ?? "https://people.planningcenteronline.com/forms"} target="_blank" rel="noreferrer">
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              Open form in PCO
            </a>
          </Button>
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
            No new submissions since the last meeting.
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
                    {s.person?.name ?? "Anonymous"}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{s.created_at ? format(new Date(s.created_at), "EEE MMM d, p") : ""}</span>
                    <a
                      href={`https://people.planningcenteronline.com/forms/${data!.formId}/responses/${s.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" /> Open
                    </a>
                  </div>
                </div>
                {s.fields.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">No field data returned.</div>
                ) : (
                  <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
                    {s.fields.map((f, i) => (
                      <div key={i} className="contents">
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground pt-0.5">
                          {f.label}
                        </dt>
                        <dd className="whitespace-pre-wrap break-words">
                          {f.value || <span className="text-muted-foreground italic">—</span>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}

        <NotesField meetingId={meetingId} sectionKey={sectionKey} placeholder="Submissions reviewed, follow-ups…" />
      </div>
    </StandingSection>
  );
}

function formatSinceLabel(label: string): string {
  // label is YYYY-MM-DD
  try {
    return format(new Date(`${label}T12:00:00`), "EEE MMM d");
  } catch {
    return label;
  }
}
