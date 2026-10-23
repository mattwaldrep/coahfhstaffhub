export const PCO_STAFF_ROLES = ['core', 'meeting', 'extended', 'calendar_admin', 'serve_leader_admin'];
export const PCO_EDITOR_ROLES = ['core', 'meeting', 'calendar_admin', 'serve_leader_admin'];
export function canEditPcoChecklist(roles: string[]) {
  return roles.some(role => PCO_EDITOR_ROLES.includes(role));
}
export function canPushPcoTask(roles: string[], caller: string, assignee: string) {
  return canEditPcoChecklist(roles) || (PCO_STAFF_ROLES.some(role => roles.includes(role)) && caller === assignee);
}
export function pcoTaskFields(event: { name: string; starts_at: string; instance_id: string }, label: string) {
  const date = new Date(event.starts_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: '2-digit', day: '2-digit', year: 'numeric' });
  return {
    title: `${event.name} (${date}) — ${label}`,
    notes: `Event: ${event.name}\nOpen in Staff Hub: https://coahfhstaffhub.lovable.app/calendar/pco?instance=${encodeURIComponent(event.instance_id)}&month=${event.starts_at.slice(0, 7)}`,
  };
}