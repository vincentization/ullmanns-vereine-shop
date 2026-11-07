# Vereinsshops – Sporthaus Ullmann

Webshop-Plattform, mit der ein Sportgeschäft für mehrere Vereine jeweils einen eigenen, gebrandeten **Vereinsshop** betreibt.
Vereinsmitglieder bestellen dort selbstständig ihre Vereinskollektion (inkl. Namens-/Nummerndruck), das Sportgeschäft nimmt
die Bestellungen im **Backend** an, klärt Rückfragen, koordiniert den Druck mit dem Dienstleister und übergibt die Ware im Laden.
Bezahlt wird grundsätzlich bei Abholung im Geschäft.

Beispiel-Shop: **VsB Mellernau e.V.** mit 25 Artikeln, dazu der fiktive Demo-Verein *SG Musterdorf*.

## Schnellstart

Voraussetzung: **Node.js 22.13 oder neuer** (nutzt das eingebaute SQLite, keine nativen Abhängigkeiten).

```bash
npm install
```

```bash
npm run seed
```

```bash
npm start
```

| | URL |
|---|---|
| Übersicht aller Vereinsshops | http://localhost:3000/ |
| Shop VsB Mellernau | http://localhost:3000/vsb-mellernau |
| Shop SG Musterdorf (Demo) | http://localhost:3000/sg-musterdorf |
| Backend | http://localhost:3000/admin |

**Logins (Beispieldaten):** `admin` / `admin123` und `verkauf` / `verkauf123` – bitte nach dem ersten Login unter *Benutzer* ändern.

Beispieldaten komplett neu anlegen (löscht alle Vereine, Artikel, Bestellungen und Benutzer):

```bash
npm run seed -- --reset
```

Weitere Befehle: `npm run dev` (Neustart bei Codeänderungen), `npm test` (automatische Tests).

## Funktionen

### Vereinsshop (für Mitglieder)

- Eigene URL je Verein (`/<verein>`), optional eigene Domain (z. B. `shop.vsb-mellernau.de`)
- Vereinsbranding: Logo, Vereinsfarben, Slogan, Begrüßungstext
- Übersicht der Vereinskollektion mit Kategorien, UVP und Vereinspreis
- Artikelseite mit Auswahl von **Farbe, Ausführung** (z. B. Damen/Herren/Kinder mit eigenem Preis), **Größe** und **Menge**
- **Individuelle Sonderdrucke** als Text (z. B. Name Rücken, Rückennummer, Initialen) mit Aufpreis und Zeichenlimit
- Anzeige, ob und wie viel der Verein dazugibt
- Warenkorb und **verbindliche Bestellung** (Zahlung im Geschäft bei Abholung)
- Persönlicher Bestell-Link: Status verfolgen und **Rückfragen des Sporthauses beantworten**
- Inhaltsseiten je Verein (z. B. Größentabelle, FAQ) sowie globale Seiten (Impressum, Datenschutz)
- Produktfotos hochladbar; solange keins da ist, wird eine Grafik in der gewählten Farbe erzeugt

### Backend (für das Sportgeschäft)

- Login mit Benutzername + Passwort, mehrere Mitarbeiter-Zugänge
- Übersicht über neue Bestellungen, offene Rückfragen und ungelesene Antworten aller Vereine
- **Bestellungen**: filtern nach Verein und Status, annehmen/ablehnen, Rückfragen stellen und Antworten lesen, Status bis „Abgeholt" weiterschalten, interne Notizen, Druckansicht
- **Vereine & Shops**: neuen Vereinsshop in wenigen Schritten anlegen (optional Sortiment eines anderen Vereins übernehmen), Branding und Texte pflegen
- **Sortiment** je Verein: Preise, UVP, Farben, Ausführungen, Größen, Druckoptionen, Finanzierungsmodell, Fotos, Sichtbarkeit; Artikel zu anderen Vereinen kopieren
- **Seiten**: Inhaltsseiten je Verein und globale Seiten (Markdown)
- **Einstellungen**: Stammdaten des Sportgeschäfts (Adresse, Öffnungszeiten, Kontakt)

## Ablauf einer Bestellung

```
Mitglied bestellt ──► Eingegangen ──► Angenommen ──► Im Druck ──► Abholbereit ──► Abgeholt
                         │   ▲             │
                         ▼   │             └──► Storniert
                       Rückfrage ──► Abgelehnt / Storniert
```

