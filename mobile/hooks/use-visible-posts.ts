import { useBlocks } from '@/context/blocks-context';
import { useModeration } from '@/context/moderation-context';
import { useReports } from '@/context/reports-context';
import { getReportTargetTypeForPost, type FeedPost } from '@/data/feed-posts';

export function useVisiblePosts(posts: FeedPost[]): FeedPost[] {
  const { isUserHidden } = useBlocks();
  const { shouldHideTarget } = useReports();
  const { isContentModerationHidden, isUserSuspended } = useModeration();

  return posts.filter((post) => {
    const targetType = getReportTargetTypeForPost(post.category);

    if (isUserHidden(post.userId) || shouldHideTarget(targetType, post.id)) {
      return false;
    }

    if (isUserSuspended(post.userId) || isContentModerationHidden(targetType, post.id)) {
      return false;
    }

    return true;
  });
}
