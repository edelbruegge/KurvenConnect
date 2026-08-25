import { LegalDraftNotice, LegalHeading, LegalListItem, LegalPage, LegalParagraph } from '@/components/legal/legal-page';

// Entwurf, inhaltlich auf Basis der tatsächlichen Datenverarbeitung dieses Projekts (Supabase als
// Backend für Auth/Datenbank/Storage, OpenLigaDB für öffentliche Spieldaten, Expo-Push für
// Benachrichtigungen -- siehe supabase/migrations/ als Quelle für die tatsächlich gespeicherten
// Felder). Zwei Stellen sind bewusst noch Platzhalter, weil sie nicht aus dem Code ableitbar sind:
// die verantwortliche Stelle (siehe Impressum) und die genaue Hosting-Region des Supabase-Projekts
// (relevant für Angaben zu Drittlandtransfers) -- beide vor Veröffentlichung ergänzen.
export default function DatenschutzScreen() {
  return (
    <LegalPage updatedAt="[Datum]">
      <LegalDraftNotice />

      <LegalParagraph>
        Diese Datenschutzerklärung informiert dich darüber, welche personenbezogenen Daten
        Kurvenconnect verarbeitet, wenn du die App nutzt, und welche Rechte dir dabei zustehen.
      </LegalParagraph>

      <LegalHeading>1. Verantwortlicher</LegalHeading>
      <LegalParagraph>
        Verantwortlich für die Datenverarbeitung ist die im Impressum genannte Stelle. [Angaben
        dort vor Veröffentlichung vervollständigen.]
      </LegalParagraph>

      <LegalHeading>2. Welche Daten wir verarbeiten</LegalHeading>
      <LegalParagraph>Bei der Registrierung und Kontoführung:</LegalParagraph>
      <LegalListItem>E-Mail-Adresse und Passwort (verschlüsselt gespeichert)</LegalListItem>
      <LegalListItem>Anzeigename, optional Profilbild, Wohnort/Region und Kurzbeschreibung</LegalListItem>
      <LegalListItem>Ausgewählter Lieblingsverein</LegalListItem>
      <LegalParagraph>Bei der Nutzung der Plattform, jeweils nur soweit du sie selbst anlegst:</LegalParagraph>
      <LegalListItem>Beiträge, Fahrtangebote, Treffpunkte und Gesuche inklusive Bildern</LegalListItem>
      <LegalListItem>Kommentare, Likes, gespeicherte Beiträge, Folge- und Blockierbeziehungen</LegalListItem>
      <LegalListItem>Nachrichteninhalte in Unterhaltungen und Gruppenchats</LegalListItem>
      <LegalListItem>Gruppenmitgliedschaften und darin geteilte Inhalte</LegalListItem>
      <LegalParagraph>Technisch, zur Bereitstellung der Funktionen:</LegalParagraph>
      <LegalListItem>Push-Benachrichtigungs-Token deines Geräts, sofern du Benachrichtigungen erlaubst</LegalListItem>
      <LegalListItem>Zeitstempel von Anmeldungen und Änderungen an deinem Konto</LegalListItem>
      <LegalParagraph>
        Eine Standortermittlung über GPS findet nicht statt — Ortsangaben (z. B. Wohnort, Start-
        und Zielort einer Fahrt) werden ausschließlich von dir selbst als Text eingegeben.
      </LegalParagraph>

      <LegalHeading>3. Zwecke der Verarbeitung</LegalHeading>
      <LegalListItem>Bereitstellung deines Kontos und der Kernfunktionen der App</LegalListItem>
      <LegalListItem>Personalisierung von Feed und Spielplan nach deinem Lieblingsverein</LegalListItem>
      <LegalListItem>Ermöglichung der Kommunikation zwischen Nutzer:innen (Nachrichten, Gruppen, Kommentare)</LegalListItem>
      <LegalListItem>Sicherheit, Missbrauchsprävention und Bearbeitung von Meldungen</LegalListItem>
      <LegalListItem>Versand von Benachrichtigungen zu Ereignissen, die dich betreffen</LegalListItem>

      <LegalHeading>4. Rechtsgrundlage</LegalHeading>
      <LegalParagraph>
        Die Verarbeitung erfolgt zur Erfüllung des Nutzungsvertrags mit dir (Art. 6 Abs. 1 lit. b
        DSGVO) sowie, für Sicherheits- und Moderationsmaßnahmen, auf Grundlage unseres berechtigten
        Interesses an einer funktionierenden, sicheren Plattform (Art. 6 Abs. 1 lit. f DSGVO).
      </LegalParagraph>

      <LegalHeading>5. Weitergabe an Dritte / Auftragsverarbeiter</LegalHeading>
      <LegalListItem>
        Supabase (Hosting, Authentifizierung, Datenbank, Dateispeicher) — verarbeitet sämtliche
        oben genannten Daten in unserem Auftrag. Hosting-Region: [zu bestätigen — EU oder USA,
        relevant für Angaben zu Drittlandtransfers].
      </LegalListItem>
      <LegalListItem>
        OpenLigaDB — liefert öffentliche Spielplan- und Ergebnisdaten; wir übermitteln dabei keine
        personenbezogenen Daten an diesen Dienst.
      </LegalListItem>
      <LegalListItem>
        Apple/Google bzw. der von Expo betriebene Push-Dienst — zur Zustellung von
        Benachrichtigungen an dein Gerät, sofern aktiviert.
      </LegalListItem>
      <LegalParagraph>Ein Verkauf deiner Daten an Dritte findet nicht statt.</LegalParagraph>

      <LegalHeading>6. Speicherdauer</LegalHeading>
      <LegalParagraph>
        Wir speichern deine Daten, solange dein Konto besteht. Löschst du dein Konto über die
        Funktion „Konto löschen“ in der App, werden dein Profil sowie deine eigenen Inhalte,
        Nachrichten und Mitgliedschaften unmittelbar und dauerhaft entfernt. Inhalte, die für
        andere Nutzer:innen weiterhin von Bedeutung sind (z. B. eine gemeinsame Unterhaltung),
        bleiben für diese sichtbar, jedoch ohne Zuordnung zu deinem gelöschten Konto.
      </LegalParagraph>

      <LegalHeading>7. Deine Rechte</LegalHeading>
      <LegalListItem>Auskunft über die zu dir gespeicherten Daten (Art. 15 DSGVO)</LegalListItem>
      <LegalListItem>Berichtigung unrichtiger Daten (Art. 16 DSGVO) — direkt in der App über „Profil bearbeiten“</LegalListItem>
      <LegalListItem>Löschung (Art. 17 DSGVO) — direkt in der App über „Konto löschen“, oder auf Anfrage</LegalListItem>
      <LegalListItem>Einschränkung der Verarbeitung (Art. 18 DSGVO)</LegalListItem>
      <LegalListItem>Datenübertragbarkeit (Art. 20 DSGVO)</LegalListItem>
      <LegalListItem>Widerspruch gegen Verarbeitungen auf Grundlage berechtigten Interesses (Art. 21 DSGVO)</LegalListItem>
      <LegalListItem>Beschwerde bei einer Datenschutzaufsichtsbehörde</LegalListItem>
      <LegalParagraph>Für Auskunfts- oder Löschanfragen wende dich an die im Impressum genannte Kontaktadresse.</LegalParagraph>

      <LegalHeading>8. Datensicherheit</LegalHeading>
      <LegalParagraph>
        Die Übertragung erfolgt verschlüsselt (TLS). Der Zugriff auf deine Daten ist serverseitig
        über Zugriffsregeln so eingeschränkt, dass jeweils nur berechtigte Nutzer:innen bestimmte
        Inhalte einsehen können (z. B. private Gruppen nur für ihre Mitglieder, blockierte
        Nutzer:innen sehen sich gegenseitig keine Inhalte mehr).
      </LegalParagraph>

      <LegalHeading>9. Mindestalter</LegalHeading>
      <LegalParagraph>[Offen — Mindestalter für die Nutzung festlegen und hier ergänzen, sobald entschieden.]</LegalParagraph>

      <LegalHeading>10. Änderungen dieser Erklärung</LegalHeading>
      <LegalParagraph>
        Wir passen diese Datenschutzerklärung an, wenn sich die Datenverarbeitung ändert. Die
        jeweils aktuelle Fassung ist immer in der App abrufbar.
      </LegalParagraph>
    </LegalPage>
  );
}
