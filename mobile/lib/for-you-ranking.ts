import type { FeedPost } from '@/data/feed-posts';

// A transparent, regel-basiertes Ranking for the "Für dich" feed -- explicitly NOT a machine
// learning / recommendation engine (Vorgabe 4). Every input is a piece of social data the app
// already has loaded for the current page (recency, follow state, like/comment/save counts) --
// no hidden behavioral tracking of any kind (Vorgabe 9/31).
//
// score = recency_score + following_bonus + engagement_score
//
// recency_score  = 0.5 ^ (ageInHours / RECENCY_HALF_LIFE_HOURS)   -- exponential decay, never
//                  hits exactly 0, so a very old post is merely deprioritized, never excluded
//                  (Vorgabe 5) -- range (0, 1].
// following_bonus = FOLLOWING_BONUS if the current user follows the author, else 0 -- moderate on
//                  purpose (Vorgabe 6): a followed author's post is still expected to lose to a
//                  very recent, well-engaged post from someone the user doesn't follow, which is
//                  exactly what keeps "Für dich" a discovery surface rather than a copy of
//                  "Folge ich". Never applied to the current user's own posts -- not because of a
//                  special case, but because a self-follow is impossible at the database level
//                  (user_follows' own check constraint), so followingIds can never contain
//                  authUserId in the first place (Vorgabe 10).
// engagement_score = min(ENGAGEMENT_CAP, log(1+likes)*W_LIKES + log(1+comments)*W_COMMENTS +
//                  log(1+saves)*W_SAVES) -- logarithmic, not linear (Vorgabe 8: 100 likes must not
//                  count 100x a single like), and capped so no single viral post can ever fully
//                  outweigh recency (Vorgabe 5: recency stays the strongest signal).

const RECENCY_HALF_LIFE_HOURS = 36;
const FOLLOWING_BONUS = 0.15;
const ENGAGEMENT_CAP = 0.6;
const WEIGHT_LIKES = 0.05;
const WEIGHT_COMMENTS = 0.08;
const WEIGHT_SAVES = 0.07;

// At most this many consecutive posts from the same author before a same-score-or-lower post from
// a different author is pulled forward (Vorgabe 11) -- a simple, transparent readability rule,
// not a recommendation system.
const MAX_CONSECUTIVE_PER_AUTHOR = 2;

export type ForYouRankingInput = {
  followingIds: Set<string>;
  now?: number; // injectable for tests; defaults to Date.now()
};

export type ScoredPost = {
  post: FeedPost;
  score: number;
  recencyScore: number;
  followingBonus: number;
  engagementScore: number;
};

function getAgeInHours(post: FeedPost, now: number): number {
  if (!post.createdAtIso) {
    // No real timestamp (e.g. a local seed post) -- treat as maximally old rather than as "now",
    // so seed content can never artificially outrank real, dated posts (Vorgabe 26).
    return Number.POSITIVE_INFINITY;
  }

  const createdAtMs = new Date(post.createdAtIso).getTime();
  if (Number.isNaN(createdAtMs)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, (now - createdAtMs) / (1000 * 60 * 60));
}

function scorePost(post: FeedPost, input: Required<ForYouRankingInput>): ScoredPost {
  const ageInHours = getAgeInHours(post, input.now);
  const recencyScore = Number.isFinite(ageInHours) ? Math.pow(0.5, ageInHours / RECENCY_HALF_LIFE_HOURS) : 0;

  const followingBonus = input.followingIds.has(post.userId) ? FOLLOWING_BONUS : 0;

  const likes = Math.max(0, post.likes);
  const comments = Math.max(0, post.comments.length);
  const saves = Math.max(0, post.savesCount ?? 0);
  const engagementScore = Math.min(
    ENGAGEMENT_CAP,
    Math.log(1 + likes) * WEIGHT_LIKES + Math.log(1 + comments) * WEIGHT_COMMENTS + Math.log(1 + saves) * WEIGHT_SAVES,
  );

  return {
    post,
    score: recencyScore + followingBonus + engagementScore,
    recencyScore,
    followingBonus,
    engagementScore,
  };
}

