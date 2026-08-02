import { getReportTargetTypeForPost, type FeedPost } from '@/data/feed-posts';
import { useSafetySelectors } from '@/hooks/use-safety-selectors';

export function useVisiblePosts(posts: FeedPost[]): FeedPost[] {
  const { canViewContent } = useSafetySelectors();

  return posts.filter((post) => canViewContent(getReportTargetTypeForPost(post.category), post.id, post.userId));
}
