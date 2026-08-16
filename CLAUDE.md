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

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
