export type FeedPostCategory = 'Beitrag' | 'Ticket' | 'Fahrt' | 'Gesuch';

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
  id: number;
  user: string;
  initials: string;
  time: string;
  category: FeedPostCategory;
  description: string;
  likes: number;
  comments: number;
  hasImage?: boolean;
  ticketDetails?: TicketDetails;
  tripDetails?: FahrtDetails;
  requestDetails?: GesuchDetails;
};

export const feedPosts: FeedPost[] = [
  {
    id: 1,
    user: 'Mina K.',
    initials: 'MK',
    time: 'vor 12 Min.',
    category: 'Beitrag',
    description:
      'Die Fansrunde vor dem Spiel wird heute wieder im Fanbereich starten. Wer kommt mit?',
    likes: 24,
    comments: 6,
  },
  {
    id: 2,
    user: 'Luca R.',
    initials: 'LR',
    time: 'vor 27 Min.',
    category: 'Beitrag',
    description:
      'Ein kurzer Blick auf die neue Stadion-Atmosphäre vor dem Heimspiel – Platz für späteres Bildmaterial.',
    likes: 18,
    comments: 3,
    hasImage: true,
  },
  {
    id: 3,
    user: 'Nora T.',
    initials: 'NT',
    time: 'vor 41 Min.',
    category: 'Ticket',
    description:
      '2 Tickets für die Nordtribüne sind noch verfügbar. Direkt bei mir abzugeben.',
    likes: 11,
    comments: 4,
    ticketDetails: {
      price: '€ 32 pro Ticket',
      game: 'Heimspiel gegen den Rivalen',
      block: 'Nordtribüne',
    },
  },
  {
    id: 4,
    user: 'David S.',
    initials: 'DS',
    time: 'vor 1 Std.',
    category: 'Fahrt',
    description:
      'Ich fahre am Samstag mit 3 weiteren Fans zum Auswärtsspiel und nehme noch Mitfahrer auf.',
    likes: 15,
    comments: 2,
    tripDetails: {
      departure: 'Münster Hauptbahnhof',
      destination: 'Stadionplatz',
      departureTime: '06:30 Uhr',
      freeSeats: 3,
    },
  },
  {
    id: 5,
    user: 'Sina P.',
    initials: 'SP',
    time: 'vor 1 Std.',
    category: 'Gesuch',
    description:
      'Suche noch ein Ticket für den Familienblock – möglichst nah am Feld.',
    likes: 9,
    comments: 5,
    requestDetails: {
      requestedService: 'Ticket im Familienblock',
    },
  },
];
