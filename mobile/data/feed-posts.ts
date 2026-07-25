export type FeedPostCategory = 'Beitrag' | 'Ticket' | 'Fahrt' | 'Gesuch';

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
  ticketDetails?: TicketDetails;
  tripDetails?: FahrtDetails;
  requestDetails?: GesuchDetails;
};

export type TicketDetails = {
  price: string;
  game: string;
  block: string;
};

export type FahrtDetails = {
  departure: string;
  destination: string;
  departureTime: string;
  freeSeats: number;
};

export type GesuchDetails = {
  requestedService: string;
};

export type FeedPost = {
  id: string;
  user: string;
  initials: string;
  time: string;
  category: FeedPostCategory;
  description: string;
  likes: number;
  likedByCurrentUser: boolean;
  comments: FeedComment[];
  hasImage?: boolean;
  ticketDetails?: TicketDetails;
  tripDetails?: FahrtDetails;
  requestDetails?: GesuchDetails;
};

export const feedPosts: FeedPost[] = [
  {
    id: '1',
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
    user: 'Nora T.',
    initials: 'NT',
    time: 'vor 41 Min.',
    category: 'Ticket',
    description:
      '2 Tickets für die Nordtribüne sind noch verfügbar. Direkt bei mir abzugeben.',
    likes: 11,
    likedByCurrentUser: false,
    comments: [
      {
        id: 'comment-3-1',
        username: 'Mika',
        initials: 'MI',
        text: 'Ich melde mich noch heute.',
        timestamp: 'vor 15 Min.',
      },
    ],
    ticketDetails: {
      price: '€ 32 pro Ticket',
      game: 'Heimspiel gegen den Rivalen',
      block: 'Nordtribüne',
    },
  },
  {
    id: '4',
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
        id: 'comment-4-1',
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
    },
  },
  {
    id: '5',
    user: 'Sina P.',
    initials: 'SP',
    time: 'vor 1 Std.',
    category: 'Gesuch',
    description:
      'Suche noch ein Ticket für den Familienblock – möglichst nah am Feld.',
    likes: 9,
    likedByCurrentUser: false,
    comments: [
      {
        id: 'comment-5-1',
        username: 'Timo',
        initials: 'TI',
        text: 'Ich schaue gleich nach.',
        timestamp: 'vor 8 Min.',
      },
      {
        id: 'comment-5-2',
        username: 'Ella',
        initials: 'EL',
        text: 'Ich habe noch was frei.',
        timestamp: 'vor 3 Min.',
      },
    ],
    requestDetails: {
      requestedService: 'Ticket im Familienblock',
    },
  },
];
