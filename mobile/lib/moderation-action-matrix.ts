import type { ReportActionType } from '@/context/moderation-context';
import type { ReportTargetType } from '@/data/reports';

// The single source of truth for which moderation actions apply to which report target type —
// used by the moderation detail screen to decide which buttons to render. Never duplicate this
// matrix inline in a component; import and call this function instead.
//
//   post / comment / trip / meetup / request (wanted_entry) -> hide, warn, hide+warn
//   user                                                     -> warn only (no global profile
//                                                                hiding in this step)
//   anything else (message/group/group_post -> no Supabase-backed moderation target)
export function getAllowedModerationActions(targetType: ReportTargetType): ReportActionType[] {
  if (targetType === 'user') {
    return ['warn_user'];
  }

  if (targetType === 'post' || targetType === 'comment' || targetType === 'trip' || targetType === 'meetup' || targetType === 'request') {
    return ['hide_content', 'warn_user', 'hide_and_warn'];
  }

  return [];
}

export function canGloballyHideTargetType(targetType: ReportTargetType): boolean {
  return getAllowedModerationActions(targetType).includes('hide_content');
}
