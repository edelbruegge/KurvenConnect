export type FeedPostCategory = 'Beitrag' | 'Fahrt' | 'Gesuch';

export type FeedComment = {
  id: string;
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
  rideRequestSent?: boolean;
};

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
];
