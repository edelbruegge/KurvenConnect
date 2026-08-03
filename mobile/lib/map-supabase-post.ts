import type { FeedComment, FeedPost, FeedPostCategory } from '@/data/feed-posts';

export type SupabasePostRow = {
  id: string;
  author_id: string;
  content: string;
  category: string;
  created_at: string;
  updated_at: string;
};

export type SupabaseCommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type SupabaseLikeRow = {
  post_id: string;
  user_id: string;
  created_at: string;
};

type AuthorDisplay = {
  displayName: string;
  initials: string;
};

/** "vor X Min./Std./Tagen", matching the style of the app's existing local seed timestamps. */
export function formatRelativeGermanTime(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime();

  if (Number.isNaN(then)) {
    return 'gerade eben';
  }

  const diffMinutes = Math.floor(Math.max(0, Date.now() - then) / 60000);

  if (diffMinutes < 1) {
    return 'gerade eben';
  }

  if (diffMinutes < 60) {
    return `vor ${diffMinutes} Min.`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `vor ${diffHours} Std.`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `vor ${diffDays} Tag${diffDays === 1 ? '' : 'en'}`;
}

export function mapSupabaseCommentToFeedComment(row: SupabaseCommentRow, author: AuthorDisplay): FeedComment {
  return {
    id: row.id,
    userId: row.author_id,
    username: author.displayName,
    initials: author.initials,
    text: row.content,
    timestamp: formatRelativeGermanTime(row.created_at),
    source: 'supabase',
  };
}

export function mapSupabasePostToFeedPost(
  row: SupabasePostRow,
  comments: FeedComment[],
  likeCount: number,
  likedByCurrentUser: boolean,
  author: AuthorDisplay,
): FeedPost {
  return {
    id: row.id,
    userId: row.author_id,
    user: author.displayName,
    initials: author.initials,
    time: formatRelativeGermanTime(row.created_at),
    category: (row.category as FeedPostCategory) || 'Beitrag',
    description: row.content,
    likes: likeCount,
    likedByCurrentUser,
    comments,
    source: 'supabase',
    createdAtIso: row.created_at,
  };
}
