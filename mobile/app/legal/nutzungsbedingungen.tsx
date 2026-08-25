import { LegalDraftNotice, LegalHeading, LegalListItem, LegalPage, LegalParagraph } from '@/components/legal/legal-page';

// Entwurf, inhaltlich abgeleitet aus den tatsächlich vorhandenen Funktionen und Regeln dieses
// Projekts (Meldegründe aus dem Melde-/Moderationssystem, Fahrgemeinschafts-Hinweis aus dem
// ursprünglichen Produkt-Masterprompt, Verweis auf die echte In-App-Löschfunktion).
export default function NutzungsbedingungenScreen() {
  return (
    <LegalPage updatedAt="[Datum]">
      <LegalDraftNotice />

      <LegalHeading>1. Geltungsbereich</LegalHeading>
      <LegalParagraph>
        Diese Nutzungsbedingungen gelten für die Nutzung der App Kurvenconnect durch registrierte
        Nutzer:innen. Mit der Registrierung erkennst du sie an.
      </LegalParagraph>

      <LegalHeading>2. Registrierung und Konto</LegalHeading>
      <LegalListItem>Du machst bei der Registrierung wahrheitsgemäße Angaben.</LegalListItem>
      <LegalListItem>Ein Konto ist persönlich und nicht auf andere Personen übertragbar.</LegalListItem>
      <LegalListItem>Du bist für die Geheimhaltung deines Passworts selbst verantwortlich.</LegalListItem>
      <LegalListItem>[Mindestalter zur Registrierung — festlegen und hier ergänzen.]</LegalListItem>

      <LegalHeading>3. Inhalte, die du teilst</LegalHeading>
      <LegalParagraph>
        Die Rechte an deinen eigenen Beiträgen, Bildern und Nachrichten bleiben bei dir. Mit dem
        Veröffentlichen räumst du Kurvenconnect das Recht ein, diese Inhalte innerhalb der App an
        die dafür vorgesehenen Empfänger:innen (z. B. andere Mitglieder deiner Gruppe, alle
        Nutzer:innen bei öffentlichen Beiträgen) anzuzeigen. Du bestätigst, dass du zur
        Veröffentlichung der von dir geteilten Inhalte berechtigt bist.
      </LegalParagraph>

      <LegalHeading>4. Verhaltensregeln</LegalHeading>
      <LegalParagraph>Innerhalb von Kurvenconnect ist insbesondere Folgendes nicht gestattet:</LegalParagraph>
      <LegalListItem>Beleidigung, Diskriminierung oder Androhung von Gewalt gegenüber anderen Nutzer:innen</LegalListItem>
      <LegalListItem>Betrug, gefälschte Angebote oder bewusst falsche Angaben, insbesondere bei Ticket- oder Fahrtangeboten</LegalListItem>
      <LegalListItem>Spam sowie das Versenden unerwünschter Werbung</LegalListItem>
      <LegalListItem>Verhalten, das andere Nutzer:innen gefährdet, etwa eine erkennbar gefährliche Fahrtdurchführung</LegalListItem>
      <LegalParagraph>
        Verstöße kannst du über die Melde-Funktion in der App melden. Gemeldete Fälle werden von
        unserem Moderationsteam geprüft; mögliche Folgen reichen von einer Verwarnung bis zur
        Sperrung des Kontos.
      </LegalParagraph>

      <LegalHeading>5. Fahrgemeinschaften</LegalHeading>
      <LegalParagraph>
        Fahrten, die über Kurvenconnect vermittelt werden, sind private Kostenbeteiligungen
        zwischen Nutzer:innen und keine gewerbliche Personenbeförderung. Kurvenconnect ist an der
        eigentlichen Fahrt nicht beteiligt und übernimmt insbesondere keine Haftung für die
        Durchführung, Pünktlichkeit oder Sicherheit einer vermittelten Fahrt. Fahrer:innen sind
        selbst dafür verantwortlich, geltende Vorschriften (z. B. zu Versicherungsschutz)
        einzuhalten.
      </LegalParagraph>

      <LegalHeading>6. Haftung für Inhalte</LegalHeading>
      <LegalParagraph>
        Beiträge, Fahrt- und Treffpunktangebote sowie Gesuche stammen von Nutzer:innen selbst.
        Kurvenconnect prüft diese Inhalte nicht vorab und übernimmt keine Gewähr für ihre
        Richtigkeit, Aktualität oder Vollständigkeit.
      </LegalParagraph>

      <LegalHeading>7. Sperrung und Kündigung</LegalHeading>
      <LegalParagraph>
        Bei schwerwiegenden oder wiederholten Verstößen gegen diese Bedingungen können wir dein
        Konto einschränken oder sperren. Du kannst dein Konto jederzeit selbst über „Konto löschen“
        in den Profileinstellungen unwiderruflich löschen.
      </LegalParagraph>

      <LegalHeading>8. Änderungen dieser Bedingungen</LegalHeading>
      <LegalParagraph>
        Wir können diese Nutzungsbedingungen bei Bedarf anpassen, etwa wenn neue Funktionen
        hinzukommen. Über wesentliche Änderungen informieren wir dich in der App.
      </LegalParagraph>

      <LegalHeading>9. Anwendbares Recht</LegalHeading>
      <LegalParagraph>
        Es gilt deutsches Recht. [Gerichtsstand ergänzen, sobald die Betreiberform feststeht.]
      </LegalParagraph>
    </LegalPage>
  );
}
