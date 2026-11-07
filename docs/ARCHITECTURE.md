# Architektur

Node.js (>= 22.13) · Express 5 · EJS-Templates · eingebautes SQLite (`node:sqlite`) · keine Build-Schritte.

```
src/
  server.js            Start (PORT, DATA_DIR, SESSION_SECRET, COOKIE_SECURE)
  app.js               Express-Setup, Sessions, Flash, statische Dateien, Router
  db.js                Schema + DB-Helfer (get/all/run/tx, Einstellungen)
  seed.js              Beispieldaten (Sporthaus, Admin, VfB Hellerau mit 25 Artikeln, Demo-Bestellungen)
  lib/
    pricing.js         Preislogik + Finanzierungsmodelle (member / subsidy / club_article), Warenkorb-Berechnung
    orders.js          Bestellung anlegen, Status ändern, Nachrichten, Bestellung laden
    format.js          Geld/Datum, Bestellstatus (ORDER_STATUSES), Markdown, Slugs, Produktbild-URL  -> in Templates als `h`
    auth.js            Passwort-Hashing, requireAdmin, Login-Sperre, Tokens
    illustrations.js   generierte Produkt-SVGs je Artikeltyp und Farbe
    upload.js          Bild-Uploads (multer) nach data/uploads
    session-store.js   Sessions in SQLite
  routes/
    shop.js            Vereinsshops: /<verein>/..., Warenkorb, Checkout, Bestellstatus, Inhaltsseiten
    images.js          /img/product/<typ>.svg?c=<hex>&a=<hex>
    admin/             Backend unter /admin (Login, Übersicht, Bestellungen, Vereine, Sortiment, Seiten, Benutzer, Einstellungen)
views/                 EJS (views/shop, views/admin)
public/                CSS/JS/Bilder unter /static
data/                  SQLite-Datei + Uploads (nicht im Git)
```

## Wichtige Regeln

- Geld immer in Cent (INTEGER). Formatierung mit `h.money(cents)`, Eingabe mit `h.parseMoney("17,97")`.
- Preise werden **nie** aus der Session übernommen: `summarizeCart()` rechnet immer aus der DB neu.
- Bestellpositionen speichern einen Schnappschuss (Name, Preis, Druck), damit spätere Artikeländerungen alte Bestellungen nicht verändern.
- Jeder Verein hat ein eigenes Sortiment (`products.club_id`). Artikel lassen sich zwischen Vereinen kopieren.
- Seiten mit `club_id = NULL` gelten für alle Shops (z.B. Impressum, Datenschutz), Vereinsseiten mit gleichem Slug überschreiben sie.

## URL-Schema

| Bereich | URL |
|---|---|
| Übersicht aller Vereinsshops | `/` |
| Vereinsshop | `/<slug>` (z.B. `/vfb-hellerau`), optional eigene Domain (`clubs.domain`) |
| Artikel | `/<slug>/artikel/<id>` |
| Warenkorb / Kasse | `/<slug>/warenkorb`, `/<slug>/kasse` |
| Bestellstatus (Kunde) | `/<slug>/bestellung/<bestellnr>?t=<token>` |
| Inhaltsseite | `/<slug>/seite/<seitenslug>` |
| Backend | `/admin` |
