import { useBlocks } from '@/context/blocks-context';
import { useReports } from '@/context/reports-context';
import { getReportTargetTypeForPost, type FeedPost } from '@/data/feed-posts';

export function useVisiblePosts(posts: FeedPost[]): FeedPost[] {
  const { isUserHidden } = useBlocks();
  const { shouldHideTarget } = useReports();

  return posts.filter(
    (post) => !isUserHidden(post.userId) && !shouldHideTarget(getReportTargetTypeForPost(post.category), post.id),
  );
}
