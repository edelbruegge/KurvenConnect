import type { IconSymbolName } from '@/components/ui/icon-symbol';

// 'stadionkarte' is intentionally not opened through the generic game-scoped /stadion/[module]
// handler (app/stadion/[module].tsx) — it shows the account-wide personal matchday history, not
// content for the currently selected game — see app/(tabs)/stadion.tsx's dedicated handling.
export type StadionModule = 'uebersicht' | 'fahrten' | 'treffen' | 'beitraege' | 'gesucht' | 'stadionkarte';

export const STADION_MODULES: { key: StadionModule; label: string; description: string; icon: IconSymbolName }[] = [
  { key: 'uebersicht', label: 'Übersicht', description: 'Alles rund um diesen Spieltag', icon: 'square.grid.2x2.fill' },
  { key: 'fahrten', label: 'Fahrten', description: 'Gemeinsam zum Stadion fahren', icon: 'car.fill' },
  { key: 'treffen', label: 'Treffen', description: 'Treffpunkte vor und nach dem Spiel', icon: 'person.3.fill' },
  { key: 'beitraege', label: 'Beiträge', description: 'Beiträge zum ausgewählten Spiel', icon: 'doc.text.fill' },
  { key: 'gesucht', label: 'Gesucht', description: 'Mitfahrer, Gruppen oder Begleitung finden', icon: 'person.fill.questionmark' },
  { key: 'stadionkarte', label: 'Stadionkarte', description: 'Deine besuchten Stadien und Spieltage', icon: 'mappin.and.ellipse' },
];
