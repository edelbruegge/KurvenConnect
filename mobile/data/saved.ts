export type SavedItemType = 'post' | 'trip' | 'meetup' | 'request' | 'group_post';

export type SavedItemReference = {
  type: SavedItemType;
  id: string;
  savedAt: string;
};

export const seedSavedItems: SavedItemReference[] = [
  {
    type: 'post',
    id: '1',
    savedAt: 'vor 2 Tagen',
  },
  {
    type: 'trip',
    id: '3',
    savedAt: 'vor 1 Tag',
  },
];
