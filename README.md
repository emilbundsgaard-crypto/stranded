# Isla Verano

En ø, en lille by, en strand og tre våben — kørende direkte i browseren.
Ingen installation, ingen server: hele spillet er én HTML-fil.

Åbn `dist/isla.html` i en browser, eller kør en lille server i mappen og
åbn `index.html`, hvis du vil rette i modulerne.

```
python3 -m http.server 8000
# åbn http://localhost:8000
```

## Hvad der er derude

- **Øen.** 900 meter fra kant til kant, med kyst, en bred sandstrand mod
  syd, bakker i nord og et klippenæs mod vest. Havet går hele vejen ud til
  horisonten med spejling og brydning.
- **Byen.** Ni karreer i et gadenet, omkring 45 huse i hele fag- og
  etagemål, fortove med kantsten, fodgængerfelter, lygtepæle, trafiklys,
  skraldespande og parkerede biler.
- **Trafik.** Bilerne kører i et gitter af vognbaner, drejer i krydsene og
  bremser for hinanden — og for dig, hvis du stiller dig i vejen.
- **Folk.** Fodgængere med rigtige gang-, løbe- og stå-animationer. De går
  på fortovene, krydser ved krydsene, og løber væk, hvis der falder skud.
- **Politi.** Skyder du, kommer de. Efterlysningen står i stjernerne over
  kortet og løber af, hvis du holder dig i ro.
- **Tre våben.** Pistol, maskinpistol og haglgevær — hver med sin
  kadence, spredning, rekyl og genladning.

## Styring

| | |
| --- | --- |
| `WASD` | gå — `Skift` for at løbe |
| `Mus` | kig — venstre skyder, højre sigter |
| `1` `2` `3` / hjul | skift våben |
| `R` | lad om |
| `Mellemrum` | hop — `Ctrl` for at hugge sig ned |
| `M` | lyd til og fra |
| `F` | skjul HUD |
| `F2` | diagnostik |

På en telefon styrer venstre halvdel af skærmen, højre halvdel kigger, og
knapperne til at skyde, sigte, hoppe, lade og skifte våben ligger i højre
side.

## Grafikniveauer

Fem niveauer fra **Lav** til **Kino**. De styrer skyggekaskader,
efterbehandling, havets ekstra render-pas, hvor mange folk og biler der er
i byen, og hvor tæt terrænnettet er. Falder billedraten, skruer spillet
selv ned undervejs — først efterbehandling, så vandets pas, til sidst
opløsningen.

`?quality=high` i adressen vælger et niveau direkte. `?safe=1` kører den
enkleste vej gennem motoren: ingen efterbehandling, ingen kaskadeskygger,
ingen ekstra vandpas. Den findes for at kunne svare på ét spørgsmål:
virker grundmotoren på maskinen?

## Hvordan det er lavet

- **Terrænet** er ét net over hele verden, men med vertexerne fordelt
  radiært: tæt omkring byen, groft ude ved horisonten. En verden på 900
  meter med jævn opdeling koster enten en million trekanter eller en
  strand af klodser.
- **Husene** er fire vægplaner og et tag — ikke kasser. Det halverer
  trekanterne (ingen indvendige flader) og giver fuld kontrol over
  teksturkoordinaterne, så facaden hverken strækkes eller skæres over.
  Alt af samme materiale flettes til ét net, så hele byen tegnes i en
  håndfuld kald.
- **Facaderne** er tegnet i et rigtigt mål: én flise er fire etager gange
  fire fag, og husene bygges i hele fag, så vinduesrækkerne flugter ned ad
  gaden. Vinduerne får dybde af parallax-forskydning — et normalkort alene
  gør ikke en flad væg til en mur med huller i.
- **Bilerne** er en sideprofil trukket ud i bredden med afrundede kanter.
  Det er den billigste måde at få en rigtig bilsilhuet — motorhjelm,
  forrudens hældning, tagets fald — i stedet for en kasse med hjul.
- **Skud** raycaster ikke mod trekanter. Byen er flettet til få, meget
  store net, og et raycast mod dem er en lineær gennemgang af titusindvis
  af trekanter — pr. skud. I stedet marcheres strålen gennem verdens egne
  former: terrænets højdefunktion, husenes kasser, masternes cylindre og
  folkene som kapsler. Det er både hurtigere og giver samme svar, fordi de
  former ER dem, man kan gå ind i.
- **Albedo.** Et foto af sand er ikke sandets albedo — solen sad allerede
  i billedet. Brugt råt som diffus farve bliver sandet dobbelt så lyst som
  virkeligheden og alt for mættet. Teksturerne ganges derfor ned mod en
  rigtig albedo, og den blå kanal løftes, fordi fotografier af sand, græs
  og sten er blå-fattige.

## Teksturer og kreditering

Sand, græs, sten, mursten, vandets normalkort, kaustik og figuren til
fodgængerne er hentet fra frit tilgængelige samlinger på GitHub. De ligger
i `assets/` og pakkes ind i koden med `node tools/pack-assets.js`, fordi
enkeltfilen skal kunne åbnes uden internet. Asfalt, beton, facader,
butiksruder, tag og palmer tegnes i browseren med canvas.

- `sand.jpg`, `ground.jpg`, `rock_normal.jpg`, `rock_grain.jpg` —
  [BabylonJS/Assets](https://github.com/BabylonJS/Assets), Creative Commons
  Attribution 4.0 International (CC BY 4.0)
- `grass.jpg`, `brick.jpg`, `water_normal.jpg`, `caustics.jpg`,
  `person.glb` — [three.js](https://github.com/mrdoob/three.js) (MIT);
  kaustikken stammer oprindeligt fra OpenGameArt, og figuren fra Mixamo
- `sand_normal.jpg` — udledt af `sand.jpg` (Sobel-filter)

Den fulde liste og en note om figurens licens står i
[`assets/CREDITS.md`](assets/CREDITS.md).

## Værktøjer

- `tools/build.js` — samler alt til `dist/isla.html`
- `tools/shot.js` — tager skærmbilleder af faste udsigter med headless
  Chromium (`node tools/shot.js <mappe>`), brugt til at finpudse grafikken
- `tools/pack-assets.js` — pakker `assets/` ind i `src/22-assets.js` som
  data-URI'er; kør den efter ændringer i `assets/`
