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
} from "@/lib/onboarding.functions";
import {
  assignOnboardingTask,
  unassignOnboardingTask,
  listAssignableUsers,
} from "@/lib/onboarding-tasks.functions";
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
  UserPlus,
  UserMinus,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-workflow", workflowId],
    queryFn: () => getFn({ data: { id: workflowId } }),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["onboarding-workflow", workflowId] });

  const tree = useMemo(() => buildTree(data?.tasks ?? []), [data?.tasks]);
  const sectionOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    (data?.tasks ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .forEach((t: any) => {
        if (!t.parent_task_id && !seen.has(t.section_name)) {
          seen.add(t.section_name);
          order.push(t.section_name);
        }
      });
    return order;
  }, [data?.tasks]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

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
                  {section}
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
  );
}

function TaskRow({
  node,
  depth,
  collapsed,
  toggle,
  isCore,
  onComplete,
  onSkip,
  onAdd,
  onDelete,
}: {
  node: TaskNode;
  depth: number;
  collapsed: Record<string, boolean>;
  toggle: (id: string) => void;
  isCore: boolean;
  onComplete: (id: string, completed: boolean) => void;
  onSkip: (id: string, skipped: boolean) => void;
  onAdd: (parentId: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isCol = collapsed[node.id];

  // Tri-state derived from leaf children
  const leaves = hasChildren ? flatLeaves([node]) : [node];
  const counted = leaves.filter((l) => !l.is_skipped);
  const allDone = counted.length > 0 && counted.every((l) => l.is_completed);
  const someDone = counted.some((l) => l.is_completed) && !allDone;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 group",
          node.is_skipped && "opacity-50",
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
        </div>

        {isCore && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => onSkip(node.id, !node.is_skipped)}
              title={node.is_skipped ? "Unskip" : "Skip"}
            >
              {node.is_skipped ? <Undo2 className="w-3.5 h-3.5" /> : <SkipForward className="w-3.5 h-3.5" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
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
              onComplete={onComplete}
              onSkip={onSkip}
              onAdd={onAdd}
              onDelete={onDelete}
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
