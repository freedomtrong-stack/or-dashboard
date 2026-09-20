import { supabase } from '../supabaseClient'

export const INACTIVE_STATUS = 'In-active'

// Call right after a case's status is written. Opens a new inactive period
// when the case just became In-active, and closes the open one when it left.
export async function logInactiveTransition(caseId, oldStatus, newStatus, note) {
  if (newStatus === oldStatus) return

  if (newStatus === INACTIVE_STATUS) {
    await supabase.from('or_inactive_periods').insert({ case_id: caseId, note: note || null })
    return
  }

  if (oldStatus === INACTIVE_STATUS) {
    const { data } = await supabase
      .from('or_inactive_periods')
      .select('id')
      .eq('case_id', caseId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
    if (data && data[0]) {
      await supabase
        .from('or_inactive_periods')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', data[0].id)
    }
  }
}
