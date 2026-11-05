# Deelrit

Een app voor als je een auto deelt. Iedereen noteert zijn ritten, wie tankt zet de bon erin, en Deelrit verdeelt het bedrag naar gereden kilometers. Alle gegevens worden gedeeld: wat Anna invoert, ziet Bram meteen op zijn telefoon.

De app bestaat uit twee gratis onderdelen:

- **GitHub Pages** zet de app online, zodat iedereen hem via een link kan openen.
- **Firebase** bewaart de gedeelde gegevens en regelt het inloggen.

Je hoeft niet te kunnen programmeren. Reken op ongeveer 20 minuten.

---

## Stap 1: Firebase-project aanmaken

1. Ga naar <https://console.firebase.google.com> en log in met een Google-account.
2. Klik op **Project maken** (of *Add project*). Noem het bijvoorbeeld `deelrit`.
3. Google Analytics heb je niet nodig; dat mag je uitzetten. Klik op **Project maken**.

## Stap 2: Inloggen aanzetten

1. Kies links **Build → Authentication** en klik op **Aan de slag**.
2. Zet bij **Sign-in method** deze aan:
   - **E-mail/wachtwoord** (de bovenste schakelaar is genoeg)
   - **Google** (kies een ondersteunings-e-mailadres en sla op)

## Stap 3: Database aanmaken

1. Kies links **Build → Firestore Database** en klik op **Database maken**.
2. Kies als locatie **eur3 (europe-west)** of een andere Europese locatie. Dit kun je later niet meer wijzigen.
3. Kies **Starten in productiemodus**.
4. Ga naar het tabblad **Regels**, haal alles weg, plak de inhoud van het bestand `firestore.rules` en klik op **Publiceren**.

Deze regels zorgen ervoor dat alleen leden van een auto de gegevens van die auto kunnen zien.

## Stap 4: De app koppelen aan Firebase

1. Klik linksboven op het tandwiel → **Projectinstellingen**.
2. Scroll naar **Je apps** en klik op het webicoon `</>`.
3. Geef de app een naam (bijv. `Deelrit`). *Firebase Hosting* hoef je niet aan te vinken. Klik op **App registreren**.
4. Je ziet nu een stukje code met `const firebaseConfig = { ... }`. Neem de waarden over in het bestand `firebase-config.js`, dus `apiKey`, `authDomain`, `projectId`, enzovoort.

Deze waarden zijn geen geheim en mogen in een openbare repository staan. De beveiliging zit in de regels uit stap 3.

## Stap 5: Op GitHub zetten

1. Maak een account op <https://github.com> als je dat nog niet hebt.
2. Klik rechtsboven op **+ → New repository**. Noem hem `deelrit`, kies **Public** en klik op **Create repository**.
3. Klik op **uploading an existing file** en sleep **alle bestanden en de map `icons`** uit deze map erin. Let op: `index.html` moet direct in de repository staan, niet in een submap.
4. Klik op **Commit changes**.
5. Ga naar **Settings → Pages**. Kies bij *Source* **Deploy from a branch**, bij *Branch* **main** en **/ (root)**, en klik op **Save**.
6. Na een minuut of twee staat bovenaan het adres van je app, bijvoorbeeld `https://jouwnaam.github.io/deelrit/`.

## Stap 6: GitHub-adres toestaan in Firebase

Zonder deze stap werkt inloggen met Google niet.

1. Ga in Firebase naar **Authentication → Instellingen → Geautoriseerde domeinen** (*Authorized domains*).
2. Klik op **Domein toevoegen** en vul `jouwnaam.github.io` in (zonder `https://` en zonder `/deelrit`).

## Stap 7: Gebruiken en delen

1. Open het adres op je telefoon en maak een account.
2. Zet de app op je beginscherm:
   - **iPhone (Safari):** deelknop → **Zet op beginscherm**
   - **Android (Chrome):** menu met drie puntjes → **App installeren** of **Toevoegen aan startscherm**