/** Stable comparator: score DESC, then createdAt DESC, then id DESC (Vorgabe 23) -- never a random
 * order on repeated calls with the same input. */
function compareScoredPosts(a: ScoredPost, b: ScoredPost): number {
  if (a.score !== b.score) return b.score - a.score;

  const aCreated = a.post.createdAtIso ?? '';
  const bCreated = b.post.createdAtIso ?? '';
  if (aCreated !== bCreated) return bCreated.localeCompare(aCreated);

  return b.post.id.localeCompare(a.post.id);
}

/** Greedy author-diversity pass (Vorgabe 11): whenever the two most recently placed posts share an
 * author, the next post from a *different* author (if one remains in the pool) is pulled forward
 * ahead of a third same-author post. O(n) pool scans -- fine for the ≤50 posts/category this
 * operates on (Vorgabe: kein komplexes Recommendation-System). */
function applyAuthorDiversity(scored: ScoredPost[]): ScoredPost[] {
  const pool = [...scored];
  const result: ScoredPost[] = [];

  while (pool.length > 0) {
    const lastTwoAuthors = result.slice(-MAX_CONSECUTIVE_PER_AUTHOR).map((entry) => entry.post.userId);
    const wouldExtendRun = lastTwoAuthors.length === MAX_CONSECUTIVE_PER_AUTHOR && lastTwoAuthors.every((id) => id === lastTwoAuthors[0]);

    let pickIndex = 0;
    if (wouldExtendRun) {
      const runningAuthor = lastTwoAuthors[0];
      const alternativeIndex = pool.findIndex((entry) => entry.post.userId !== runningAuthor);
      if (alternativeIndex > 0) {
        pickIndex = alternativeIndex;
      }
    }

    result.push(pool[pickIndex]);
    pool.splice(pickIndex, 1);
  }

  return result;
}

/** Ranks candidate posts for the "Für dich" feed. Callers must already have filtered candidates to
 * the active club and to visible (non-moderated, non-blocked) content -- this function does no
 * filtering of its own, only scoring and ordering (Vorgabe 3/16/17: activeTeamId/moderation/
 * blocking are hard pre-filters applied before ranking, never something a score could bypass). */
export function rankForYouPosts(candidates: FeedPost[], input: ForYouRankingInput): FeedPost[] {
  const resolvedInput: Required<ForYouRankingInput> = { followingIds: input.followingIds, now: input.now ?? Date.now() };

  const scored = candidates.map((post) => scorePost(post, resolvedInput)).sort(compareScoredPosts);
  const diversified = applyAuthorDiversity(scored);

  if (__DEV__ && diversified.length !== candidates.length) {
    // Architecture invariant (Vorgabe 4/17): ranking may only ever reorder candidates, never drop
    // one. A mismatch here means a future change to scoring/diversity accidentally turned this into
    // a filter -- loud in dev, never silently swallowed.
    // eslint-disable-next-line no-console
    console.error(
      `[for-you-ranking] INVARIANT VIOLATED: ranking changed candidate count from ${candidates.length} to ${diversified.length}. Ranking must only reorder, never filter.`,
    );
  }

  if (__DEV__) {
    // Development-only debugging aid (Vorgabe 25) -- never rendered in product UI, never logs
    // anything beyond what's already shown on the card (post id/author id, no personal data).
    // eslint-disable-next-line no-console
    console.log(
      '[for-you-ranking]',
      diversified.slice(0, 10).map((entry) => ({
        id: entry.post.id,
        userId: entry.post.userId,
        score: Number(entry.score.toFixed(3)),
        recency: Number(entry.recencyScore.toFixed(3)),
        following: entry.followingBonus,
        engagement: Number(entry.engagementScore.toFixed(3)),
      })),
    );
  }

  return diversified.map((entry) => entry.post);
}
