# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projektüberblick

Kurvenconnect ist eine mobile App (Android & iOS) für Fußballfans im deutschsprachigen Raum. Ziel ist eine zentrale Plattform für das gemeinsame Stadion- und Spieltagserlebnis: Communitys rund um Vereine, gemeinsame Beiträge, Fahrgemeinschaften und Spieltagsveranstaltungen.

**Aktueller Stand:** Das Repository befindet sich in der Setup-Phase — es existiert noch kein App-Code, kein `package.json` und kein Expo-Projekt. Diese Datei beschreibt den geplanten Stack und die Architektur, damit zukünftige Änderungen von Anfang an konsistent damit umgesetzt werden.

## Geplanter Technologie-Stack

- React Native mit Expo
- TypeScript (strikter Modus, siehe unten)
- Expo Router für Navigation (dateibasiertes Routing)
- Supabase als Backend (Auth, Datenbank, Storage)
- PostgreSQL als Datenbank (über Supabase)
- Supabase Auth für Registrierung/Login
- Supabase Storage für Profilbilder und spätere Medien
- Git/GitHub für Versionsverwaltung

Sobald das Expo-Projekt aufgesetzt ist, sollten die üblichen Befehle (`npx expo start`, `npx tsc --noEmit`, Linter, Tests) hier ergänzt werden — aktuell existieren sie noch nicht im Repo.

## Geplante Architektur

- **Navigation:** Expo Router — Routen ergeben sich aus der Dateistruktur unter `app/`. Auth-Flow (Login/Registrierung) und der eigentliche App-Bereich sollten als getrennte Routengruppen angelegt werden, sobald das Projekt existiert.
- **Backend-Zugriff:** Supabase-Client zentral initialisieren (ein Client, nicht pro Feature neu erzeugen), Zugriff auf Auth/DB/Storage darüber bündeln.
- **Datenmodell (grob):** Nutzer/Profile (mit Lieblingsverein), Gruppen/Communitys, Beiträge, Kommentare, Fahrgemeinschaften, Veranstaltungen. Tickettausch sowie Vertrauens-/Bewertungs-/Verifizierungssysteme sind spätere Phasen und noch nicht Teil der Kernarchitektur.
- **Umgebungsvariablen:** Supabase-URL und -Keys über `.env` (nicht eingecheckt); eine `.env.example` mit Platzhaltern muss gepflegt und aktuell gehalten werden, sobald echte Variablen hinzukommen.

## MVP-Funktionsumfang (erste Ausbaustufe)

- Registrierung und Login
- Benutzerprofil, Lieblingsverein auswählen
- Gruppen erstellen und beitreten
- Beiträge innerhalb von Gruppen
- Fahrgemeinschaften anbieten und suchen

Tickettausch und Zahlungsfunktionen sind explizit **nicht** Teil des MVP und erst in einer späteren Phase zu implementieren — nicht vorzeitig umsetzen, auch nicht als Grundgerüst.

## Arbeitsregeln für Änderungen

