import { Link, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Home,
  CalendarDays,
  CalendarClock,
  ClipboardList,
  ClipboardCheck,
  Users,
  UserCog,
  Wallet,
  Settings as SettingsIcon,
  Crown,
  HeartHandshake,
  ScrollText,
  DoorOpen,
  Gavel,
  TrendingUp,
  GraduationCap,
  ListChecks,
  ChevronRight,
  UsersRound,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

type NavItem = {
  to?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  children?: NavItem[];
};

const ELDER_ITEMS: NavItem[] = [
  { to: "/elder", label: "Overview", icon: Crown, exact: true },
  { to: "/elder/meetings", label: "Meetings", icon: ClipboardList },
  { to: "/elder/motions", label: "Motions", icon: Gavel },
  { to: "/elder/pastoral-care", label: "Pastoral Care", icon: HeartHandshake },
  { to: "/elder/archive", label: "Archive", icon: ScrollText },
];

const CG_ITEMS: NavItem[] = [
  { to: "/cg-coaching", label: "Groups", icon: UsersRound, exact: true },
  { to: "/cg-coaching/settings", label: "Settings", icon: SettingsIcon },
];

export function AppSidebar() {
  const { hasRole, hasElderHubAccess, isDeaconOnly, isCgCoach } = useAuth();
  const isCore = hasRole("core");
  const elderItems = isDeaconOnly
    ? ELDER_ITEMS.filter((i) => i.to === "/elder/meetings")
    : ELDER_ITEMS;

  const PRIMARY: NavItem[] = [
    { to: "/", label: "Home", icon: Home, exact: true },
    {
      to: "/meeting",
      label: "Meeting",
      icon: ClipboardList,
      children: [
        { to: "/sunday-review", label: "Sunday Review", icon: ClipboardCheck },
      ],
    },
    {
      to: "/calendar",
      label: "Calendar",
      icon: CalendarDays,
      exact: true,
      children: [
        { to: "/calendar/planning", label: "Annual Planning", icon: CalendarClock },
        ...(isCore ? [{ to: "/calendar/classes", label: "Classes", icon: GraduationCap }] : []),
        ...(isCore ? [{ to: "/rooms", label: "Rooms", icon: DoorOpen }] : []),
        ...(isCore ? [{ to: "/checklists", label: "Checklists", icon: ListChecks }] : []),
      ],
    },
    { to: "/decisions", label: "Decisions", icon: Gavel },
    { to: "/trends", label: "Trends", icon: TrendingUp },
  ];

  const SECONDARY: NavItem[] = [
    { to: "/missions", label: "Missions", icon: Users },
    ...(isCore
      ? [
          {
            label: "People",
            icon: UsersRound,
            children: [
              { to: "/onboarding", label: "Onboarding", icon: GraduationCap },
              { to: "/users", label: "Users", icon: UserCog },
            ],
          } as NavItem,
        ]
      : []),
    ...(isCore ? [{ to: "/finance", label: "Finance", icon: Wallet }] : []),
    { to: "/settings", label: "Settings", icon: SettingsIcon },
  ];


  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  const childMatches = (item: NavItem): boolean =>
    !!item.children?.some((c) => (c.to ? isActive(c.to, c.exact) : false));

  const renderTree = (items: NavItem[]) => (
    <SidebarMenu>
      {items.map((item) => {
        const hasChildren = !!item.children?.length;
        const selfActive = item.to ? isActive(item.to, item.exact) : false;
        const branchActive = selfActive || childMatches(item);

        if (!hasChildren) {
          return (
            <SidebarMenuItem key={item.to ?? item.label}>
              <SidebarMenuButton asChild isActive={selfActive} tooltip={item.label}>
                <Link to={item.to!} className="flex items-center gap-2 text-inherit">
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        }

        return (
          <ParentItem
            key={item.to ?? item.label}
            item={item}
            collapsed={collapsed}
            selfActive={selfActive}
            branchActive={branchActive}
            isActive={isActive}
          />
        );
      })}
    </SidebarMenu>
  );

  return (
    <Sidebar
      collapsible="icon"
      className="[&_[data-sidebar=content]]:bg-sidebar [&_[data-sidebar=content]]:text-sidebar-foreground [&_[data-sidebar=group-label]]:text-sidebar-foreground/70 [&_[data-sidebar=menu-button]]:text-sidebar-foreground [&_[data-sidebar=menu-button][data-active=true]]:bg-sidebar-accent [&_[data-sidebar=menu-button][data-active=true]]:text-sidebar-accent-foreground [&_[data-sidebar=menu-button]:hover]:bg-sidebar-accent [&_[data-sidebar=menu-button]:hover]:text-sidebar-accent-foreground [&_[data-sidebar=menu-sub-button]]:text-sidebar-foreground/85 [&_[data-sidebar=menu-sub-button][data-active=true]]:bg-sidebar-accent [&_[data-sidebar=menu-sub-button][data-active=true]]:text-sidebar-accent-foreground [&_[data-sidebar=menu-sub-button]:hover]:bg-sidebar-accent [&_[data-sidebar=menu-sub-button]:hover]:text-sidebar-accent-foreground"
    >
      <SidebarHeader className="px-3 py-3 border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-2 font-display font-bold tracking-tight">
          <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-xs">
            CH
          </div>
          {!collapsed && <span className="whitespace-pre-line">COAH Forest Hills{"\n"}Leadership Hub</span>}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Staff Hub</SidebarGroupLabel>}
          <SidebarGroupContent>{renderTree(PRIMARY)}</SidebarGroupContent>
        </SidebarGroup>
        {hasElderAccess && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>Elder Hub</SidebarGroupLabel>}
            <SidebarGroupContent>{renderTree(ELDER_ITEMS)}</SidebarGroupContent>
          </SidebarGroup>
        )}
        {isCgCoach && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>CG Coaching</SidebarGroupLabel>}
            <SidebarGroupContent>{renderTree(CG_ITEMS)}</SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>More</SidebarGroupLabel>}
          <SidebarGroupContent>{renderTree(SECONDARY)}</SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function ParentItem({
  item,
  collapsed,
  selfActive,
  branchActive,
  isActive,
}: {
  item: NavItem;
  collapsed: boolean;
  selfActive: boolean;
  branchActive: boolean;
  isActive: (to: string, exact?: boolean) => boolean;
}) {
  const [open, setOpen] = useState(branchActive);
  useEffect(() => {
    if (branchActive) setOpen(true);
  }, [branchActive]);

  const showChildren = !collapsed && open;

  const ParentButton = item.to ? (
    <SidebarMenuButton asChild isActive={selfActive} tooltip={item.label}>
      <Link to={item.to} className="flex items-center gap-2 text-inherit">
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            <button
              type="button"
              aria-label={open ? "Collapse" : "Expand"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen((v) => !v);
              }}
              className="p-0.5 rounded hover:bg-sidebar-accent/60"
            >
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
              />
            </button>
          </>
        )}
      </Link>
    </SidebarMenuButton>
  ) : (
    <SidebarMenuButton
      tooltip={item.label}
      isActive={false}
      onClick={() => setOpen((v) => !v)}
      className="flex items-center gap-2"
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left">{item.label}</span>
          <ChevronRight
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
          />
        </>
      )}
    </SidebarMenuButton>
  );

  return (
    <SidebarMenuItem>
      {ParentButton}
      {showChildren && (
        <SidebarMenuSub>
          {item.children!.map((child) => (
            <SidebarMenuSubItem key={child.to}>
              <SidebarMenuSubButton asChild isActive={child.to ? isActive(child.to, child.exact) : false}>
                <Link to={child.to!} className="flex items-center gap-2 text-inherit">
                  <child.icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{child.label}</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}
