'use strict';
// Beispieldaten: Sporthaus-Stammdaten, Backend-Benutzer, VsB Mellernau (25 Artikel, Seiten, Demo-Bestellungen)
// und ein fiktiver zweiter Verein (SG Musterdorf), um die Mehrmandantenfähigkeit zu zeigen.
//
//   npm run seed             – legt Beispieldaten an (bricht ab, wenn der VsB-Shop schon existiert)
//   npm run seed -- --reset  – leert vorher alle Tabellen (außer Sessions) und legt alles neu an
const { db, get, all, run, tx, setSetting, DEFAULT_SETTINGS } = require('./db');
const { hashPassword } = require('./lib/auth');
const { createOrder, changeStatus, addMessage } = require('./lib/orders');
const { summarizeCart } = require('./lib/pricing');

const eur = (n) => (n == null ? null : Math.round(n * 100));

// ---------------------------------------------------------------- Farben, Größen, Drucke
const C = {
  royal: { name: 'New Royal/Weiß', hex: '#1f4fbf', hex2: '#ffffff' },
  royalGreen: { name: 'New Royal/Green', hex: '#1f4fbf', hex2: '#3cb54a' },
  vfb: { name: 'Vereinsblau/Weiß', hex: '#1b2d9a', hex2: '#ffffff' },
  cobalt: { name: 'Club Cobolt', hex: '#2348b8', hex2: '#ffffff' },
  navy: { name: 'Navy/Weiß', hex: '#1b2a4a', hex2: '#ffffff' },
  navyRoyal: { name: 'Navy/New Royal', hex: '#1b2a4a', hex2: '#1f4fbf' },
  black: { name: 'Schwarz/Weiß', hex: '#1d1d1f', hex2: '#ffffff' },
  blackRoyal: { name: 'Schwarz/Royal', hex: '#1d1d1f', hex2: '#1f4fbf' },
  white: { name: 'Weiß/Royal', hex: '#ffffff', hex2: '#1f4fbf' },
  green: { name: 'Grün/Weiß', hex: '#2f9a45', hex2: '#ffffff' },
  grey: { name: 'Grau meliert', hex: '#9a9ca3', hex2: '#1b2a4a' },
  neon: { name: 'Neongelb/Schwarz', hex: '#d9ef2c', hex2: '#1d1d1f' },
  orange: { name: 'Orange/Schwarz', hex: '#f26a1b', hex2: '#1d1d1f' },
  // SG Musterdorf
  red: { name: 'Rot/Weiß', hex: '#c8102e', hex2: '#ffffff' },
  redBlack: { name: 'Rot/Schwarz', hex: '#c8102e', hex2: '#1d1d1f' },
  blackRed: { name: 'Schwarz/Rot', hex: '#1d1d1f', hex2: '#c8102e' },
};

