import { Link, useRouterState } from "@tanstack/react-router";
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
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Home,
  CalendarDays,
  ClipboardList,
  ClipboardCheck,
  Users,
  UserCog,
  Wallet,
  Settings as SettingsIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const PRIMARY = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/meeting", label: "Meeting", icon: ClipboardList },
  { to: "/sunday-review", label: "Sunday Review", icon: ClipboardCheck },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
];

export function AppSidebar() {
  const { hasRole } = useAuth();
  const SECONDARY = [
    { to: "/missions", label: "Missions", icon: Users },
    ...(hasRole("core") ? [{ to: "/finance", label: "Finance", icon: Wallet }] : []),
    ...(hasRole("core") ? [{ to: "/users", label: "Users", icon: UserCog }] : []),
    { to: "/settings", label: "Settings", icon: SettingsIcon },
  ];
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  const renderItems = (items: typeof PRIMARY) => (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.to}>
          <SidebarMenuButton asChild isActive={isActive(item.to, item.exact)} tooltip={item.label}>
            <Link to={item.to} className="flex items-center gap-2 text-inherit">
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  return (
    <Sidebar
      collapsible="icon"
      className="[&_[data-sidebar=content]]:bg-sidebar [&_[data-sidebar=content]]:text-sidebar-foreground [&_[data-sidebar=group-label]]:text-sidebar-foreground/70 [&_[data-sidebar=menu-button]]:text-sidebar-foreground [&_[data-sidebar=menu-button][data-active=true]]:bg-sidebar-accent [&_[data-sidebar=menu-button][data-active=true]]:text-sidebar-accent-foreground [&_[data-sidebar=menu-button]:hover]:bg-sidebar-accent [&_[data-sidebar=menu-button]:hover]:text-sidebar-accent-foreground"
    >
      <SidebarHeader className="px-3 py-3 border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-2 font-display font-bold tracking-tight">
          <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-xs">
            CH
          </div>
          {!collapsed && <span>COAH Forest Hills Staff Hub</span>}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Workspace</SidebarGroupLabel>}
          <SidebarGroupContent>{renderItems(PRIMARY)}</SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>More</SidebarGroupLabel>}
          <SidebarGroupContent>{renderItems(SECONDARY)}</SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