- Vor größeren Änderungen zuerst einen Plan erstellen, statt direkt loszuimplementieren.
- Nicht die gesamte App auf einmal umsetzen — immer nur eine klar begrenzte Funktion pro Schritt.
- Nach jedem Schritt prüfen, ob die App noch startet/funktioniert, bevor weitergemacht wird.
- Neue Bibliotheken nur mit klarer Begründung installieren, nicht vorsorglich.
- Keine Passwörter, API-Keys oder Tokens in Git speichern — ausschließlich über `.env` (die nicht committet wird); `.env.example` ohne echte Zugangsdaten aktuell halten.
- TypeScript strikt verwenden, mit aussagekräftigen Typen statt `any`.
- Verständliche, sprechende Datei-, Funktions- und Variablennamen verwenden.
- Sicherheitskritische Funktionen (Auth, Rechteprüfung, Datenzugriff) besonders sorgfältig umsetzen und reviewen.
- Nach jeder Änderung TypeScript-Prüfung, Linter und vorhandene Tests ausführen, sobald diese im Projekt eingerichtet sind.
- Bei Unklarheiten Rückfragen stellen und Antwortoptionen mit Ideen für Lösungen vorschlagen
- Bereits vorhandene echte Supabase-Inhalte (insbesondere Posts, Fahrten, Treffen, Gesucht, Gruppen) dürfen bei keinem neuen Entwicklungsschritt gelöscht, überschrieben, versteckt oder durch Seed-/Fallback-Inhalte ersetzt werden — außer eine bestehende fachliche Regel verlangt ausdrücklich eine Sichtbarkeitsbeschränkung (z. B. falscher Verein, Moderation, Blockierung). Neue Features müssen bestehende Daten erhalten. Insbesondere: Ranking-/Sortierlogik darf die Reihenfolge verändern, aber nie die Kandidatenmenge filtern; ein Ladefehler bei einem Refresh darf bereits angezeigte echte Inhalte nicht durch einen leeren State ersetzen.
- Personalisierungs- und Rankinglogik darf nur auf expliziten Discovery-Flächen wie dem Für-dich-Feed angewendet werden. Funktionale Übersichten wie Profilbeiträge, Stadion-Inhalte und spielbezogene Content-Ansichten müssen alle grundsätzlich sichtbaren Remote-Inhalte vollständig erreichbar halten. Vollständige Inhaltsübersichten wie Stadion → Beiträge, Profil → Beiträge und spielbezogene Inhaltsansichten müssen dafür ihre eigene vollständige Remote-Datenbasis verwenden — nicht den (ggf. auf die Feed-Arbeitsmenge begrenzten) State des personalisierten Feeds. Stadion → Beiträge zeigt alle grundsätzlich sichtbaren Beiträge des aktiven Vereins unabhängig von game_id und unabhängig vom personalisierten Feed.
- Der personalisierte Für-dich-Feed ist niemals Source of Truth für andere Post-Ansichten. Post-Detailseiten müssen einen Post anhand seiner ID direkt aus der Remote-Datenquelle laden können, auch wenn der Post nicht im aktuellen Feed-State vorhanden ist. Stadion- und Game-Content verwenden vollständige Remote-Queries und niemals die personalisierte Feed-Ergebnismenge. Ranking beeinflusst ausschließlich Discovery, nicht die globale Erreichbarkeit bestehender Inhalte. Konkret gilt das für Post Detail, Profilbeiträge, Stadionbeiträge und Spielbeiträge: Post Detail lädt eine echte Supabase-ID immer unabhängig direkt, "Spiel → Beiträge" lädt vollständige Remote-Inhalte nach `game_id`. Remote-Fehler bei diesen Ladefunktionen (z. B. in `resolveContentByIds`) müssen klar behandelt/weitergereicht werden, nie stillschweigend als "0 Ergebnisse" erscheinen.
- Ein Stadion-/Spielbesuch wird unabhängig von der Anzahl der zugehörigen Posts höchstens einmal pro Nutzer und `game_id` gezählt.
- `user_game_attendance` ist die zentrale fachliche Datenquelle für besuchte Spiele und soll sowohl Stadionplan als auch Profilstatistik versorgen.
- Abzeichen werden aus serverseitig nachvollziehbaren Statistikwerten abgeleitet und dürfen nicht als frei manipulierbare Profilwerte gespeichert werden.
- Ein gelöschter oder ausgeblendeter Source-Post löscht einen bereits dokumentierten Attendance-Eintrag nicht automatisch.
- Private Gruppen sind für Nicht-Mitglieder serverseitig verborgen und dürfen nicht über Discovery, Feed, direkte Routen oder Gruppeninhalte Informationen leaken.
- `group_members` ist die Source of Truth für Gruppenmitgliedschaft; accepted `group_invitations` erzeugen atomar eine Membership.
- Private Gruppenmitgliedschaft kann ausschließlich über autorisierte bestehende Mechanismen bzw. eine gültige Einladung entstehen.
- Private Gruppenposts dürfen nur Mitgliedern im normalen Feed angezeigt werden.
- Notification-Einladungen sind nicht selbst Source of Truth für Membership.
- Sichtbarkeit (`public`/`closed`/`invite_only`) und Gruppenstruktur (`standalone`/`parent`/`subgroup`) einer Gruppe sind zwei voneinander unabhängige Eigenschaften und dürfen nie miteinander vermischt oder voneinander abgeleitet werden.
- Die drei Gruppen-Sichtbarkeitsstufen sind exakt: `public` (auffindbar, direkter Beitritt), `closed` (auffindbar, Beitritt nur nach Freigabe durch einen Admin), `invite_only` (für Nicht-Mitglieder nicht auffindbar, Mitgliedschaft ausschließlich über Einladung).
- Eine Untergruppe darf serverseitig nie weniger geschützt sein als ihre Hauptgruppe (Rangfolge `public` < `closed` < `invite_only`); das wird bei jeder Sichtbarkeitsänderung in beide Richtungen (Hauptgruppe vs. Untergruppen, Untergruppe vs. Hauptgruppe) geprüft.
- Mitgliedschaft in einer Hauptgruppe und Mitgliedschaft in ihren Untergruppen sind unabhängig voneinander — Hauptgruppenmitglied zu sein bedeutet nicht automatisch, Mitglied einer bestimmten Untergruppe zu sein.
- Eine Einladung zu oder ein Beitritt in eine Untergruppe setzt eine bestehende Mitgliedschaft in der zugehörigen Hauptgruppe voraus und wird serverseitig sowohl beim Einladen als auch beim Annehmen erneut geprüft.
- Verlässt ein Nutzer eine Hauptgruppe oder wird er aus ihr entfernt, kaskadiert das atomar auf die Mitgliedschaft in allen ihren Untergruppen — nie umgekehrt, und nie nur teilweise.
- `group_members` bleibt unabhängig von Sichtbarkeit und Struktur die alleinige Source of Truth für Gruppenmitgliedschaft; Sichtbarkeits-/Strukturfelder in `groups` regeln nur, wie eine Mitgliedschaft zustande kommen darf.
- Der Match Lock richtet sich ausschließlich nach `profiles.favorite_team_id`, nicht nach `activeTeamId`.
- Während eines bestätigten laufenden Spiels des Lieblingsvereins ersetzt der zentrale MatchLockGate den normalen App-Inhalt.
- Match Lock arbeitet fail-open: unbekannter oder fehlgeschlagener Live-Status darf keinen neuen Lock erzeugen.
- Der Match Lock darf nicht allein aus einer festen 90-Minuten-Zeitspanne abgeleitet werden.
- Direkte Routen und Deep Links dürfen einen aktiven Match Lock nicht umgehen.
- Nach beendetem Spiel muss die App ohne Neustart wieder freigegeben werden.
- `public.user_warnings` ist die alleinige Source of Truth für Verwarnungen; `apply_report_action` ist der einzige Schreibpfad, der eine Verwarnung erzeugt (genau ein Insert pro Moderationsaktion).
- Eine Verwarnung wird nie gelöscht, auch nicht nach „Zur Kenntnis genommen" — nur `acknowledged_at` wird gesetzt; die Zeile bleibt dauerhaft für die Moderationshistorie erhalten.
- Eine unbestätigte Verwarnung (`acknowledged_at is null`) ist ausschließlich im eigenen Profil des betroffenen Nutzers sichtbar, nie im Profil eines anderen Nutzers.
- Das Bestätigen einer Verwarnung geschieht ausschließlich über die serverseitige, idempotente Funktion `acknowledge_user_warning`, niemals über ein direktes Client-Update.
- Jede über `apply_report_action` erzeugte Verwarnung erzeugt genau eine Notification (`warning_received`, über `create_notification`, `event_key` an die Warning-ID gebunden) — kein zweiter Erzeugungspfad.
- Welche Vereine in der Beta auswählbar sind, wird ausschließlich über `BETA_ENABLED_CLUB_IDS`/`isClubEnabledForBeta`/`filterEnabledClubs` in `mobile/config/beta-clubs.ts` gesteuert — kein zweiter, paralleler Ort für diese Liste.
- Die Beta-Vereinsfreigabe filtert nur an den Auswahl-Oberflächen (`ClubPicker`-Konsumenten); `GamesContext.knownTeams`/`getKnownTeamById` und `public.team_stadium_mappings` bleiben immer vollständig, damit bereits bestehende Profile/aktive Vereine außerhalb der Allowlist weiterhin korrekt aufgelöst werden.

