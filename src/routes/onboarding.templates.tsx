import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Plus,
  Pencil,
  ArrowUp,
  ArrowDown,
  Power,
  PowerOff,
} from "lucide-react";
import {
  listTemplate,
  upsertTemplateNode,
  setTemplateActive,
  reorderTemplateNode,
} from "@/lib/onboarding.functions";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/onboarding/templates")({
  component: TemplateEditor,
});

interface TplNode {
  id: string;
  parent_id: string | null;
  section_name: string;
  task_name: string;
  description: string | null;
  is_onsite_only: boolean;
  is_active: boolean;
  sort_order: number;
  children: TplNode[];
}

function TemplateEditor() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listTemplate);
  const upsertFn = useServerFn(upsertTemplateNode);
  const activeFn = useServerFn(setTemplateActive);
  const reorderFn = useServerFn(reorderTemplateNode);

  useEffect(() => {
    if (!hasRole("core")) navigate({ to: "/onboarding" });
  }, [hasRole, navigate]);

  const { data: nodes = [] } = useQuery({
    queryKey: ["onboarding-templates"],
    queryFn: () => listFn(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["onboarding-templates"] });

  const { rootsBySection, sectionOrder } = useMemo(() => {
    const byId = new Map<string, TplNode>();
    nodes.forEach((n: any) => byId.set(n.id, { ...n, children: [] }));
    const rootsBySection = new Map<string, TplNode[]>();
    const sectionOrder: string[] = [];
    const seen = new Set<string>();
    byId.forEach((n) => {
      if (n.parent_id) byId.get(n.parent_id)?.children.push(n);
      else {
        const arr = rootsBySection.get(n.section_name) ?? [];
        arr.push(n);
        rootsBySection.set(n.section_name, arr);
      }
    });
    const sortRec = (arr: TplNode[]) => {
      arr.sort((a, b) => a.sort_order - b.sort_order);
      arr.forEach((c) => sortRec(c.children));
    };
    rootsBySection.forEach((arr) => sortRec(arr));
    nodes
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .forEach((n: any) => {
        if (!n.parent_id && !seen.has(n.section_name)) {
          seen.add(n.section_name);
          sectionOrder.push(n.section_name);
        }
      });
    return { rootsBySection, sectionOrder };
  }, [nodes]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  const [showInactive, setShowInactive] = useState(true);

  // Dialog state for create/edit
  const [dialog, setDialog] = useState<{
    mode: "create" | "edit";
    id?: string;
    parent_id: string | null;
    section_name: string;
    task_name: string;
    description: string;
    is_onsite_only: boolean;
  } | null>(null);

  const [newSection, setNewSection] = useState("");

  const openCreate = (parent: TplNode | null, section: string) =>
    setDialog({
      mode: "create",
      parent_id: parent?.id ?? null,
      section_name: section,
      task_name: "",
      description: "",
      is_onsite_only: parent?.is_onsite_only ?? false,
    });

  const openEdit = (n: TplNode) =>
    setDialog({
      mode: "edit",
      id: n.id,
      parent_id: n.parent_id,
      section_name: n.section_name,
      task_name: n.task_name,
      description: n.description ?? "",
      is_onsite_only: n.is_onsite_only,
    });

  const save = async () => {
    if (!dialog || !dialog.task_name.trim()) return;
    try {
      await upsertFn({
        data: {
          id: dialog.id,
          parent_id: dialog.parent_id,
          section_name: dialog.section_name,
          task_name: dialog.task_name.trim(),
          description: dialog.description.trim() || null,
          is_onsite_only: dialog.is_onsite_only,
        },
      });
      toast.success("Saved");
      setDialog(null);
      invalidate();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

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

      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold">Master Template</h1>
          <p className="text-sm text-muted-foreground">
            Edits here apply to <strong>future</strong> onboarding launches. Active in-flight tracks are not affected.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs flex items-center gap-2">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Show inactive
          </Label>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Add new section</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            placeholder="Section name (e.g. Day 5)"
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
          />
          <Button
            onClick={() => {
              if (!newSection.trim()) return;
              setDialog({
                mode: "create",
                parent_id: null,
                section_name: newSection.trim(),
                task_name: "",
                description: "",
                is_onsite_only: false,
              });
              setNewSection("");
            }}
          >
            <Plus className="w-4 h-4 mr-1" /> Add task in section
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {sectionOrder.map((section) => {
          const roots = (rootsBySection.get(section) ?? []).filter(
            (n) => showInactive || n.is_active,
          );
          return (
            <Card key={section}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base">{section}</CardTitle>
                <Button size="sm" variant="outline" onClick={() => openCreate(null, section)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Task
                </Button>
              </CardHeader>
              <CardContent className="space-y-1">
                {roots.map((n) => (
                  <TplRow
                    key={n.id}
                    node={n}
                    depth={0}
                    collapsed={collapsed}
                    toggle={toggle}
                    showInactive={showInactive}
                    onEdit={openEdit}
                    onAddChild={(parent) => openCreate(parent, section)}
                    onToggleActive={async (id, val) => {
                      await activeFn({ data: { id, is_active: val } });
                      invalidate();
                    }}
                    onReorder={async (id, dir) => {
                      await reorderFn({ data: { id, direction: dir } });
                      invalidate();
                    }}
                  />
                ))}
                {roots.length === 0 && (
                  <div className="text-xs text-muted-foreground italic px-2 py-1">
                    No tasks in this section.
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit" ? "Edit task" : "Add task"} — {dialog?.section_name}
            </DialogTitle>
          </DialogHeader>
          {dialog && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Task name</Label>
                <Input
                  value={dialog.task_name}
                  onChange={(e) => setDialog({ ...dialog, task_name: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  rows={3}
                  value={dialog.description}
                  onChange={(e) => setDialog({ ...dialog, description: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">On-site only (auto-skip for remote hires)</Label>
                <Switch
                  checked={dialog.is_onsite_only}
                  onCheckedChange={(v) => setDialog({ ...dialog, is_onsite_only: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AppShell>
  );
}

function TplRow({
  node,
  depth,
  collapsed,
  toggle,
  showInactive,
  onEdit,
  onAddChild,
  onToggleActive,
  onReorder,
}: {
  node: TplNode;
  depth: number;
  collapsed: Record<string, boolean>;
  toggle: (id: string) => void;
  showInactive: boolean;
  onEdit: (n: TplNode) => void;
  onAddChild: (parent: TplNode) => void;
  onToggleActive: (id: string, val: boolean) => void;
  onReorder: (id: string, dir: "up" | "down") => void;
}) {
  const visibleChildren = node.children.filter((c) => showInactive || c.is_active);
  const hasChildren = visibleChildren.length > 0;
  const isCol = collapsed[node.id];

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 group",
          !node.is_active && "opacity-50",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggle(node.id)}
            className="p-0.5 hover:bg-muted rounded"
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
        <div className="flex-1 min-w-0">
          <div className="text-sm flex items-center gap-2">
            <span className="truncate">{node.task_name}</span>
            {node.is_onsite_only && (
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                On-site
              </Badge>
            )}
            {!node.is_active && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                Inactive
              </Badge>
            )}
          </div>
          {node.description && (
            <div className="text-xs text-muted-foreground line-clamp-1">{node.description}</div>
          )}
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onReorder(node.id, "up")} title="Move up">
            <ArrowUp className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onReorder(node.id, "down")} title="Move down">
            <ArrowDown className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onAddChild(node)} title="Add subtask">
            <Plus className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(node)} title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onToggleActive(node.id, !node.is_active)}
            title={node.is_active ? "Deactivate" : "Reactivate"}
          >
            {node.is_active ? (
              <PowerOff className="w-3.5 h-3.5" />
            ) : (
              <Power className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>
      {hasChildren && !isCol && (
        <div>
          {visibleChildren.map((c) => (
            <TplRow
              key={c.id}
              node={c}
              depth={depth + 1}
              collapsed={collapsed}
              toggle={toggle}
              showInactive={showInactive}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onToggleActive={onToggleActive}
              onReorder={onReorder}
            />
          ))}
        </div>
      )}
    </div>
  );
}
