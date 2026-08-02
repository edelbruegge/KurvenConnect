import type { Href } from 'expo-router';

import { useFeedPosts } from '@/context/feed-posts-context';
import { useGroups } from '@/context/groups-context';
import { useMessages } from '@/context/messages-context';
import { useProfiles } from '@/context/profile-context';
import { getPostDetailPathname } from '@/data/feed-posts';
import type { Report } from '@/data/reports';

export type ResolvedReportTarget = {
  exists: boolean;
  previewText?: string;
  targetUserId?: string;
  route?: Href;
};

const NOT_FOUND: ResolvedReportTarget = { exists: false };

export function useResolvedReportTarget(report: Report): ResolvedReportTarget {
  const { getPostById, findCommentById } = useFeedPosts();
  const { getMessageById } = useMessages();
  const { getGroupById } = useGroups();
  const { getUserById } = useProfiles();

  const { targetType, targetId } = report;

  if (targetType === 'user') {
    const user = getUserById(targetId);
    return user
      ? { exists: true, previewText: user.bio, targetUserId: user.id, route: { pathname: '/profile/[id]', params: { id: user.id } } }
      : NOT_FOUND;
  }

  if (targetType === 'post' || targetType === 'trip' || targetType === 'request') {
    const post = getPostById(targetId);
    return post
      ? {
          exists: true,
          previewText: post.description,
          targetUserId: post.userId,
          route: { pathname: getPostDetailPathname(post), params: { id: post.id } },
        }
      : NOT_FOUND;
  }

  if (targetType === 'meetup') {
    const post = getPostById(targetId);
    return post
      ? {
          exists: true,
          previewText: post.meetupDetails?.title ?? post.description,
          targetUserId: post.userId,
          route: { pathname: '/meetup/[id]', params: { id: post.id } },
        }
      : NOT_FOUND;
  }

  if (targetType === 'comment') {
    const found = findCommentById(targetId);
    return found
      ? {
          exists: true,
          previewText: found.comment.text,
          targetUserId: found.comment.userId,
          route: { pathname: getPostDetailPathname(found.post), params: { id: found.post.id } },
        }
      : NOT_FOUND;
  }

  if (targetType === 'message') {
    const message = getMessageById(targetId);
    return message
      ? {
          exists: true,
          previewText: message.text,
          targetUserId: message.senderId,
          route: { pathname: '/messages/[id]', params: { id: message.conversationId } },
        }
      : NOT_FOUND;
  }

  if (targetType === 'group') {
    const group = getGroupById(targetId);
    return group
      ? {
          exists: true,
          previewText: group.description,
          targetUserId: group.ownerId,
          route: { pathname: '/group/[id]', params: { id: group.id } },
        }
      : NOT_FOUND;
  }

  // 'group_post' — es gibt weiterhin kein Gruppenbeitrags-Feature, daher nie auflösbar.
  return NOT_FOUND;
}
