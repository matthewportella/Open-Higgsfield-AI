// The Image, Cinema and Lip Sync studios call Muapi directly from the
// browser (that is how the original Open Higgsfield studios work), so signed-in
// team members receive the team's Muapi key here, only while logged in.

import { requireMember, engineKey, errorResponse } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { supabase } = await requireMember(request);
    const key = await engineKey(supabase, 'muapi');
    return Response.json({ key }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
