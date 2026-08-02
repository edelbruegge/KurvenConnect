import { useBlocks } from '@/context/blocks-context';
import { useModeration } from '@/context/moderation-context';
import { useReports } from '@/context/reports-context';
import type { ReportTargetType } from '@/data/reports';

export function useSafetySelectors() {
  const { isUserHidden, isBlocked } = useBlocks();
  const { shouldHideTarget } = useReports();
  const { isContentModerationHidden, isUserSuspended } = useModeration();

  // Personal (reporter-only) + moderative (global) hiding combined — for list-style views
  // (Feed, Suche, Kommentare, ...) where both layers must be respected together.
  const canViewContent = (targetType: ReportTargetType, id: string, authorId?: string) =>
    !shouldHideTarget(targetType, id) &&
    !isContentModerationHidden(targetType, id) &&
    !(authorId && (isUserHidden(authorId) || isUserSuspended(authorId)));

  // Moderative hiding only — for direct detail routes and notification targets, where a
  // reporter's own personal hide must NOT block their own direct access to what they reported.
  const isModeratedAway = (targetType: ReportTargetType, id: string, authorId?: string) =>
    isContentModerationHidden(targetType, id) || Boolean(authorId && isUserSuspended(authorId));

  // Personal block + moderative suspension — governs messaging specifically (reporting a user
  // does not restrict messaging on its own, only blocking or a moderation suspension does).
  const canMessageUser = (userId: string) => !isBlocked(userId) && !isUserSuspended(userId);

  return { canViewContent, isModeratedAway, canMessageUser };
}
