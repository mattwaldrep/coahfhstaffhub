import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/require-auth';

export const syncStaffGoogleTaskCompletions = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await context.supabase.from('user_roles').select('role')
      .eq('user_id', context.userId).in('role', ['core', 'meeting']);
    if (roles.error || !roles.data?.length) throw new Error('Staff meeting access required');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { syncGoogleTaskCompletions } = await import('@/server/google-task-completion.server');
    const connections = await supabaseAdmin.from('user_integrations').select('user_id').eq('provider', 'google_tasks');
    if (connections.error) throw new Error(connections.error.message);
    let updated = 0;
    let failed = 0;
    // Continue syncing other staff if one Google connection has expired.
    for (const row of connections.data ?? []) {
      try { updated += (await syncGoogleTaskCompletions(row.user_id)).updated; }
      catch { failed++; }
    }
    return { updated, failed };
  });