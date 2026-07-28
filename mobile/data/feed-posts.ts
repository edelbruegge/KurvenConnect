export type FeedPostCategory = 'Beitrag' | 'Fahrt' | 'Gesuch' | 'Treffpunkt';

export type FeedComment = {
  id: string;
  userId?: string;
  username: string;
  initials: string;
  text: string;
  timestamp: string;
};

export type NewFeedPost = {
  category: FeedPostCategory;
  description: string;
  hasImage?: boolean;
  tripDetails?: FahrtDetails;
  requestDetails?: GesuchDetails;
  meetupDetails?: MeetupDetails;
};

export type FahrtDetails = {
  departure: string;
  destination: string;
  departureTime: string;
  freeSeats: number;
  occasion?: string;
};

export type GesuchDetails = {
  requestedService: string;
};

export type MeetupDetails = {
  gameId: string;
  gameLabel: string;
  title: string;
  location: string;
  date: string;
  eventTime: string;
  maxAttendees?: number;
  attendeeIds: string[];
};

export type FeedPost = {
  id: string;
  userId: string;
  user: string;
  initials: string;
  time: string;
  category: FeedPostCategory;
  description: string;
  likes: number;
  likedByCurrentUser: boolean;
  comments: FeedComment[];
  hasImage?: boolean;
  tripDetails?: FahrtDetails;
  requestDetails?: GesuchDetails;
  meetupDetails?: MeetupDetails;
  rideRequestSent?: boolean;
};

export function getMeetupAttendeeCount(details: MeetupDetails): number {
  return 1 + details.attendeeIds.length;
}

export function isMeetupFull(details: MeetupDetails): boolean {
  return details.maxAttendees != null && getMeetupAttendeeCount(details) >= details.maxAttendees;
}

export function getPostDetailPathname(post: FeedPost): '/meetup/[id]' | '/post/[id]' {
  return post.category === 'Treffpunkt' ? '/meetup/[id]' : '/post/[id]';
}

