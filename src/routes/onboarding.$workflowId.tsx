import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getWorkflow,
  setTaskCompleted,
  setTaskSkipped,
  addAdHocTask,
  setWorkflowStatus,
  deleteTask,
  updateTask,
} from "@/lib/onboarding.functions";
import {
  assignOnboardingTask,
  unassignOnboardingTask,
  listAssignableUsers,
} from "@/lib/onboarding-tasks.functions";
import {
  listOnboardingComments,
  addOnboardingComment,
  deleteOnboardingComment,
  type OnboardingComment,
} from "@/lib/onboarding-comments.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Plus,
  SkipForward,
  Undo2,
  MoreVertical,
  Trash2,
  Pencil,
  UserPlus,
  UserMinus,
  CheckCircle2,
  MessageSquare,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/AppShell";
import { Switch } from "@/components/ui/switch";

type UserOption = { id: string; full_name: string | null; email: string | null };


export const Route = createFileRoute("/onboarding/$workflowId")({
  component: WorkflowDetail,
});

interface TaskNode {
  id: string;
  parent_task_id: string | null;
  section_name: string;
  task_name: string;
  description: string | null;
  is_completed: boolean;
  is_skipped: boolean;
  skipped_reason: string | null;
  sort_order: number;
  assignee_id: string | null;
  due_date: string | null;
  action_item_id: string | null;
  children: TaskNode[];
}


function buildTree(tasks: any[]): Map<string, TaskNode[]> {
  const byId = new Map<string, TaskNode>();
  tasks.forEach((t) => byId.set(t.id, { ...t, children: [] }));
  const rootsBySection = new Map<string, TaskNode[]>();
  byId.forEach((node) => {
    if (node.parent_task_id) {
      byId.get(node.parent_task_id)?.children.push(node);
    } else {
      const arr = rootsBySection.get(node.section_name) ?? [];
      arr.push(node);
      rootsBySection.set(node.section_name, arr);
    }
  });
  const sortRec = (nodes: TaskNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order);
    nodes.forEach((n) => sortRec(n.children));
  };
  rootsBySection.forEach((arr) => sortRec(arr));
  return rootsBySection;
}

function flatLeaves(nodes: TaskNode[], acc: TaskNode[] = []): TaskNode[] {
  for (const n of nodes) {
    if (n.children.length === 0) acc.push(n);
    else flatLeaves(n.children, acc);
  }
  return acc;
}

function flatAll(nodes: TaskNode[], acc: TaskNode[] = []): TaskNode[] {
  for (const n of nodes) {
    acc.push(n);
    if (n.children.length) flatAll(n.children, acc);
  }
  return acc;
}