| Status | Bedeutung |
|---|---|
| Eingegangen | Neue Bestellung, muss vom Sporthaus geprüft werden |
| Rückfrage | Sporthaus hat eine Frage gestellt, Mitglied antwortet über seinen Bestell-Link |
| Angenommen | Bestellung ist bestätigt, Ware wird bestellt bzw. vorbereitet |
| Im Druck | Ware ist beim Druck-/Beflockungsdienstleister |
| Abholbereit | Ware liegt im Geschäft, Bezahlung bei Abholung |
| Abgeholt | Abgeschlossen |
| Abgelehnt / Storniert | Mit Begründung, für das Mitglied sichtbar |

Die Bestellnummer setzt sich aus Vereinskürzel, Jahr und laufender Nummer zusammen (z. B. `VSB-2026-0007`).

## Finanzierungsmodelle (je Artikel)

Vereine stimmen mit dem Sporthaus ab, welche Artikel sie zu welchen Konditionen anbieten:

| Modell | Bedeutung | Mitglied zahlt | Verein zahlt |
|---|---|---|---|
| **Verein gibt nichts dazu** (`member`) | Standard | Artikel + Sonderdrucke | – |
| **Verein gibt was dazu** (`subsidy`) | fester Zuschuss je Stück, z. B. 10 € pro Trikot | Rest + Sonderdrucke | Zuschuss (max. Artikelpreis) |
| **Verein zahlt Artikel, aber keine Sonderdrucke** (`club_article`) | z. B. Spieltrikots | nur Sonderdrucke | Artikel |

Jede Bestellung weist getrennt aus, was das Mitglied im Geschäft zahlt und was dem Verein berechnet wird.
Die Druckkosten für Vereinsname und Logo sind – wie bisher – im Vereinspreis enthalten bzw. werden vom Verein übernommen (Feld *Vereinsdruck* am Artikel).

## Neuen Vereinsshop anlegen

1. Im Backend unter **Vereine & Shops → Neuer Verein** Name, URL-Kürzel (z. B. `tsv-weixdorf`) und Bestellnummern-Präfix eintragen.
2. Logo hochladen und Vereinsfarben wählen – der Shop übernimmt sie automatisch.
3. Optional das Sortiment eines bestehenden Vereins als Startpunkt übernehmen und anschließend Preise/Farben anpassen.
4. Begrüßungstext und Hinweise zu Abholung/Bezahlung eintragen, ggf. eigene Seiten anlegen.
5. Shop-Link an den Verein geben (`https://<ihre-domain>/<kürzel>`).

> Das VsB-Wappen in den Beispieldaten ist ein **stilisierter Platzhalter** (`public/img/clubs/vsb-mellernau.svg`).
> Bitte das Original-Logo des Vereins im Backend unter *Vereine & Shops* hochladen.

## Konfiguration

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `3000` | HTTP-Port |
| `DATA_DIR` | `./data` | Ablage für Datenbank (`shop.sqlite`) und Uploads |
| `SESSION_SECRET` | wird beim ersten Start erzeugt und in der DB gespeichert | Schlüssel für Session-Cookies |
| `COOKIE_SECURE` | – | auf `1` setzen, wenn der Shop nur über HTTPS erreichbar ist |

## Betrieb

- **HTTPS / Reverse Proxy:** Die Anwendung hinter nginx, Caddy o. ä. betreiben, der HTTPS terminiert, und `COOKIE_SECURE=1` setzen. Für eigene Vereinsdomains die Domain auf denselben Server zeigen lassen und im Backend beim Verein eintragen.
- **Prozess:** z. B. mit systemd oder pm2 (`npm start`) dauerhaft laufen lassen.
- **Backup:** Das Verzeichnis `data/` (SQLite-Datenbank inkl. `-wal`-Datei und Uploads) regelmäßig sichern. Für ein konsistentes Backup im laufenden Betrieb: `sqlite3 data/shop.sqlite ".backup backup.sqlite"`.
- **Rechtliches:** Impressum und Datenschutzerklärung in den Beispieldaten sind Vorlagen und müssen vor dem Livegang vervollständigt und geprüft werden.

## Nächste Schritte (noch nicht umgesetzt)

- **E-Mail-Benachrichtigungen** (Bestellbestätigung, Rückfragen, „abholbereit") – derzeit sieht das Mitglied alles über seinen Bestell-Link
- **Zugang für Vereinsverantwortliche** (nur Lesezugriff auf die Bestellungen und Abrechnung des eigenen Vereins)
- **Lagerbestand / Verfügbarkeit** je Größe
- **Bestellfristen / Sammelbestellungen** (z. B. Bestellfenster für Saisonstart)
- Optional **Online-Zahlung** (z. B. PayPal) als Alternative zur Zahlung im Geschäft

## Technik

Node.js · Express 5 · EJS · SQLite (`node:sqlite`) – ohne Build-Schritt. Aufbau, Datenmodell und Konventionen: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
