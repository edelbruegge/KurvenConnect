import { LegalHeading, LegalPage, LegalParagraph, LegalPlaceholderNotice } from '@/components/legal/legal-page';

// Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG, vormals § 5 TMG). Betreiberform noch nicht
// entschieden (Stand dieser Fassung: eingetragene Firma vorgesehen, aber noch nicht eingetragen) --
// deshalb bewusst mit eckigen Klammern als Platzhalter, nicht mit erfundenen Angaben.
export default function ImpressumScreen() {
  return (
    <LegalPage updatedAt="[Datum]">
      <LegalPlaceholderNotice />

      <LegalHeading>Angaben gemäß § 5 DDG</LegalHeading>
      <LegalParagraph>
        [Name / Firma]{'\n'}
        [Rechtsform, sobald eingetragen]{'\n'}
        [Straße Hausnummer]{'\n'}
        [PLZ Ort]
      </LegalParagraph>

      <LegalHeading>Vertreten durch</LegalHeading>
      <LegalParagraph>[Name der vertretungsberechtigten Person]</LegalParagraph>

      <LegalHeading>Kontakt</LegalHeading>
      <LegalParagraph>
        E-Mail: [kontakt@beispiel.de]{'\n'}
        Telefon: [optional]
      </LegalParagraph>

      <LegalHeading>Registereintrag</LegalHeading>
      <LegalParagraph>
        [Falls als Firma eingetragen: Registergericht und Registernummer. Falls Betrieb als
        Privatperson/Kleinunternehmer: diesen Abschnitt entfernen.]
      </LegalParagraph>

      <LegalHeading>Umsatzsteuer-ID</LegalHeading>
      <LegalParagraph>[Falls vorhanden: Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG. Sonst entfernen.]</LegalParagraph>

      <LegalHeading>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</LegalHeading>
      <LegalParagraph>[Name, Anschrift wie oben]</LegalParagraph>

      <LegalHeading>EU-Streitschlichtung</LegalHeading>
      <LegalParagraph>
        Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:
        https://ec.europa.eu/consumers/odr/. Unsere E-Mail-Adresse findest du oben unter Kontakt.
      </LegalParagraph>

      <LegalHeading>Verbraucherstreitbeilegung</LegalHeading>
      <LegalParagraph>
        Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen. [Bei Bedarf anpassen, falls sich das ändert.]
      </LegalParagraph>
    </LegalPage>
  );
}