function WorkflowDetail() {
  const { workflowId } = Route.useParams();
  const { hasRole } = useAuth();
  const isCore = hasRole("core");
  const qc = useQueryClient();
  const getFn = useServerFn(getWorkflow);
  const completeFn = useServerFn(setTaskCompleted);
  const skipFn = useServerFn(setTaskSkipped);
  const addFn = useServerFn(addAdHocTask);
  const statusFn = useServerFn(setWorkflowStatus);
  const delFn = useServerFn(deleteTask);
  const updateFn = useServerFn(updateTask);
  const assignFn = useServerFn(assignOnboardingTask);
  const unassignFn = useServerFn(unassignOnboardingTask);
  const listUsersFn = useServerFn(listAssignableUsers);
  const listCommentsFn = useServerFn(listOnboardingComments);
  const addCommentFn = useServerFn(addOnboardingComment);
  const deleteCommentFn = useServerFn(deleteOnboardingComment);
  const { user } = useAuth();

  const { data: assignableUsers = [] } = useQuery<UserOption[]>({
    queryKey: ["assignable-users"],
    queryFn: () => listUsersFn(),
    staleTime: 5 * 60 * 1000,
  });


  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-workflow", workflowId],
    queryFn: () => getFn({ data: { id: workflowId } }),
  });

  const { data: comments = [] } = useQuery<OnboardingComment[]>({
    queryKey: ["onboarding-comments", workflowId],
    queryFn: () => listCommentsFn({ data: { workflowId } }),
  });

  const commentsByTask = useMemo(() => {
    const m = new Map<string, OnboardingComment[]>();
    for (const c of comments) {
      const arr = m.get(c.task_id) ?? [];
      arr.push(c);
      m.set(c.task_id, arr);
    }
    return m;
  }, [comments]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["onboarding-workflow", workflowId] });
  const invalidateComments = () =>
    qc.invalidateQueries({ queryKey: ["onboarding-comments", workflowId] });

  const tree = useMemo(() => buildTree(data?.tasks ?? []), [data?.tasks]);
  const sectionOrder = useMemo(() => {
    const firstSeen = new Map<string, string>(); // section -> earliest created_at
    (data?.tasks ?? []).forEach((t: any) => {
      if (t.parent_task_id) return;
      const prev = firstSeen.get(t.section_name);
      if (!prev || t.created_at < prev) firstSeen.set(t.section_name, t.created_at);
    });
    return Array.from(firstSeen.entries())
      .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
      .map(([s]) => s);
  }, [data?.tasks]);


  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  const [showAllComments, setShowAllComments] = useState(false);

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!data) return null;

  const allRoots = sectionOrder.flatMap((s) => tree.get(s) ?? []);
  const leaves = flatLeaves(allRoots);
  const counted = leaves.filter((l) => !l.is_skipped);
  const done = counted.filter((l) => l.is_completed).length;
  const skippedCount = leaves.length - counted.length;
  const pct = counted.length ? Math.round((done / counted.length) * 100) : 0;

  const w = data.workflow;

  return (
    <AppShell>
    <div className="container mx-auto py-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/onboarding">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-2xl">{w.new_hire_name}</CardTitle>
              <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="capitalize">
                  {w.hire_type}
                </Badge>
                <span>·</span>
                <span>{w.start_date ? `Start: ${w.start_date}` : "No start date"}</span>
                <span>·</span>
                <Badge variant="outline" className="capitalize">
                  {w.status}
                </Badge>
              </div>
            </div>
            {isCore && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Status
                    <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(["active", "paused", "completed", "archived"] as const).map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onClick={async () => {
                        await statusFn({ data: { id: workflowId, status: s } });
                        invalidate();
                        toast.success(`Marked ${s}`);
                      }}
                      className="capitalize"
                    >
                      {s}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={pct} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>
              {done} / {counted.length} tasks complete ({pct}%)
            </span>
            {skippedCount > 0 && <span>{skippedCount} skipped</span>}
          </div>
        </CardContent>
      </Card>

      {skippedCount > 0 && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <SkipForward className="w-4 h-4" />
              Skipped tasks ({skippedCount})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {leaves
              .filter((l) => l.is_skipped)
              .map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-2 text-sm py-1 px-2 rounded hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <span className="line-through text-muted-foreground">{l.task_name}</span>
                    <span className="text-xs text-muted-foreground ml-2">· {l.section_name}</span>
                    {l.skipped_reason && (
                      <span className="ml-2 text-xs text-muted-foreground italic">
                        ({l.skipped_reason})
                      </span>
                    )}
                  </div>
                  {isCore && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={async () => {
                        await skipFn({ data: { task_id: l.id, skipped: false } });
                        invalidate();
                      }}
                    >
                      <Undo2 className="w-3.5 h-3.5 mr-1" />
                      <span className="text-xs">Undo</span>
                    </Button>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>
      )}


      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground">Show all comments</span>
        <Switch
          checked={showAllComments}
          onCheckedChange={setShowAllComments}
          aria-label="Toggle all comments"
        />
      </div>

      <div className="space-y-4">
        {sectionOrder.map((section) => {
          const roots = tree.get(section) ?? [];
          const secKey = `sec:${section}`;
          const isCol = collapsed[secKey];
          return (
            <Card key={section}>
              <CardHeader
                className="pb-2 cursor-pointer select-none"
                onClick={() => toggle(secKey)}
              >
                <CardTitle className="text-base flex items-center gap-2">
                  {isCol ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  <span className="flex-1">{section}</span>
                  {isCore && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <Select
                        value=""
                        onValueChange={async (assigneeId) => {
                          const allNodes = flatAll(roots);
                          if (allNodes.length === 0) return;
                          toast.info(`Assigning ${allNodes.length} task(s)...`);
                          try {
                            await Promise.all(
                              allNodes.map((n) =>
                                assignFn({
                                  data: {
                                    onboardingTaskId: n.id,
                                    assigneeId,
                                    dueDate: n.due_date ?? null,
                                  },
                                }),
                              ),
                            );
                            toast.success("Section assigned");
                            invalidate();
                          } catch (e: any) {
                            toast.error(e?.message ?? "Failed to assign section");
                          }
                        }}
                      >
                        <SelectTrigger
                          className="h-7 w-[180px] text-xs font-normal"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SelectValue placeholder="Assign section to..." />
                        </SelectTrigger>
                        <SelectContent>
                          {assignableUsers.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name || u.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              {!isCol && (
                <CardContent className="space-y-1">
                  {roots.map((node) => (
                    <TaskRow
                      key={node.id}
                      node={node}
                      depth={0}
                      collapsed={collapsed}
                      toggle={toggle}
                      isCore={isCore}
                      assignableUsers={assignableUsers}
                      onComplete={async (id, completed) => {
                        await completeFn({ data: { task_id: id, completed } });
                        invalidate();
                      }}
                      onSkip={async (id, skipped) => {
                        await skipFn({ data: { task_id: id, skipped } });
                        invalidate();
                      }}
                      onAdd={async (parentId, name) => {
                        await addFn({
                          data: {
                            workflow_id: workflowId,
                            parent_task_id: parentId,
                            section_name: section,
                            task_name: name,
                          },
                        });
                        invalidate();
                      }}
                      onDelete={async (id) => {
                        await delFn({ data: { task_id: id } });
                        invalidate();
                      }}
                      onEdit={async (id, patch) => {
                        try {
                          await updateFn({ data: { task_id: id, ...patch } });
                          toast.success("Updated");
                          invalidate();
                        } catch (e: any) {
                          toast.error(e?.message ?? "Failed to update");
                        }
                      }}
                      onAssign={async (id, assigneeId, dueDate) => {
                        try {
                          await assignFn({
                            data: { onboardingTaskId: id, assigneeId, dueDate: dueDate ?? null },
                          });
                          toast.success("Assigned");
                          invalidate();
                        } catch (e: any) {
                          toast.error(e?.message ?? "Failed to assign");
                        }
                      }}
                      onUnassign={async (id) => {
                        try {
                          await unassignFn({ data: { onboardingTaskId: id } });
                          toast.success("Task removed");
                          invalidate();
                        } catch (e: any) {
                          toast.error(e?.message ?? "Failed");
                        }
                      }}
                      commentsByTask={commentsByTask}
                      currentUserId={user?.id ?? null}
                      onAddComment={async (taskId, body) => {
                        try {
                          await addCommentFn({ data: { taskId, body } });
                          invalidateComments();
                        } catch (e: any) {
                          toast.error(e?.message ?? "Failed to comment");
                        }
                      }}
                      showAllComments={showAllComments}
                      onDeleteComment={async (commentId) => {
                        try {
                          await deleteCommentFn({ data: { commentId } });
                          invalidateComments();
                        } catch (e: any) {
                          toast.error(e?.message ?? "Failed");
                        }
                      }}
                    />

                  ))}

                  {isCore && (
                    <AddInline
                      placeholder={`Add task to ${section}…`}
                      onAdd={async (name) => {
                        await addFn({
                          data: {
                            workflow_id: workflowId,
                            parent_task_id: null,
                            section_name: section,
                            task_name: name,
                          },
                        });
                        invalidate();
                      }}
                    />
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
    </AppShell>
  );
}

function TaskRow({
  node,
  depth,
  collapsed,
  toggle,
  isCore,
  assignableUsers,
  onComplete,
  onSkip,
  onAdd,
  onDelete,
  onAssign,
  onUnassign,
  commentsByTask,
  currentUserId,
  showAllComments,
  onAddComment,
  onDeleteComment,
}: {
  node: TaskNode;
  depth: number;
  collapsed: Record<string, boolean>;
  toggle: (id: string) => void;
  isCore: boolean;
  assignableUsers: UserOption[];
  onComplete: (id: string, completed: boolean) => void;
  onSkip: (id: string, skipped: boolean) => void;
  onAdd: (parentId: string, name: string) => void;
  onDelete: (id: string) => void;
  onAssign: (id: string, assigneeId: string, dueDate: string | null) => void;
  onUnassign: (id: string) => void;
  commentsByTask: Map<string, OnboardingComment[]>;
  currentUserId: string | null;
  showAllComments?: boolean;
  onAddComment: (taskId: string, body: string) => void | Promise<void>;
  onDeleteComment: (commentId: string) => void | Promise<void>;
}) {
  const taskComments = commentsByTask.get(node.id) ?? [];
  const [commentDraft, setCommentDraft] = useState("");
  const hasChildren = node.children.length > 0;
  const isCol = collapsed[node.id];

  // Tri-state derived from leaf children
  const leaves = hasChildren ? flatLeaves([node]) : [node];
  const counted = leaves.filter((l) => !l.is_skipped);
  const allDone = counted.length > 0 && counted.every((l) => l.is_completed);
  const someDone = counted.some((l) => l.is_completed) && !allDone;

  const assignee = assignableUsers.find((u) => u.id === node.assignee_id);
  const assigneeLabel = assignee?.full_name || assignee?.email || null;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 group",
          node.is_skipped && "opacity-60",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggle(node.id)}
            className="p-0.5 hover:bg-muted rounded"
            aria-label="Toggle"
          >
            {isCol ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        <Checkbox
          checked={hasChildren ? (allDone ? true : someDone ? "indeterminate" : false) : node.is_completed}
          disabled={node.is_skipped || (hasChildren && !isCore)}
          onCheckedChange={(v) => {
            if (hasChildren) return; // parents reflect children
            onComplete(node.id, !!v);
          }}
        />

        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "text-sm truncate",
              node.is_completed && !hasChildren && "line-through text-muted-foreground",
              node.is_skipped && "line-through",
            )}
          >
            {node.task_name}
            {node.is_skipped && node.skipped_reason && (
              <span className="ml-2 text-xs text-muted-foreground italic">
                ({node.skipped_reason})
              </span>
            )}
          </div>
          {node.description && (
            <div className="text-xs text-muted-foreground line-clamp-2">{node.description}</div>
          )}
          {(assigneeLabel || node.due_date || node.action_item_id) && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
              {assigneeLabel && <span>👤 {assigneeLabel}</span>}
              {node.due_date && <span>📅 {node.due_date}</span>}
              {node.action_item_id && (
                <span title="Synced as a task" className="inline-flex items-center gap-0.5">
                  <CheckCircle2 className="w-3 h-3" /> task
                </span>
              )}
            </div>
          )}
        </div>

        {!showAllComments && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-2 gap-1",
                  taskComments.length === 0 && "opacity-0 group-hover:opacity-100 transition-opacity",
                )}
                title="Comments"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {taskComments.length > 0 && (
                  <span className="text-xs">{taskComments.length}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3 space-y-3" align="end">
              <div className="text-xs font-medium">Comments</div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {taskComments.length === 0 && (
                  <div className="text-xs text-muted-foreground italic">No comments yet.</div>
                )}
                {taskComments.map((c) => (
                  <div key={c.id} className="text-xs border-l-2 border-muted pl-2 group/comment">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {c.author_name || c.author_email || "Unknown"}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(c.created_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap mt-0.5">{c.body}</div>
                    {currentUserId === c.author_id && (
                      <button
                        type="button"
                        className="text-[10px] text-muted-foreground hover:text-destructive opacity-0 group-hover/comment:opacity-100 transition-opacity"
                        onClick={() => onDeleteComment(c.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Textarea
                  rows={2}
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="Add a comment…"
                  className="text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && commentDraft.trim()) {
                      e.preventDefault();
                      onAddComment(node.id, commentDraft.trim());
                      setCommentDraft("");
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="h-auto"
                  disabled={!commentDraft.trim()}
                  onClick={() => {
                    if (!commentDraft.trim()) return;
                    onAddComment(node.id, commentDraft.trim());
                    setCommentDraft("");
                  }}
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}

        {isCore && (
          <div className="flex items-center gap-1">
            {/* Skip / Unskip — always visible when skipped so it's easy to undo */}
            <Button
              variant={node.is_skipped ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-7 px-2",
                !node.is_skipped && "opacity-0 group-hover:opacity-100 transition-opacity",
              )}
              onClick={() => onSkip(node.id, !node.is_skipped)}
              title={node.is_skipped ? "Undo skip" : "Skip task"}
            >
              {node.is_skipped ? (
                <>
                  <Undo2 className="w-3.5 h-3.5 mr-1" />
                  <span className="text-xs">Undo skip</span>
                </>
              ) : (
                <SkipForward className="w-3.5 h-3.5" />
              )}
            </Button>

            {!hasChildren && !node.is_skipped && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 px-2",
                      !node.assignee_id && "opacity-0 group-hover:opacity-100 transition-opacity",
                    )}
                    title={node.assignee_id ? "Reassign" : "Assign to user"}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2 space-y-2" align="end">
                  <div className="text-xs font-medium px-1">Assign onboarding task</div>
                  <Select
                    value={node.assignee_id ?? ""}
                    onValueChange={(uid) =>
                      onAssign(node.id, uid, node.due_date ?? null)
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Pick a user…" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={node.due_date ?? ""}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      if (node.assignee_id) onAssign(node.id, node.assignee_id, v);
                    }}
                    disabled={!node.assignee_id}
                    className="h-8"
                    placeholder="Due date"
                  />
                  {node.action_item_id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-muted-foreground"
                      onClick={() => onUnassign(node.id)}
                    >
                      <UserMinus className="w-3.5 h-3.5 mr-1.5" /> Unassign
                    </Button>
                  )}
                  <div className="text-[10px] text-muted-foreground px-1">
                    Task title includes the new hire's name so it makes sense in Google Tasks.
                  </div>
                </PopoverContent>
              </Popover>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onDelete(node.id)} className="text-destructive">
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {showAllComments && (
        <div
          className="space-y-2 py-2 px-3 border-t border-dashed border-muted"
          style={{ paddingLeft: `${depth * 16 + 24}px` }}
        >
          <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
            <MessageSquare className="w-3 h-3" />
            Comments
            {taskComments.length > 0 && (
              <span className="text-[10px] bg-muted rounded-full px-1.5">{taskComments.length}</span>
            )}
          </div>
          <div className="space-y-2">
            {taskComments.length === 0 && (
              <div className="text-xs text-muted-foreground italic">No comments yet.</div>
            )}
            {taskComments.map((c) => (
              <div key={c.id} className="text-xs border-l-2 border-muted pl-2 group/comment">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {c.author_name || c.author_email || "Unknown"}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(c.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="whitespace-pre-wrap mt-0.5">{c.body}</div>
                {currentUserId === c.author_id && (
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-destructive opacity-0 group-hover/comment:opacity-100 transition-opacity"
                    onClick={() => onDeleteComment(c.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Textarea
              rows={2}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder="Add a comment…"
              className="text-sm min-h-0"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && commentDraft.trim()) {
                  e.preventDefault();
                  onAddComment(node.id, commentDraft.trim());
                  setCommentDraft("");
                }
              }}
            />
            <Button
              size="sm"
              className="h-auto"
              disabled={!commentDraft.trim()}
              onClick={() => {
                if (!commentDraft.trim()) return;
                onAddComment(node.id, commentDraft.trim());
                setCommentDraft("");
              }}
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {hasChildren && !isCol && (
        <div>
          {node.children.map((c) => (
            <TaskRow
              key={c.id}
              node={c}
              depth={depth + 1}
              collapsed={collapsed}
              toggle={toggle}
              isCore={isCore}
              assignableUsers={assignableUsers}
              onComplete={onComplete}
              onSkip={onSkip}
              onAdd={onAdd}
              onDelete={onDelete}
              onAssign={onAssign}
              onUnassign={onUnassign}
              commentsByTask={commentsByTask}
              currentUserId={currentUserId}
              showAllComments={showAllComments}
              onAddComment={onAddComment}
              onDeleteComment={onDeleteComment}
            />


          ))}
          {isCore && (
            <div style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }} className="pr-2">
              <AddInline
                placeholder="Add subtask…"
                onAdd={(name) => onAdd(node.id, name)}
                compact
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddInline({
  placeholder,
  onAdd,
  compact,
}: {
  placeholder: string;
  onAdd: (name: string) => void | Promise<void>;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn("text-xs text-muted-foreground", compact && "h-7")}
        onClick={() => setOpen(true)}
      >
        <Plus className="w-3.5 h-3.5 mr-1" />
        {placeholder}
      </Button>
    );
  }
  return (
    <div className="flex gap-2 py-1">
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onAdd(value.trim());
            setValue("");
            setOpen(false);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        className="h-8 text-sm"
      />
      <Button
        size="sm"
        onClick={() => {
          if (value.trim()) {
            onAdd(value.trim());
            setValue("");
            setOpen(false);
          }
        }}
      >
        Add
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