3. Maak een auto aan met de namen van de mensen die meerijden.
4. Tik onderaan op **Uitnodigingslink delen** en stuur de link in je groepsapp.
5. De anderen openen de link, maken een account, vullen hun naam in en doen mee.

Iedereen kiest bovenaan bij **Ik ben** wie hij is. De app onthoudt dat per telefoon.

---

## Zo werkt de verdeling

- Een **rit** is een begin- en eindstand van de teller. De beginstand vult de app zelf in met de laatst bekende stand.
- **Samen rijden:** vink bij een rit iedereen aan die meereed. De kilometers worden dan gelijk over hen verdeeld (100 km met z'n tweeën = 50 km per persoon).
- Bij een **tankbon** telt Deelrit alle ritten sinds de vorige tankbeurt op en verdeelt het bedrag naar kilometers. Zijn er geen ritten gelogd, dan wordt het bedrag gelijk verdeeld over alle namen.
- Na het tanken zie je bij **Tikkies** aan wie je een Tikkie stuurt en voor hoeveel. Met **Kopieer** zet je het bedrag op je klembord, zodat je het zo in je bank-app plakt. De app houdt geen saldo bij: dat regelen jullie zelf met de Tikkies.

### Als iemand vergeet zijn rit in te vullen

De volgende die rijdt, ziet dat de teller hoger staat dan de laatst bekende stand. Past hij de beginstand aan naar wat er echt op de teller staat, dan meldt de app hoeveel kilometer er mist. Hij kiest dan wie die kilometers gereden heeft. Zonder die keuze kun je de rit of tankbon niet opslaan, zodat de kosten nooit bij iemand terechtkomen die niet gereden heeft. Weet je het niet, vraag het dan eerst in de groep.

Hetzelfde gebeurt bij tanken: vul de kilometerstand bij de pomp in, dan worden ontbrekende kilometers meteen opgemerkt en meegenomen in de verdeling van die tankbon.

De ontbrekende kilometers staan als aparte regel in het logboek. Blijkt later wie ze gereden heeft, verwijder die regel dan en voer de rit alsnog in.

- De app werkt ook zonder verbinding (handig in een parkeergarage). Wat je invoert, wordt verstuurd zodra je weer online bent.

## Iets aanpassen

Pas een bestand aan op GitHub (klik op het bestand → potloodje → **Commit changes**). Verhoog daarna in `sw.js` het versienummer (`deelrit-v1` → `deelrit-v2`), zodat iedereen de nieuwe versie krijgt.

## Kosten

Firebase heeft een gratis abonnement (*Spark*) dat ruim genoeg is voor een groep vrienden. GitHub Pages is gratis voor openbare repositories. Je hoeft nergens een betaalkaart op te geven.

## Problemen

| Wat je ziet | Oplossing |
|---|---|
| "De app is nog niet gekoppeld aan een database" | Vul `firebase-config.js` in (stap 4). |
| Inloggen met Google geeft een foutmelding over het domein | Voeg je GitHub-adres toe (stap 6). |
| Inloggen met Google werkt niet in de beginscherm-app op iPhone | Log in met e-mail en wachtwoord, of log eerst in via Safari. |
| "Dat mag niet: je bent geen lid van deze auto" | Controleer of de regels uit `firestore.rules` gepubliceerd zijn (stap 3). |
| De anderen zien de oude versie | Verhoog het versienummer in `sw.js` en laat ze de app één keer sluiten en opnieuw openen. |

## Bestanden

| Bestand | Wat het doet |
|---|---|
| `index.html` | De schermen van de app |
| `style.css` | Het uiterlijk |
| `app.js` | Inloggen, opslaan en de verdeelberekening |
| `firebase-config.js` | De koppeling met jouw Firebase-project (zelf invullen) |
| `firestore.rules` | De beveiligingsregels voor de database (in Firebase plakken) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Zorgen dat je de app op je beginscherm kunt zetten en dat hij offline opent |