## Zusammenarbeit (mehrere Entwickler)

An Kurvenconnect arbeiten mehrere Personen parallel, jeweils mit eigenem Claude Code. Damit sich niemand in die Quere kommt:

- Nie direkt auf `main` committen oder pushen. Jede Aufgabe auf einem eigenen Feature-Branch (`<name>/<kurze-beschreibung>`), vorher `main` pullen.
- Änderungen kommen ausschließlich per Pull Request nach `main`; der jeweils andere reviewt. PRs klein halten (eine Funktion pro PR) und zügig mergen.
- Zentrale Dateien (`mobile/app/_layout.tsx`, globale Contexts, `mobile/config/beta-clubs.ts`, `mobile/package.json`) nur nach Absprache ändern.
- Supabase-Migrationen (`mobile/supabase/migrations/`) nur per PR hinzufügen; vor dem Anlegen einer neuen Migration `main` pullen, damit der Zeitstempel nach allen bestehenden liegt.
- `supabase db push` auf das Produktivprojekt führt ausschließlich der Projektinhaber (Emil) nach dem Merge aus. Andere Entwickler testen Migrationen in ihrem eigenen Supabase-Dev-Projekt — niemals Migrationen oder Datenänderungen direkt gegen das Produktivprojekt ausführen.
- `.env` wird nie committet und Zugangsdaten werden nie in Code, Commits, PRs oder Issues geschrieben; nur der `anon`-Key wird geteilt, nie der `service_role`-Key.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
