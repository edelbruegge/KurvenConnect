export type UserProfile = {
  id: string;
  displayName: string;
  initials: string;
  club: string;
  location: string;
  bio: string;
  memberSince: string;
  isCurrentUser: boolean;
};

export const CURRENT_USER_ID = 'user-marco-b';

export const currentUserSeed: UserProfile = {
  id: CURRENT_USER_ID,
  displayName: 'Marco B.',
  initials: 'MB',
  club: 'Arminia Bielefeld',
  location: 'Bielefeld',
  bio: 'Arminia-Fan seit 2017. Auswärtsfahrten sind meine Leidenschaft.',
  memberSince: '2026',
  isCurrentUser: true,
};

export type FollowEdge = {
  followerId: string;
  followingId: string;
};

export const seedFollowEdges: FollowEdge[] = [
  { followerId: 'user-mina-k', followingId: CURRENT_USER_ID },
  { followerId: 'user-luca-r', followingId: CURRENT_USER_ID },
  { followerId: 'user-david-s', followingId: 'user-sina-p' },
  { followerId: 'user-sina-p', followingId: 'user-mina-k' },
];

export const sampleProfiles: UserProfile[] = [
  {
    id: 'user-mina-k',
    displayName: 'Mina K.',
    initials: 'MK',
    club: 'Arminia Bielefeld',
    location: 'Bielefeld',
    bio: 'Organisiere gerne die Fansrunde vor dem Spiel.',
    memberSince: '2023',
    isCurrentUser: false,
  },
  {
    id: 'user-luca-r',
    displayName: 'Luca R.',
    initials: 'LR',
    club: 'Arminia Bielefeld',
    location: 'Herford',
    bio: 'Immer mit der Kamera dabei, wenn es um Stadionatmosphäre geht.',
    memberSince: '2021',
    isCurrentUser: false,
  },
  {
    id: 'user-david-s',
    displayName: 'David S.',
    initials: 'DS',
    club: 'Arminia Bielefeld',
    location: 'Münster',
    bio: 'Fahre so oft es geht zu Auswärtsspielen und nehme gerne Mitfahrer mit.',
    memberSince: '2020',
    isCurrentUser: false,
  },
  {
    id: 'user-sina-p',
    displayName: 'Sina P.',
    initials: 'SP',
    club: 'Arminia Bielefeld',
    location: 'Bielefeld',
    bio: 'Unterstütze bei der Organisation rund um den Spieltag.',
    memberSince: '2024',
    isCurrentUser: false,
  },
];