const S = {
  adult: ['S', 'M', 'L', 'XL', 'XXL', '3XL'],
  adultKids: ['116', '128', '140', '152', '164', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'],
  ladies: ['34', '36', '38', '40', '42', '44'],
  kids: ['116', '128', '140', '152', '164'],
  kidsSmall: ['110', '116', '122', '128', '134', '140', '146', '152'],
  socks: ['27–30', '31–34', '35–38', '39–42', '43–46'],
  cap: ['S/M', 'L/XL'],
};

const PRINT = {
  name: { key: 'name', label: 'Name Rücken', max_length: 14, price_cents: 350, placeholder: 'MÜLLER' },
  number: { key: 'number', label: 'Rückennummer', max_length: 2, price_cents: 250, placeholder: '10' },
  initials: { key: 'initials', label: 'Initialen Brust', max_length: 4, price_cents: 200, placeholder: 'MM' },
  firstName: { key: 'vorname', label: 'Vorname Rücken', max_length: 12, price_cents: 350, placeholder: 'LENA' },
  bagName: { key: 'name', label: 'Name auf Tasche', max_length: 14, price_cents: 400, placeholder: 'MÜLLER' },
  embroidery: { key: 'stick', label: 'Namensstick', max_length: 16, price_cents: 600, placeholder: 'Lena Müller' },
};

// ---------------------------------------------------------------- VsB-Sortiment (25 Artikel)
// Preise angelehnt an die bisherige Vereinskollektion bei Sporthaus Ullmann.
const VSB_PRODUCTS = [
  // ---- Turnen & RSG (Craft)
  {
    sku: '1912170', brand: 'Craft', name: 'RSG Rush Slim Singlet Damen', category: 'Turnen & RSG', illustration: 'tank',
    price: 17.97, uvp: 29.95, sizes: S.ladies, colors: [C.cobalt, C.black], featured: true,
    description: 'Eng anliegendes Singlet aus schnell trocknendem Funktionsmaterial – ideal für Training und Wettkampf der RSG.\n\n- Racerback für volle Bewegungsfreiheit\n- Flachnähte gegen Scheuern\n- Material: 88 % Polyester, 12 % Elasthan',
    logo_print: 'Vereinslogo Brust links', prints: [PRINT.firstName],
  },
  {
    sku: '1912171', brand: 'Craft', name: 'RSG Singlet Kinder', category: 'Turnen & RSG', illustration: 'tank',
    price: 11.86, uvp: 16.95, sizes: S.kidsSmall, colors: [C.cobalt, C.black],
    description: 'Das Trainings-Singlet für unsere jüngsten Turnerinnen. Leicht, elastisch und pflegeleicht.',
    logo_print: 'Vereinslogo Brust links', prints: [PRINT.firstName],
  },
  {
    sku: '1912175', brand: 'Craft', name: 'RSG Rush Hotpants Damen', category: 'Turnen & RSG', illustration: 'shorts',
    price: 23.97, uvp: 39.95, sizes: S.ladies, colors: [C.black, C.cobalt],
    description: 'Kurze, eng anliegende Hotpants mit breitem Bund. Rutscht nicht, kneift nicht.',
    logo_print: 'Vereinsschriftzug Bein links',
  },
  {
    sku: '1912176', brand: 'Craft', name: 'RSG Rush Hotpants Kinder', category: 'Turnen & RSG', illustration: 'shorts',
    price: 14.97, uvp: 24.95, sizes: S.kidsSmall, colors: [C.black, C.cobalt],
    description: 'Die Hotpants in Kindergrößen – perfekt kombinierbar mit dem RSG Singlet Kinder.',
    logo_print: 'Vereinsschriftzug Bein links',
  },
  {
    sku: '1912180', brand: 'Craft', name: 'RSG Rush Tights Damen', category: 'Turnen & RSG', illustration: 'tights',
    price: 23.97, uvp: 39.95, sizes: S.ladies, colors: [C.black],
    description: 'Lange Tights mit hohem Bund und Kompressionswirkung für Training und Aufwärmen.',
    logo_print: 'Vereinsschriftzug Bein links',
  },
  {
    sku: '1912181', brand: 'Craft', name: 'RSG Rush Tights Kinder', category: 'Turnen & RSG', illustration: 'tights',
    price: 20.97, uvp: 34.95, sizes: S.kidsSmall, colors: [C.black],
    description: 'Lange Tights für Kinder – elastisch, blickdicht und angenehm weich.',
    logo_print: 'Vereinsschriftzug Bein links',
  },
  // ---- Jacken & Hoodies
  {
    sku: '1072302', brand: 'Erima', name: 'Hoody Evo Star', category: 'Jacken & Hoodies', illustration: 'hoodie',
    price: 35.99, uvp: 54.99, sizes: S.adultKids, colors: [C.royal, C.navy, C.grey], featured: true,
    variants: [{ name: 'Herren', price_cents: null }, { name: 'Damen', price_cents: null }, { name: 'Kinder', price_cents: eur(32.99) }],
    description: 'Der Vereins-Hoodie für alle Abteilungen. Weiches Sweatmaterial mit angerauter Innenseite, Kängurutasche und gefütterter Kapuze.\n\n- Damen-Ausführung tailliert geschnitten\n- Material: 60 % Baumwolle, 40 % Polyester',
    logo_print: 'Vereinslogo Brust links + "VsB Mellernau" Rücken', prints: [PRINT.name, PRINT.initials],
  },
  {
    sku: '1032320', brand: 'Erima', name: 'Liga Star Trainingsjacke', category: 'Jacken & Hoodies', illustration: 'jacket',
    price: 26.99, uvp: 44.99, sizes: S.adultKids, colors: [C.royalGreen, C.navy, C.black], featured: true,
    variants: [{ name: 'Erwachsene', price_cents: null }, { name: 'Kinder', price_cents: eur(23.99) }],
    description: 'Strapazierfähige Trainingsjacke für Training und Spiel.\n\n- Feuchtigkeitsregulierendes Material, Raglanschnitt und elastische Einsätze\n- Reißverschlusstaschen für Kleinteile\n- Schützender Stehkragen, kontrastfarbenes Piping an den Ärmeln\n- Material: 100 % Polyester',
    logo_print: 'Vereinslogo Brust links', prints: [PRINT.name, PRINT.initials],
  },
  {
    sku: '1032330', brand: 'Erima', name: 'Liga Star Präsentationsjacke', category: 'Jacken & Hoodies', illustration: 'jacket',
    price: 34.99, uvp: 59.99, sizes: S.adultKids, colors: [C.navyRoyal, C.black],
    variants: [{ name: 'Erwachsene', price_cents: null }, { name: 'Kinder', price_cents: eur(31.99) }],
    description: 'Die elegante Jacke für Auswärtsfahrten, Turniere und Siegerehrungen. Webware mit leichtem Glanz und Mesh-Futter.',
    logo_print: 'Vereinslogo Brust links', prints: [PRINT.name],
  },
  {
    sku: '1062301', brand: 'Erima', name: 'Squad Steppweste', category: 'Jacken & Hoodies', illustration: 'vest',
    price: 39.99, uvp: 64.99, sizes: S.adult, colors: [C.navy, C.black],
    description: 'Leicht wattierte Weste – perfekt für Trainer, Betreuer und Eltern am Spielfeldrand.\n\n- Wasserabweisende Oberfläche\n- Zwei Seitentaschen mit Reißverschluss',
    logo_print: 'Vereinslogo Brust links', prints: [PRINT.initials],
  },
  // ---- Trainingsbekleidung
  {
    sku: '1262301', brand: 'Erima', name: 'Liga Star Trainingstop', category: 'Trainingsbekleidung', illustration: 'halfzip',
    price: 26.99, uvp: 44.99, sizes: S.adultKids, colors: [C.royalGreen, C.navy],
    variants: [{ name: 'Erwachsene', price_cents: null }, { name: 'Kinder', price_cents: eur(23.99) }],
    description: 'Langarm-Trainingstop mit kurzem Reißverschluss und Stehkragen. Leicht, atmungsaktiv und schnell trocknend.',
    logo_print: 'Vereinslogo Brust links', prints: [PRINT.name, PRINT.initials],
  },
  {
    sku: '1082301', brand: 'Erima', name: 'Liga Star T-Shirt', category: 'Trainingsbekleidung', illustration: 'tshirt',
    price: 16.19, uvp: 26.99, sizes: S.adultKids, colors: [C.royalGreen, C.navy, C.white, C.black],
    variants: [{ name: 'Erwachsene', price_cents: null }, { name: 'Kinder', price_cents: eur(13.19) }],
    description: 'Funktions-T-Shirt für jedes Training. Feuchtigkeitsregulierend und formstabil.',
    logo_print: 'Vereinslogo Brust links', prints: [PRINT.name, PRINT.number, PRINT.initials],
  },
  {
    sku: '1112301', brand: 'Erima', name: 'Liga Star Polo', category: 'Trainingsbekleidung', illustration: 'polo',
    price: 23.99, uvp: 39.99, sizes: S.adultKids, colors: [C.royal, C.navy, C.white],
    variants: [{ name: 'Erwachsene', price_cents: null }, { name: 'Kinder', price_cents: eur(20.99) }],
    description: 'Sportliches Poloshirt mit Knopfleiste – für Vereinsfeste, Betreuer und Trainer.',
    logo_print: 'Vereinslogo Brust links', prints: [PRINT.initials],
  },
  {
    sku: '1332301', brand: 'Erima', name: 'Liga Star Longsleeve', category: 'Trainingsbekleidung', illustration: 'longsleeve',
    price: 19.99, uvp: 32.99, sizes: S.adultKids, colors: [C.royal, C.black], active: false,
    description: 'Langarm-Funktionsshirt für kühle Trainingstage. *Auslaufmodell – derzeit nicht bestellbar.*',
    logo_print: 'Vereinslogo Brust links', prints: [PRINT.name],
  },
  {
    sku: '1102301', brand: 'Erima', name: 'Liga Trainingshose', category: 'Hosen', illustration: 'pants',
    price: 23.99, uvp: 39.99, sizes: S.adultKids, colors: [C.black, C.navy],
    variants: [{ name: 'Erwachsene', price_cents: null }, { name: 'Kinder', price_cents: eur(21.99) }],
    description: 'Schmal geschnittene Trainingshose mit Reißverschlüssen am Beinabschluss und Seitentaschen.',
    logo_print: 'Vereinsschriftzug Bein links', prints: [PRINT.initials],
  },
  {
    sku: '3152301', brand: 'Erima', name: 'Liga Star Shorts', category: 'Hosen', illustration: 'shorts',
    price: 14.99, uvp: 24.99, sizes: S.adultKids, colors: [C.royal, C.black, C.white],
    variants: [{ name: 'Erwachsene', price_cents: null }, { name: 'Kinder', price_cents: eur(12.99) }],
    funding: 'subsidy', subsidy: 5,
    description: 'Spiel- und Trainingsshorts mit Innenslip und elastischem Bund mit Kordel.\n\n**Der Verein gibt 5 € pro Hose dazu.**',
    logo_print: 'Rückennummer Bein links (optional)', prints: [PRINT.number],
  },
  // ---- Trikots & Fußball
  {
    sku: '3132301', brand: 'Erima', name: 'Liga Star Trikot', category: 'Trikots & Fußball', illustration: 'jersey',
    price: 24.99, uvp: 39.99, sizes: S.adultKids, colors: [C.royal, C.white, C.green], featured: true,
    variants: [{ name: 'Erwachsene', price_cents: null }, { name: 'Kinder', price_cents: eur(21.99) }],
    funding: 'subsidy', subsidy: 10,
    description: 'Das offizielle Heimtrikot des VsB. Leichtes, atmungsaktives Mesh-Material mit V-Ausschnitt.\n\n**Der Verein gibt 10 € pro Trikot dazu.**',
    logo_print: 'Vereinslogo Brust + Sponsor', prints: [PRINT.name, PRINT.number],
  },
  {
    sku: '3132350', brand: 'Erima', name: 'Spieltrikot Mannschaftssatz', category: 'Trikots & Fußball', illustration: 'jersey',
    price: 29.99, uvp: 44.99, sizes: S.adultKids, colors: [C.vfb],
    funding: 'club_article',
    description: 'Wettkampftrikot für gemeldete Spielerinnen und Spieler – **der Verein übernimmt den Trikotpreis**, du zahlst nur Name und Nummer.\n\nBitte nur nach Absprache mit deinem Trainer bestellen.',
    logo_print: 'Vereinslogo Brust + Sponsor Brust', prints: [{ ...PRINT.number, required: true }, PRINT.name],
  },
  {
    sku: '3142301', brand: 'Erima', name: 'Pro Torwarttrikot', category: 'Trikots & Fußball', illustration: 'longsleeve',
    price: 32.99, uvp: 54.99, sizes: S.adultKids, colors: [C.neon, C.orange, C.black],
    variants: [{ name: 'Erwachsene', price_cents: null }, { name: 'Kinder', price_cents: eur(28.99) }],
    funding: 'subsidy', subsidy: 10,
    description: 'Langarm-Torwarttrikot mit gepolsterten Ellenbogen in Signalfarben.\n\n**Der Verein gibt 10 € pro Trikot dazu.**',
    logo_print: 'Vereinslogo Brust', prints: [PRINT.name, PRINT.number],
  },
  {
    sku: '3182301', brand: 'Erima', name: 'Classic Stutzen', category: 'Trikots & Fußball', illustration: 'socks',
    price: 9.99, uvp: 14.99, sizes: S.socks, colors: [C.royal, C.white, C.black],
    funding: 'club_article',
    description: 'Fußballstutzen mit verstärkter Sohle und Rippbund. **Für Spieler übernimmt der Verein die Stutzen.**',
  },
  // ---- Accessoires
  {
    sku: '2122301', brand: 'Erima', name: 'Team Cap', category: 'Accessoires', illustration: 'cap',
    price: 11.99, uvp: 17.99, sizes: S.cap, colors: [C.royal, C.navy, C.black],
    description: 'Baseball-Cap mit Klettverschluss und gesticktem Vereinslogo.', logo_print: 'Vereinslogo gestickt vorn',
  },
  {
    sku: '2122302', brand: 'Erima', name: 'Strickmütze', category: 'Accessoires', illustration: 'beanie',
    price: 12.99, uvp: 19.99, sizes: [], colors: [C.navyRoyal, C.black],
    description: 'Warme Strickmütze mit Umschlag – für Wintertraining und Spielfeldrand.', logo_print: 'Vereinslogo gestickt',
  },
  {
    sku: '1918011', brand: 'Jako', name: 'Sporttasche Team M', category: 'Accessoires', illustration: 'bag',
    price: 27.99, uvp: 44.99, sizes: [], colors: [C.navyRoyal, C.black],
    variants: [{ name: 'Größe M (50 l)', price_cents: null }, { name: 'Größe L (75 l)', price_cents: eur(32.99) }],
    description: 'Robuste Sporttasche mit Nassfach und Schuhfach. Verstellbarer Schultergurt.', logo_print: 'Vereinslogo Seite', prints: [PRINT.bagName],
  },
  {
    sku: '1818011', brand: 'Jako', name: 'Rucksack Team', category: 'Accessoires', illustration: 'backpack',
    price: 29.99, uvp: 44.99, sizes: [], colors: [C.navy, C.black],
    description: 'Rucksack mit gepolstertem Laptopfach, Bodenfach für Schuhe und Seitentaschen.', logo_print: 'Vereinslogo Front', prints: [PRINT.bagName],
  },
  {
    sku: 'VSB-HT-70', brand: 'Vereinsartikel', name: 'Duschtuch mit Vereinslogo', category: 'Accessoires', illustration: 'towel',
    price: 19.99, uvp: 29.95, sizes: [], colors: [C.vfb, C.white],
    variants: [{ name: '70 × 140 cm', price_cents: null }, { name: '50 × 100 cm', price_cents: eur(14.99) }],
    description: 'Flauschiges Frottee-Duschtuch mit eingesticktem VsB-Logo. Optional mit deinem Namen bestickt.', logo_print: 'Vereinslogo gestickt', prints: [PRINT.embroidery],
  },
];

// ---------------------------------------------------------------- SG Musterdorf (6 Artikel)
const SGM_PRODUCTS = [
  {
    sku: '3132301', brand: 'Erima', name: 'Liga Star Trikot', category: 'Trikots', illustration: 'jersey',
    price: 24.99, uvp: 39.99, sizes: S.adultKids, colors: [C.red, C.black], featured: true, funding: 'subsidy', subsidy: 7.5,
    description: 'Heimtrikot der SG. **Der Verein gibt 7,50 € dazu.**', logo_print: 'Wappen Brust', prints: [PRINT.name, PRINT.number],
  },
  {
    sku: '3152301', brand: 'Erima', name: 'Liga Star Shorts', category: 'Hosen', illustration: 'shorts',
    price: 14.99, uvp: 24.99, sizes: S.adultKids, colors: [C.blackRed, C.red], description: 'Spielshorts mit Innenslip.', prints: [PRINT.number],
  },
  {
    sku: '3182301', brand: 'Erima', name: 'Classic Stutzen', category: 'Trikots', illustration: 'socks',
    price: 9.99, uvp: 14.99, sizes: S.socks, colors: [C.red, C.black], funding: 'club_article', description: 'Die Stutzen zahlt der Verein.',
  },
  {
    sku: '1072302', brand: 'Erima', name: 'Hoody Evo Star', category: 'Freizeit', illustration: 'hoodie',
    price: 35.99, uvp: 54.99, sizes: S.adultKids, colors: [C.blackRed, C.red], featured: true,
    variants: [{ name: 'Erwachsene', price_cents: null }, { name: 'Kinder', price_cents: eur(32.99) }],
    description: 'Vereins-Hoodie mit Wappen.', logo_print: 'Wappen Brust', prints: [PRINT.name, PRINT.initials],
  },
  {
    sku: '1032320', brand: 'Erima', name: 'Liga Star Trainingsjacke', category: 'Freizeit', illustration: 'jacket',
    price: 26.99, uvp: 44.99, sizes: S.adultKids, colors: [C.blackRed], description: 'Trainingsjacke mit Wappen.', logo_print: 'Wappen Brust', prints: [PRINT.initials],
  },
  {
    sku: '2122301', brand: 'Erima', name: 'Team Cap', category: 'Freizeit', illustration: 'cap',
    price: 11.99, uvp: 17.99, sizes: S.cap, colors: [C.blackRed, C.redBlack], description: 'Cap mit gesticktem Wappen.',
  },
];

// ---------------------------------------------------------------- Texte
function storeLines(s) {
  return `${s.store_name}  \n${s.store_street}  \n${s.store_zip_city}`;
}

const VSB_INTRO = `Bestelle die Artikel der Vereinskollektion direkt hier – nur für Mitglieder des **VsB Mellernau e.V.** Anprobe im Sporthaus Ullmann ist möglich, Details findest du im [FAQ](/vsb-mellernau/seite/faq).`;

const VSB_ORDER_INFO = `**Abholung & Bezahlung:** Deine Bestellung holst du im Sporthaus Ullmann, Hohenbusch-Markt 1, 01108 Dresden ab und bezahlst sie dort (bar oder mit Karte).

**Bearbeitungszeit:** Wegen des Drucks bzw. der Beflockung beträgt die Lieferzeit ca. **2–3 Wochen**. Wir informieren dich, sobald deine Bestellung abholbereit ist.

Mit dem Absenden gibst du eine **verbindliche Bestellung** ab, da die Artikel individuell für dich bedruckt werden.`;

function globalPages(s) {
  return [
    {
      slug: 'impressum', title: 'Impressum', show_in_nav: 0, show_in_footer: 1, sort_order: 90,
      content: `## Angaben gemäß § 5 DDG

${storeLines(s)}

**Inhaber:** [Inhaber]

## Kontakt

Telefon: ${s.store_phone}  \nTelefax: ${s.store_fax}  \nE-Mail: ${s.store_email}

## Umsatzsteuer-ID

Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: [USt-IdNr.]

## Verantwortlich für den Inhalt

[Inhaber], Anschrift wie oben.

## Verbraucherstreitbeilegung

Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.

> Hinweis: Diese Seite ist eine Vorlage und muss vor dem Livegang vervollständigt und rechtlich geprüft werden.`,
    },
    {
      slug: 'datenschutz', title: 'Datenschutzerklärung', show_in_nav: 0, show_in_footer: 1, sort_order: 91,
      content: `> **Vorlage – vor dem Livegang rechtlich prüfen lassen.**

## 1. Verantwortlicher

${storeLines(s)}  \nE-Mail: ${s.store_email} · Telefon: ${s.store_phone}

## 2. Welche Daten wir verarbeiten

Wenn du über einen Vereinsshop bestellst, verarbeiten wir die von dir angegebenen Daten: Vor- und Nachname, E-Mail-Adresse, optional Telefonnummer, Mitgliedsnummer und Mannschaft/Abteilung, die bestellten Artikel inklusive gewünschter Drucktexte (z. B. Name, Rückennummer) sowie Nachrichten, die du uns zu deiner Bestellung schreibst.

## 3. Zweck und Rechtsgrundlage

Die Daten verwenden wir ausschließlich zur Abwicklung deiner Bestellung, für Rückfragen, zur Koordination des Drucks und zur Abrechnung (Art. 6 Abs. 1 lit. b DSGVO). Drucktexte geben wir dazu an unseren Druckdienstleister weiter. Soweit der Verein Kosten übernimmt, erhält der Verein Name, Mannschaft und die übernommenen Artikel zur Abrechnung (Art. 6 Abs. 1 lit. f DSGVO).

## 4. Cookies

Dieser Shop setzt **nur ein technisch notwendiges Session-Cookie**, um deinen Warenkorb zu speichern. Es werden **keine Tracking- oder Analyse-Cookies** und keine Dienste von Drittanbietern eingesetzt.

## 5. Speicherdauer

Bestelldaten speichern wir, solange es für die Abwicklung erforderlich ist, und darüber hinaus im Rahmen der gesetzlichen Aufbewahrungsfristen (bis zu 10 Jahre für steuerrelevante Unterlagen).

## 6. Deine Rechte

Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit sowie Widerspruch. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, z. B. beim Sächsischen Datenschutz- und Transparenzbeauftragten.`,
    },
  ];
}

const VSB_PAGES = [
  {
    slug: 'abholung-bezahlung', title: 'Abholung & Bezahlung', show_in_nav: 1, sort_order: 1,
    content: `## So läuft deine Bestellung ab

1. **Bestellen:** Du wählst deine Artikel im Shop aus und gibst die Bestellung verbindlich ab.
2. **Prüfung:** Das Sporthaus prüft deine Bestellung und meldet sich bei Rückfragen per E-Mail. Den aktuellen Stand siehst du jederzeit über den Link in deiner Bestellbestätigung.
3. **Druck:** Nach der Annahme werden die Artikel mit Vereinslogo und deinen Wunschtexten bedruckt bzw. beflockt. Das dauert ca. **2–3 Wochen**.
4. **Abholung:** Sobald alles fertig ist, kannst du deine Bestellung im Sporthaus Ullmann abholen.

## Bezahlung

Bezahlt wird **bei Abholung im Geschäft** – bar, mit EC-Karte oder Kreditkarte. Eine Online-Zahlung ist nicht nötig.

## Adresse & Öffnungszeiten

Sporthaus Ullmann · Hohenbusch-Markt 1 · 01108 Dresden  \nMo–Fr 09:00–19:00 · Sa 09:00–16:00

## Anprobe

Du bist unsicher bei der Größe? Komm vorbei – alle Artikel der Kollektion kannst du vor dem Druck im Geschäft anprobieren.`,
  },
  {
    slug: 'groessentabelle', title: 'Größentabelle', show_in_nav: 1, sort_order: 2,
    content: `## Erwachsene (Erima, unisex)

| Größe | Brustumfang | Taillenumfang | Körpergröße |
|---|---|---|---|
| S | 88–94 cm | 76–82 cm | 164–170 cm |
| M | 95–101 cm | 83–89 cm | 170–176 cm |
| L | 102–108 cm | 90–96 cm | 176–182 cm |
| XL | 109–115 cm | 97–103 cm | 182–188 cm |
| XXL | 116–122 cm | 104–110 cm | 188–194 cm |
| 3XL | 123–129 cm | 111–117 cm | 194–200 cm |

## Kinder

| Größe | Alter (ca.) | Körpergröße |
|---|---|---|
| 116 | 5–6 Jahre | 111–116 cm |
| 128 | 7–8 Jahre | 123–128 cm |
| 140 | 9–10 Jahre | 135–140 cm |
| 152 | 11–12 Jahre | 147–152 cm |
| 164 | 13–14 Jahre | 159–164 cm |

## Damen (Craft RSG)

| Größe | Brustumfang | Hüftumfang |
|---|---|---|
| 34 | 80–83 cm | 88–91 cm |
| 36 | 84–87 cm | 92–95 cm |
| 38 | 88–91 cm | 96–99 cm |
| 40 | 92–95 cm | 100–103 cm |
| 42 | 96–100 cm | 104–108 cm |
| 44 | 101–105 cm | 109–113 cm |

*Die Angaben sind Richtwerte der Hersteller. Im Zweifel einfach im Sporthaus anprobieren.*`,
  },
  {
    slug: 'faq', title: 'FAQ', show_in_nav: 1, sort_order: 3,
    content: `### Wer darf im Vereinsshop bestellen?
Die Angebote gelten ausschließlich für Mitglieder des VsB Mellernau e.V. und deren Familien.

### Kann ich meine Bestellung noch ändern?
Solange deine Bestellung noch nicht im Druck ist, schreib uns einfach über den Link in deiner Bestellbestätigung eine Nachricht.

### Was bedeutet "Verein gibt was dazu"?
Bei einigen Artikeln übernimmt der Verein einen Teil des Preises oder den kompletten Artikel. Das siehst du direkt am Artikel und im Warenkorb – du zahlst im Geschäft nur deinen Anteil.

### Warum ist die Bestellung verbindlich?
Die Artikel werden individuell mit Vereinslogo und ggf. deinem Namen bedruckt. Bedruckte Ware können wir leider nicht zurücknehmen.

### Wie lange dauert es?
In der Regel 2–3 Wochen. Wir informieren dich, sobald deine Bestellung abholbereit ist.`,
  },
];

const SGM_PAGES = [
  {
    slug: 'ueber-den-shop', title: 'Über den Shop', show_in_nav: 1, sort_order: 1,
    content: `## Fanshop der SG Musterdorf

*Dies ist ein fiktiver Demo-Verein, der zeigt, wie mehrere Vereine mit eigenem Branding und eigenem Sortiment betreut werden.*

Bestellen, abholen und bezahlen im Sporthaus Ullmann.`,
  },
];

// ---------------------------------------------------------------- Demo-Bestellungen
// path: Statusfolge ab 'new'. msgs: Nachrichten [Absender, Text] in Reihenfolge, eingestreut nach dem Status mit Index `after`.
const VSB_ORDERS = [
  {
    daysAgo: 21, customer: { first_name: 'Sandra', last_name: 'Köhler', email: 'sandra.koehler@example.org', phone: '0351 1234567', team: 'Damen RSG', member_number: '1042' },
    items: [['1912170', null, 'Club Cobolt', '38', 1, { vorname: 'SANDRA' }], ['1912180', null, 'Schwarz/Weiß', '38', 1]],
    path: ['accepted', 'in_production', 'ready', 'completed'],
  },
  {
    daysAgo: 18, customer: { first_name: 'Thomas', last_name: 'Richter', email: 't.richter@example.org', phone: '0172 5550101', team: '1. Herren' },
    items: [['3132301', 'Erwachsene', 'New Royal/Weiß', 'L', 1, { name: 'RICHTER', number: '7' }], ['3152301', 'Erwachsene', 'New Royal/Weiß', 'L', 1, { number: '7' }], ['3182301', null, 'New Royal/Weiß', '43–46', 2]],
    path: ['rejected'], rejectReason: 'Die Rückennummer 7 ist in der 1. Herren bereits vergeben. Bitte bestelle mit einer anderen Nummer neu – Rücksprache mit dem Trainer.',
  },
  {
    daysAgo: 16, customer: { first_name: 'Jana', last_name: 'Weber', email: 'jana.weber@example.org', team: 'E-Jugend', customer_note: 'Für meinen Sohn Paul (9 Jahre).' },
    items: [['1032320', 'Kinder', 'New Royal/Green', '140', 1, { name: 'PAUL' }], ['1102301', 'Kinder', 'Schwarz/Weiß', '140', 1], ['1082301', 'Kinder', 'New Royal/Green', '140', 2]],
    path: ['accepted', 'in_production', 'ready'],
  },
  {
    daysAgo: 13, customer: { first_name: 'Michael', last_name: 'Schulze', email: 'm.schulze@example.org', phone: '0160 7771234', team: 'Alte Herren' },
    items: [['1072302', 'Herren', 'Navy/Weiß', 'XXL', 1, { name: 'SCHULZE' }], ['1062301', null, 'Navy/Weiß', 'XXL', 1, { initials: 'MS' }]],
    path: ['accepted', 'in_production'],
  },
  {
    daysAgo: 10, customer: { first_name: 'Lisa', last_name: 'Hoffmann', email: 'lisa.hoffmann@example.org', team: 'Damen RSG', member_number: '1188' },
    items: [['1072302', 'Damen', 'New Royal/Weiß', 'S', 1, { initials: 'LH' }], ['1912175', null, 'Schwarz/Weiß', '36', 2]],
    path: ['accepted'],
  },
  {
    daysAgo: 7, customer: { first_name: 'Markus', last_name: 'Lehmann', email: 'markus.lehmann@example.org', phone: '0176 2223334', team: 'D-Jugend', customer_note: 'Trainerausstattung D-Jugend' },
    items: [['1032320', 'Erwachsene', 'New Royal/Green', '3XL', 1, { name: 'LEHMANN', initials: 'ML' }], ['1112301', 'Erwachsene', 'Navy/Weiß', '3XL', 2]],
    path: ['question'],
    msgs: [['shop', 'Hallo Herr Lehmann, die Liga Star Trainingsjacke in 3XL ist beim Hersteller erst in ca. 4 Wochen wieder lieferbar. Sollen wir so lange warten oder passt Ihnen auch XXL? Viele Grüße, Ihr Team Teamsport']],
  },
  {
    daysAgo: 5, customer: { first_name: 'Anke', last_name: 'Becker', email: 'anke.becker@example.org', team: 'Kinderturnen', customer_note: 'Für Zwillinge Mia und Emma.' },
    items: [['1912171', null, 'Club Cobolt', '122', 2, { vorname: 'MIA' }], ['1912176', null, 'Schwarz/Weiß', '122', 2]],
    path: ['question'],
    msgs: [
      ['shop', 'Hallo Frau Becker, Sie haben 2× das Singlet mit dem Namen "MIA" bestellt. Soll eines davon "EMMA" bekommen?'],
      ['customer', 'Oh ja, das war ein Versehen – bitte einmal MIA und einmal EMMA. Danke!'],
    ],
  },
  {
    daysAgo: 3, customer: { first_name: 'Felix', last_name: 'Neumann', email: 'felix.neumann@example.org', phone: '0151 9998887', team: 'B-Jugend' },
    items: [['3132350', null, 'Vereinsblau/Weiß', 'M', 1, { number: '23', name: 'NEUMANN' }], ['3142301', 'Erwachsene', 'Neongelb/Schwarz', 'M', 1, { number: '1' }]],
    path: [],
  },
  {
    daysAgo: 1, customer: { first_name: 'Claudia', last_name: 'Wagner', email: 'c.wagner@example.org', team: 'Eltern / Förderverein' },
    items: [['1072302', 'Damen', 'Grau meliert', 'M', 1], ['2122301', null, 'Navy/Weiß', 'S/M', 1], ['VSB-HT-70', '70 × 140 cm', 'Vereinsblau/Weiß', null, 1, { stick: 'Claudia' }]],
    path: [],
  },
  {
    daysAgo: 0, customer: { first_name: 'Jonas', last_name: 'Krüger', email: 'jonas.krueger@example.org', team: 'C-Jugend', member_number: '2210' },
    items: [['1262301', 'Kinder', 'New Royal/Green', '164', 1, { name: 'KRÜGER' }], ['1102301', 'Kinder', 'Schwarz/Weiß', '164', 1], ['1918011', 'Größe M (50 l)', 'Schwarz/Weiß', null, 1, { name: 'JONAS' }]],
    path: [],
  },
];

const SGM_ORDERS = [
  {
    daysAgo: 9, customer: { first_name: 'Peter', last_name: 'Sommer', email: 'peter.sommer@example.org', team: '1. Mannschaft' },
    items: [['3132301', null, 'Rot/Weiß', 'L', 1, { name: 'SOMMER', number: '9' }], ['3182301', null, 'Rot/Weiß', '43–46', 1]],
    path: ['accepted'],
  },
  {
    daysAgo: 2, customer: { first_name: 'Nina', last_name: 'Winter', email: 'nina.winter@example.org', team: 'Fans' },
    items: [['1072302', 'Erwachsene', 'Schwarz/Rot', 'M', 1, { initials: 'NW' }], ['2122301', null, 'Rot/Schwarz', 'S/M', 1]],
    path: [],
  },
];

// ---------------------------------------------------------------- Helfer
/** UTC-Zeitstempel im SQLite-Format, daysAgo Tage vor jetzt + Stundenversatz */
function stamp(daysAgo, hours = 0) {
  const d = new Date(Date.now() - daysAgo * 86400000 + hours * 3600000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function insertClub(c) {
  const info = run(
    `INSERT INTO clubs (slug, name, short_name, order_prefix, color_primary, color_secondary, color_accent, logo_path, tagline,
                        intro_text, order_info, contact_name, contact_email, contact_phone, require_member_number, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    c.slug, c.name, c.short_name, c.order_prefix, c.color_primary, c.color_secondary, c.color_accent, c.logo_path, c.tagline,
    c.intro_text, c.order_info, c.contact_name, c.contact_email, c.contact_phone, c.require_member_number ? 1 : 0,
  );
  return get('SELECT * FROM clubs WHERE id = ?', Number(info.lastInsertRowid));
}

function insertProducts(clubId, list) {
  list.forEach((p, i) => {
    run(
      `INSERT INTO products (club_id, sku, brand, name, description, category, illustration, uvp_cents, price_cents, sizes, colors, variants,
                             print_options, logo_print, funding_mode, subsidy_cents, is_active, is_featured, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      clubId, p.sku, p.brand, p.name, p.description || null, p.category, p.illustration, eur(p.uvp), eur(p.price),
      JSON.stringify(p.sizes || []), JSON.stringify(p.colors || []), JSON.stringify(p.variants || []), JSON.stringify(p.prints || []),
      p.logo_print || null, p.funding || 'member', eur(p.subsidy || 0), p.active === false ? 0 : 1, p.featured ? 1 : 0, (i + 1) * 10,
    );
  });
}

function insertPages(clubId, list) {
  for (const p of list) {
    run(
      'INSERT INTO pages (club_id, slug, title, content, show_in_nav, show_in_footer, is_published, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
      clubId, p.slug, p.title, p.content, p.show_in_nav ?? 1, p.show_in_footer ?? 0, p.sort_order ?? 0,
    );
  }
}

function insertOrders(club, list) {
  for (const o of list) {
    const cart = o.items.map(([sku, variant, color, size, quantity, prints], i) => {
      const product = get('SELECT id FROM products WHERE club_id = ? AND sku = ?', club.id, sku);
      if (!product) throw new Error(`Seed: Artikel ${sku} fehlt bei ${club.slug}`);
      return { id: `seed${i}`, productId: product.id, variant: variant || undefined, color, size: size || undefined, quantity, prints: prints || {} };
    });
    const check = summarizeCart(club.id, cart).lines.find((l) => l.error);
    if (check) throw new Error(`Seed: ungültige Position (${club.slug}, ${o.customer.last_name}, Artikel ${check.productId}): ${check.error}`);
    const order = createOrder(club, cart, o.customer);

    // Statusfolge abspielen, Nachrichten nach dem ersten Statuswechsel einstreuen
    for (const status of o.path) {
      changeStatus(order.id, status, { rejectReason: status === 'rejected' ? o.rejectReason : null });
    }
    for (const [sender, body] of o.msgs || []) {
      addMessage(order.id, sender, body, sender === 'shop' ? 'Team Teamsport' : `${o.customer.first_name} ${o.customer.last_name}`);
    }

    // Zeitstempel realistisch über die Vergangenheit verteilen
    const created = stamp(o.daysAgo, -6 + (order.id % 5));
    const events = all('SELECT id FROM order_events WHERE order_id = ? ORDER BY id', order.id);
    const span = Math.max(o.daysAgo * 24 - 8, events.length + 1); // Stunden zwischen Bestellung und jetzt
    const step = Math.max(1, Math.floor(span / (events.length + (o.msgs || []).length + 1)));
    let h = 0;
    events.forEach((e, i) => {
      run('UPDATE order_events SET created_at = ? WHERE id = ?', stamp(o.daysAgo, -6 + (order.id % 5) + (i === 0 ? 0 : (h += step))), e.id);
    });
    const lastEventAt = get('SELECT MAX(created_at) AS t FROM order_events WHERE order_id = ?', order.id).t;
    const msgs = all('SELECT id FROM order_messages WHERE order_id = ? ORDER BY id', order.id);
    msgs.forEach((m) => {
      run('UPDATE order_messages SET created_at = ? WHERE id = ?', stamp(o.daysAgo, -6 + (order.id % 5) + (h += step)), m.id);
    });
    const lastAt = get(
      'SELECT MAX(t) AS t FROM (SELECT MAX(created_at) AS t FROM order_events WHERE order_id = ? UNION ALL SELECT MAX(created_at) FROM order_messages WHERE order_id = ?)',
      order.id, order.id,
    ).t;
    run('UPDATE orders SET created_at = ?, status_changed_at = ?, updated_at = ? WHERE id = ?', created, lastEventAt, lastAt || created, order.id);
    if (o.internal) run('UPDATE orders SET internal_note = ? WHERE id = ?', o.internal, order.id);
  }
}

// ---------------------------------------------------------------- Hauptfunktion
function resetAll() {
  tx(() => {
    for (const t of ['order_messages', 'order_events', 'order_items', 'orders', 'pages', 'products', 'clubs', 'users']) run(`DELETE FROM ${t}`);
    run("DELETE FROM settings WHERE key <> 'session_secret'");
  });
}

/**
 * Legt die Beispieldaten an.
 * @returns {{ skipped: boolean, clubs: number, products: number, orders: number }}
 */
function seed({ reset = false, log = console.log } = {}) {
  if (reset) resetAll();
  else if (get("SELECT id FROM clubs WHERE slug = 'vsb-mellernau'")) {
    log('Der Shop "vsb-mellernau" existiert bereits – nichts geändert. Zum Neuanlegen: npm run seed -- --reset');
    return { skipped: true };
  }

  const clubs = tx(() => {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      if (!get('SELECT key FROM settings WHERE key = ?', k)) setSetting(k, v);
    }
    const users = [['admin', 'admin123', 'Administrator'], ['verkauf', 'verkauf123', 'Verkauf Teamsport']];
    for (const [u, pw, name] of users) {
      if (!get('SELECT id FROM users WHERE username = ?', u)) {
        run('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)', u, hashPassword(pw), name);
      }
    }

    const settings = { ...DEFAULT_SETTINGS };
    for (const row of all('SELECT key, value FROM settings')) settings[row.key] = row.value;

    // Globale Seiten (nur anlegen, wenn noch nicht vorhanden)
    for (const p of globalPages(settings)) {
      if (!get('SELECT id FROM pages WHERE club_id IS NULL AND slug = ?', p.slug)) insertPages(null, [p]);
    }

    const vfb = insertClub({
      slug: 'vsb-mellernau', name: 'VsB Mellernau e.V.', short_name: 'VsB Mellernau', order_prefix: 'VSB',
      color_primary: '#1b2d9a', color_secondary: '#ffffff', color_accent: '#2f9a45',
      logo_path: '/static/img/clubs/vsb-mellernau.svg', tagline: 'Dein Verein vor Ort',
      intro_text: VSB_INTRO, order_info: VSB_ORDER_INFO,
      contact_name: 'Team Teamsport', contact_email: settings.store_email, contact_phone: settings.store_phone,
    });
    insertProducts(vfb.id, VSB_PRODUCTS);
    insertPages(vfb.id, VSB_PAGES);

    const sgm = insertClub({
      slug: 'sg-musterdorf', name: 'SG Musterdorf 1921 e.V.', short_name: 'SG Musterdorf', order_prefix: 'SGM',
      color_primary: '#c8102e', color_secondary: '#1d1d1f', color_accent: '#ffffff',
      logo_path: '/static/img/clubs/sg-musterdorf.svg', tagline: 'Fanshop der SG – Demo-Verein',
      intro_text: 'Willkommen im Vereinsshop der **SG Musterdorf**! *(Fiktiver Demo-Verein)*\n\nAlle Artikel mit gesticktem bzw. gedrucktem Wappen. Bestellung online, Abholung und Bezahlung im Sporthaus Ullmann.',
      order_info: 'Abholung und Bezahlung im Sporthaus Ullmann, Hohenbusch-Markt 1, 01108 Dresden. Bearbeitungszeit ca. 2–3 Wochen.',
      contact_name: 'Team Teamsport', contact_email: settings.store_email, contact_phone: settings.store_phone,
      require_member_number: true,
    });
    insertProducts(sgm.id, SGM_PRODUCTS);
    insertPages(sgm.id, SGM_PAGES);
    return { vfb, sgm };
  });
  // Bestellungen außerhalb der Transaktion (createOrder/changeStatus öffnen eigene Transaktionen)
  insertOrders(clubs.vfb, VSB_ORDERS);
  insertOrders(clubs.sgm, SGM_ORDERS);

  const result = {
    skipped: false,
    clubs: get('SELECT COUNT(*) AS n FROM clubs').n,
    products: get('SELECT COUNT(*) AS n FROM products').n,
    orders: get('SELECT COUNT(*) AS n FROM orders').n,
  };
  const port = process.env.PORT || 3000;
  log(`
Beispieldaten angelegt: ${result.clubs} Vereine, ${result.products} Artikel, ${result.orders} Bestellungen.

  Shop VsB Mellernau:   http://localhost:${port}/vsb-mellernau
  Shop SG Musterdorf:  http://localhost:${port}/sg-musterdorf   (fiktiver Demo-Verein)
  Backend:             http://localhost:${port}/admin

  Logins:  admin / admin123        (Administrator)
           verkauf / verkauf123    (Verkauf Teamsport)
  Bitte die Passwörter nach dem ersten Login im Backend unter "Benutzer" ändern!
`);
  return result;
}

if (require.main === module) {
  seed({ reset: process.argv.includes('--reset') });
  db.close();
}

module.exports = { seed, VSB_PRODUCTS, SGM_PRODUCTS };