export const feedPosts: FeedPost[] = [
  {
    id: '1',
    userId: 'user-mina-k',
    user: 'Mina K.',
    initials: 'MK',
    time: 'vor 12 Min.',
    category: 'Beitrag',
    description:
      'Die Fansrunde vor dem Spiel wird heute wieder im Fanbereich starten. Wer kommt mit?',
    likes: 24,
    likedByCurrentUser: false,
    comments: [
      {
        id: 'comment-1-1',
        username: 'Lena',
        initials: 'LE',
        text: 'Ich bin dabei!',
        timestamp: 'vor 5 Min.',
      },
      {
        id: 'comment-1-2',
        username: 'Phil',
        initials: 'PH',
        text: 'Treffen wir uns vor dem Tor?',
        timestamp: 'vor 2 Min.',
      },
    ],
  },
  {
    id: '2',
    userId: 'user-luca-r',
    user: 'Luca R.',
    initials: 'LR',
    time: 'vor 27 Min.',
    category: 'Beitrag',
    description:
      'Ein kurzer Blick auf die neue Stadion-Atmosphäre vor dem Heimspiel – Platz für späteres Bildmaterial.',
    likes: 18,
    likedByCurrentUser: true,
    comments: [
      {
        id: 'comment-2-1',
        username: 'Nora',
        initials: 'NO',
        text: 'Das sieht richtig stark aus.',
        timestamp: 'vor 10 Min.',
      },
    ],
    hasImage: true,
  },
  {
    id: '3',
    userId: 'user-david-s',
    user: 'David S.',
    initials: 'DS',
    time: 'vor 1 Std.',
    category: 'Fahrt',
    description:
      'Ich fahre am Samstag mit 3 weiteren Fans zum Auswärtsspiel und nehme noch Mitfahrer auf.',
    likes: 15,
    likedByCurrentUser: false,
    comments: [
      {
        id: 'comment-3-1',
        username: 'Sina',
        initials: 'SI',
        text: 'Passt, ich komme mit.',
        timestamp: 'vor 20 Min.',
      },
    ],
    tripDetails: {
      departure: 'Münster Hauptbahnhof',
      destination: 'Stadionplatz',
      departureTime: '06:30 Uhr',
      freeSeats: 3,
      occasion: 'Auswärtsspiel',
    },
    rideRequestSent: false,
  },
  {
    id: '4',
    userId: 'user-sina-p',
    user: 'Sina P.',
    initials: 'SP',
    time: 'vor 1 Std.',
    category: 'Gesuch',
    description:
      'Suche noch Unterstützung bei der Organisation rund um den nächsten Spieltag.',
    likes: 9,
    likedByCurrentUser: false,
    comments: [
      {
        id: 'comment-4-1',
        username: 'Timo',
        initials: 'TI',
        text: 'Ich schaue gleich nach.',
        timestamp: 'vor 8 Min.',
      },
      {
        id: 'comment-4-2',
        username: 'Ella',
        initials: 'EL',
        text: 'Ich habe noch was frei.',
        timestamp: 'vor 3 Min.',
      },
    ],
    requestDetails: {
      requestedService: 'Unterstützung bei der Organisation',
    },
  },
  {
    id: '5',
    userId: 'user-david-s',
    user: 'David S.',
    initials: 'DS',
    time: 'vor 2 Std.',
    category: 'Treffpunkt',
    description: 'Gemeinsame Anreise vom Bahnhof zum Stadion – wir treffen uns direkt am Haupteingang.',
    likes: 0,
    likedByCurrentUser: false,
    comments: [],
    meetupDetails: {
      gameId: 'game-bochum-arminia',
      gameLabel: 'VfL Bochum – Arminia Bielefeld',
      title: 'Gemeinsame Einstimmung vor dem Gästeblock',
      location: 'Hauptbahnhof Bochum',
      date: '08.11.2026',
      eventTime: '11:30 Uhr',
      attendeeIds: ['user-mina-k', 'user-sina-p'],
    },
  },
  {
    id: '6',
    userId: 'user-mina-k',
    user: 'Mina K.',
    initials: 'MK',
    time: 'vor 3 Std.',
    category: 'Treffpunkt',
    description: 'Lockeres Treffen vor dem Heimspiel, jeder ist willkommen.',
    likes: 0,
    likedByCurrentUser: false,
    comments: [],
    meetupDetails: {
      gameId: 'game-arminia-paderborn',
      gameLabel: 'Arminia Bielefeld – SC Paderborn',
      title: 'Treffen vor dem Heimspiel',
      location: 'Alm-Biergarten',
      date: '22.11.2026',
      eventTime: '13:00 Uhr',
      attendeeIds: [],
    },
  },
  {
    id: '7',
    userId: 'user-marco-b',
    user: 'Marco B.',
    initials: 'MB',
    time: 'vor 4 Std.',
    category: 'Beitrag',
    description: 'Mein kurzer Rückblick auf das letzte Heimspiel – die Stimmung im Block war einfach top.',
    likes: 3,
    likedByCurrentUser: false,
    comments: [
      {
        id: 'comment-7-1',
        userId: 'user-luca-r',
        username: 'Luca R.',
        initials: 'LR',
        text: 'Kann ich nur bestätigen, war richtig laut!',
        timestamp: 'vor 1 Std.',
      },
    ],
  },
  {
    id: '8',
    userId: 'user-marco-b',
    user: 'Marco B.',
    initials: 'MB',
    time: 'vor 5 Std.',
    category: 'Fahrt',
    description: 'Ich biete noch Plätze für die Fahrt zum nächsten Auswärtsspiel an.',
    likes: 2,
    likedByCurrentUser: false,
    comments: [],
    tripDetails: {
      departure: 'Bielefeld Hauptbahnhof',
      destination: 'Gästeblock',
      departureTime: '07:00 Uhr',
      freeSeats: 2,
      occasion: 'Auswärtsspiel',
    },
    rideRequestSent: false,
  },
  {
    id: '9',
    userId: 'user-marco-b',
    user: 'Marco B.',
    initials: 'MB',
    time: 'vor 6 Std.',
    category: 'Treffpunkt',
    description: 'Treffpunkt vor dem nächsten Heimspiel – kommt gerne vorbei.',
    likes: 0,
    likedByCurrentUser: false,
    comments: [],
    meetupDetails: {
      gameId: 'game-arminia-paderborn',
      gameLabel: 'Arminia Bielefeld – SC Paderborn',
      title: 'Vorglühen vor dem Heimspiel',
      location: 'Vereinsheim',
      date: '22.11.2026',
      eventTime: '12:00 Uhr',
      attendeeIds: ['user-sina-p'],
    },
  },
  {
    id: '10',
    userId: 'user-marco-b',
    user: 'Marco B.',
    initials: 'MB',
    time: 'vor 8 Std.',
    category: 'Gesuch',
    description: 'Suche noch eine Empfehlung für eine gute Anreiseroute zum Auswärtsspiel.',
    likes: 1,
    likedByCurrentUser: false,
    comments: [],
    requestDetails: {
      requestedService: 'Empfehlung für die Anreiseroute',
    },
  },
];
