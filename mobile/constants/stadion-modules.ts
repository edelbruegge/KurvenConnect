import type { IconSymbolName } from '@/components/ui/icon-symbol';

export type StadionModule = 'uebersicht' | 'fahrten' | 'treffen' | 'beitraege' | 'gesucht';

export const STADION_MODULES: { key: StadionModule; label: string; description: string; icon: IconSymbolName }[] = [
  { key: 'uebersicht', label: 'Übersicht', description: 'Alles rund um diesen Spieltag', icon: 'square.grid.2x2.fill' },
  { key: 'fahrten', label: 'Fahrten', description: 'Gemeinsam zum Stadion fahren', icon: 'car.fill' },
  { key: 'treffen', label: 'Treffen', description: 'Treffpunkte vor und nach dem Spiel', icon: 'person.3.fill' },
  { key: 'beitraege', label: 'Beiträge', description: 'Beiträge zum ausgewählten Spiel', icon: 'doc.text.fill' },
  { key: 'gesucht', label: 'Gesucht', description: 'Mitfahrer, Gruppen oder Begleitung finden', icon: 'person.fill.questionmark' },
];
