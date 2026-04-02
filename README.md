# QR Kodu Ģenerators

Statiska mājaslapa (`HTML/CSS/JS`) QR kodu ģenerēšanai ar iespēju pievienot logo attēlu QR koda centrā.

## Funkcionalitāte

- QR ģenerēšana no teksta vai URL.
- Parametri: izmērs, malas, priekšplāna/fona krāsa.
- Kļūdu korekcija ir fiksēta uz `H` (ļoti augsta).
- Logo augšupielāde centrā (`png`, `jpg`, `jpeg`, `svg`, `webp`).
- Logo izmēra kontrole (% no QR izmēra).
- Lejupielāde `PNG` un `SVG` formātā.
- Klienta puses validācija un saprotami statusa paziņojumi.

## Lokāla palaišana

Atver `index.html` pārlūkā vai izmanto vieglu lokālo serveri:

```bash
python3 -m http.server 8080
```

Tad atver: `http://localhost:8080`

## Tehniskais pamats

- Bez backend.
- Bibliotēka: `qr-code-styling` no CDN.
- Galvenie faili:
  - `index.html`
  - `styles.css`
  - `app.js`

## GitHub Pages publicēšana (main zars)

1. Iepushē projektu uz GitHub repozitoriju.
2. Atver `Settings` -> `Pages`.
3. Pie `Build and deployment` izvēlies:
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - `Folder`: `/ (root)`
4. Saglabā iestatījumus.
5. Pēc dažām minūtēm lapa būs pieejama piešķirtajā `github.io` adresē.

## Piezīmes

- Ļoti gara satura gadījumā ģenerēšana var neizdoties; UI parādīs kļūdas ziņu.
