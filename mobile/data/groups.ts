import { CURRENT_USER_ID } from './users';

export type GroupVisibility = 'public' | 'private';

export type Group = {
  id: string;
  name: string;
  description: string;
  clubId?: string;
  clubName: string;
  city?: string;
  ownerId: string;
  memberIds: string[];
  createdAt: string;
  visibility: GroupVisibility;
};

export type GroupJoinRequestStatus = 'pending' | 'accepted' | 'rejected';

export type GroupJoinRequest = {
  id: string;
  groupId: string;
  userId: string;
  status: GroupJoinRequestStatus;
  createdAt: string;
};

export const seedGroups: Group[] = [
  {
    id: 'group-1',
    name: 'Auswärtsfahrer Arminia',
    description: 'Wir organisieren gemeinsame Fahrten zu allen Auswärtsspielen.',
    clubName: 'Arminia Bielefeld',
    city: 'Bielefeld',
    ownerId: 'user-david-s',
    memberIds: ['user-david-s', CURRENT_USER_ID, 'user-sina-p'],
    createdAt: 'vor 2 Monaten',
    visibility: 'public',
  },
  {
    id: 'group-2',
    name: 'Familie & Freunde Arminia',
    description: 'Lockere Gruppe für Familien und Freunde, die gemeinsam ins Stadion gehen.',
    clubName: 'Arminia Bielefeld',
    city: 'Bielefeld',
    ownerId: 'user-sina-p',
    memberIds: ['user-sina-p', 'user-mina-k', CURRENT_USER_ID],
    createdAt: 'vor 5 Monaten',
    visibility: 'public',
  },
  {
    id: 'group-3',
    name: 'Fanclub Ostkurve',
    description: 'Offizieller Fanclub für alle, die in der Ostkurve stehen.',
    clubName: 'Arminia Bielefeld',
    city: 'Bielefeld',
    ownerId: 'user-mina-k',
    memberIds: ['user-mina-k', 'user-luca-r'],
    createdAt: 'vor 1 Jahr',
    visibility: 'public',
  },
  {
    id: 'group-4',
    name: 'Nur geladene Gäste',
    description: 'Private Gruppe nur für persönlich eingeladene Mitglieder.',
    clubName: 'Arminia Bielefeld',
    city: 'Bielefeld',
    ownerId: 'user-luca-r',
    memberIds: ['user-luca-r', 'user-david-s'],
    createdAt: 'vor 3 Monaten',
    visibility: 'private',
  },
  {
    id: 'group-5',
    name: 'Marcos Blockrunde',
    description: 'Kleine private Runde für alle, die regelmäßig im gleichen Block stehen.',
    clubName: 'Arminia Bielefeld',
    city: 'Bielefeld',
    ownerId: CURRENT_USER_ID,
    memberIds: [CURRENT_USER_ID],
    createdAt: 'vor 1 Monat',
    visibility: 'private',
  },
];

export const seedGroupJoinRequests: GroupJoinRequest[] = [
  {
    id: 'request-1',
    groupId: 'group-5',
    userId: 'user-luca-r',
    status: 'pending',
    createdAt: 'vor 2 Std.',
  },
];
