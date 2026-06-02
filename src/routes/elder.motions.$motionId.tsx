import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getMotion, castVote, closeMotion } from "@/lib/elder-motions.functions";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Check, X, MinusCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/elder/motions/$motionId")({ component: MotionDetail });

type Choice = "yes" | "no" | "abstain";

function MotionDetail() {
  const { motionId } = Route.useParams();
  const { isFullElder, user } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof getMotion>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState<Choice | null>(null);

  async function load() {
    setLoading(true);
    try {
      const d = await getMotion({ data: { id: motionId } });
      setData(d);
      const mine = d.votes.find((v) => v.voter_id === user?.id);
      setComment(mine?.comment ?? "");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [motionId, user?.id]);

  async function vote(choice: Choice) {
    if (!data) return;
    setSubmitting(choice);
    try {
      await castVote({ data: { motion_id: motionId, choice, comment } });
      toast.success(`Vote recorded: ${choice}`);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Vote failed");
    } finally {
      setSubmitting(null);
    }
  }

  async function close() {
    if (!confirm("Close this motion now? An email recap will be sent.")) return;
    try {
      await closeMotion({ data: { id: motionId } });
      toast.success("Motion closed");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to close");
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Not found.</p>;

  const { motion, votes, created_by_name } = data;
  const deadline = new Date(motion.deadline_at);
  const isOpen = !motion.closed_at;
  const myVote = votes.find((v) => v.voter_id === user?.id);
  const tally = {
    yes: votes.filter((v) => v.choice === "yes").length,
    no: votes.filter((v) => v.choice === "no").length,
    abstain: votes.filter((v) => v.choice === "abstain").length,
  };

  return (
    <div className="space-y-6">
      <Link to="/elder/motions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to motions
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-display font-semibold">{motion.title}</h2>
          {isOpen ? (
            <Badge variant="outline" className="bg-amber-500/15 text-amber-700 border-amber-500/30">Open</Badge>
          ) : (
            <Badge variant="outline" className={
              motion.outcome === "passed" ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
              : motion.outcome === "failed" ? "bg-destructive/15 text-destructive border-destructive/30"
              : "bg-muted text-muted-foreground border-border"
            }>{motion.outcome}</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Opened by {created_by_name || "—"} ·{" "}
          {isOpen
            ? `closes ${formatDistanceToNow(deadline, { addSuffix: true })} (${deadline.toLocaleString()})`
            : `closed ${formatDistanceToNow(new Date(motion.closed_at!), { addSuffix: true })}`}
        </p>
        {motion.description && (
          <p className="text-sm whitespace-pre-wrap mt-2">{motion.description}</p>
        )}
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Tally</CardTitle>
          <div className="text-sm font-mono">
            <span className="text-emerald-600">{tally.yes} yes</span>
            {" · "}
            <span className="text-destructive">{tally.no} no</span>
            {" · "}
            <span className="text-muted-foreground">{tally.abstain} abst.</span>
          </div>
        </CardHeader>
        {isOpen && isFullElder && (
          <CardContent className="space-y-3">
            <Textarea
              placeholder="Optional comment with your vote…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => vote("yes")} disabled={!!submitting}
                variant={myVote?.choice === "yes" ? "default" : "outline"}>
                <Check className="w-4 h-4 mr-1" /> Yes
              </Button>
              <Button onClick={() => vote("no")} disabled={!!submitting}
                variant={myVote?.choice === "no" ? "default" : "outline"}>
                <X className="w-4 h-4 mr-1" /> No
              </Button>
              <Button onClick={() => vote("abstain")} disabled={!!submitting}
                variant={myVote?.choice === "abstain" ? "default" : "outline"}>
                <MinusCircle className="w-4 h-4 mr-1" /> Abstain
              </Button>
              <div className="ml-auto">
                <Button variant="ghost" onClick={close}>Close motion now</Button>
              </div>
            </div>
            {myVote && (
              <p className="text-xs text-muted-foreground">
                Your current vote: <strong>{myVote.choice}</strong> · you can change it until the motion closes.
              </p>
            )}
          </CardContent>
        )}
        {isOpen && !isFullElder && (
          <CardContent>
            <p className="text-sm text-muted-foreground">Elder candidates can view but not vote on motions.</p>
          </CardContent>
        )}
      </Card>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Votes</h3>
        {votes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No votes yet.</p>
        ) : (
          <ul className="space-y-2">
            {votes.map((v) => (
              <li key={v.voter_id} className="border rounded-md p-3 bg-card">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm">
                    <span className="font-medium">{v.voter_name || "—"}</span>
                    <Badge variant="outline" className={
                      "ml-2 " + (v.choice === "yes" ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                        : v.choice === "no" ? "bg-destructive/15 text-destructive border-destructive/30"
                        : "bg-muted text-muted-foreground border-border")
                    }>
                      {v.choice}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(v.updated_at ?? v.voted_at), { addSuffix: true })}
                  </span>
                </div>
                {v.comment && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{v.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
