import { CURRENT_USER_ID } from './users';

export type NotificationType =
  | 'post_like'
  | 'post_comment'
  | 'new_follower'
  | 'trip_request'
  | 'meetup_join'
  | 'meetup_leave'
  | 'request_reply'
  | 'new_message'
  | 'system';

export type NotificationReference =
  | { type: 'post' | 'trip' | 'request'; id: string }
  | { type: 'meetup'; id: string }
  | { type: 'profile'; id: string }
  | { type: 'conversation'; id: string }
  | null;

export type AppNotification = {
  id: string;
  recipientId: string;
  actorId?: string;
  type: NotificationType;
  text: string;
  reference: NotificationReference;
  createdAt: string;
  read: boolean;
};

export const seedNotifications: AppNotification[] = [
  {
    id: 'notification-1',
    recipientId: CURRENT_USER_ID,
    actorId: 'user-mina-k',
    type: 'new_message',
    text: 'Mina K. hat dir eine Nachricht geschickt.',
    reference: { type: 'conversation', id: 'conversation-1' },
    createdAt: 'vor 8 Min.',
    read: false,
  },
  {
    id: 'notification-2',
    recipientId: CURRENT_USER_ID,
    actorId: 'user-luca-r',
    type: 'post_comment',
    text: 'Luca R. hat deinen Beitrag kommentiert.',
    reference: { type: 'post', id: '7' },
    createdAt: 'vor 1 Std.',
    read: false,
  },
  {
    id: 'notification-3',
    recipientId: CURRENT_USER_ID,
    actorId: 'user-david-s',
    type: 'trip_request',
    text: 'David S. möchte bei deiner Fahrt mitfahren.',
    reference: { type: 'trip', id: '8' },
    createdAt: 'vor 3 Std.',
    read: false,
  },
  {
    id: 'notification-4',
    recipientId: CURRENT_USER_ID,
    actorId: 'user-luca-r',
    type: 'meetup_leave',
    text: 'Luca R. hat seine Teilnahme an deinem Treffpunkt abgesagt.',
    reference: { type: 'meetup', id: '9' },
    createdAt: 'vor 4 Std.',
    read: false,
  },
  {
    id: 'notification-5',
    recipientId: CURRENT_USER_ID,
    actorId: 'user-mina-k',
    type: 'new_follower',
    text: 'Mina K. folgt dir jetzt.',
    reference: { type: 'profile', id: 'user-mina-k' },
    createdAt: 'vor 6 Std.',
    read: true,
  },
  {
    id: 'notification-6',
    recipientId: CURRENT_USER_ID,
    actorId: 'user-mina-k',
    type: 'post_like',
    text: 'Mina K. gefällt dein Beitrag.',
    reference: { type: 'post', id: '7' },
    createdAt: 'vor 7 Std.',
    read: true,
  },
  {
    id: 'notification-7',
    recipientId: CURRENT_USER_ID,
    actorId: 'user-sina-p',
    type: 'meetup_join',
    text: 'Sina P. nimmt an deinem Treffpunkt teil.',
    reference: { type: 'meetup', id: '9' },
    createdAt: 'vor 8 Std.',
    read: true,
  },
  {
    id: 'notification-8',
    recipientId: CURRENT_USER_ID,
    actorId: 'user-david-s',
    type: 'request_reply',
    text: 'David S. hat auf dein Gesuch geantwortet.',
    reference: { type: 'request', id: '10' },
    createdAt: 'vor 9 Std.',
    read: true,
  },
  {
    id: 'notification-9',
    recipientId: CURRENT_USER_ID,
    type: 'system',
    text: 'Willkommen bei Kurvenconnect! Hier siehst du künftig alle wichtigen Aktivitäten rund um deine Beiträge, Fahrten und Treffpunkte.',
    reference: null,
    createdAt: 'vor 3 Tagen',
    read: true,
  },
];
