# Oasen

En lille, stille førstepersons-oase i en sandstenskløft — bygget til at blive
åbnet direkte i browseren. Ingen server, ingen build-kæde, ingen assets at
hente: terræn, klipper, vand, græs, teksturer og lyd bliver genereret i
browseren, når siden åbnes.

Inspireret af *Stranded Deep* og af referencebilledet med floden mellem
lagdelte kløftvægge.

![Oasen](docs/oasen-spawn.png)

## Prøv den

**Nemmest:** åbn `dist/oasen.html` — én selvstændig fil, dobbeltklik den, og
den kører (også uden internet).

**Fra kildekoden:** kør en lille webserver i mappen, fordi browsere ikke må
læse sidemoduler fra `file://` på tværs af filer:

```bash
python3 -m http.server 8000
# åbn http://localhost:8000
```

Byg enkeltfilen igen efter ændringer:

```bash
node tools/build.js
```

## Styring

| Tast | Handling |
| --- | --- |
| `WASD` / piletaster | gå |
| `Shift` | løb |
| Mus | kig (klik for at fange musen; virker også som træk-for-at-kigge) |
| `E` eller klik | saml sten op |
| `F` | skjul HUD (til skærmbilleder) |
| `M` | lyd til/fra |
| `Esc` | slip musen |

Man kan vade ud i floden, men ikke svømme — bliver der for dybt, stopper man.

## Stenene

Der ligger godt 200 sten spredt langs bredden. De sjældne gløder svagt, så man
kan få øje på dem på afstand:

| Sten | Sjældenhed |
| --- | --- |
| Flintesten, sandstensbrokke, poleret flodsten | almindelig |
| Jernholdig sten, kvartskrystal | usædvanlig |
| Stribet agat, ametyst | sjælden |
| Stjernesten | legendarisk (ca. 1 ud af 130 sten) |

## Hvordan det er lavet

Ren JavaScript oven på three.js (r128, som ligger i `vendor/`). Filerne
indlæses i rækkefølge og deler navnerummet `window.OASIS`:

| Fil | Ansvar |
| --- | --- |
| `src/00-core.js` | matematik, støjfunktioner, farvekonvertering, konfiguration |
| `src/10-world.js` | flodens forløb og terrænets højdefunktion — alle andre moduler spørger herind |
| `src/20-textures.js` | sand, sandsten, græs og lyspunkter tegnet på canvas |
| `src/30-terrain.js` | terrænmesh med vertexfarver (våd sand, tør sand, grus, grønt bånd) |
| `src/40-cliffs.js` | mesaer bygget som stablede, eroderede lag med hylder og udhæng |
| `src/50-sky.js` | himmelkuppel med cirrusskyer, sol, skygger og fyldlys |
| `src/60-water.js` | vandet: ægte planspejling, krusninger, dybdefarve, kaustik |
| `src/70-props.js` | græs i vindstød, kampesten, drivtømmer, bål, støv |
| `src/80-stones.js` | de sten man kan samle op, og deres sjældenhed |
| `src/85-player.js` | bevægelse, kollision, vadning, hovedbevægelse og hånden |
| `src/90-audio.js` | vind, vand, skridt og opsamlingsklang syntetiseret med WebAudio |
| `src/95-hud.js` | sigtekorn, prompt, lomme og beskeder |
| `src/99-main.js` | opstart, indlæsningsskærm og renderløkke |

Et par detaljer der gør udslaget:

- **Spejlingen i vandet** er ikke en tekstur. Scenen renderes en ekstra gang
  fra et kamera spejlet i vandfladen, og resultatet slås op med projicerede
  koordinater, forskudt af bølgernes normaler.
- **Dybdekortet** bages fra den samme højdefunktion som terrænet, så vandet
  ved præcis hvor lavt der er, og kan tone sig fra sandfarvet til dybgrønt
  med blød vandkant.
- **Kløftens lag** er ægte geometri, ikke en tekstur: hvert lag har sin egen
  radius, så der opstår hylder, udhæng og en kantet silhuet.
- **Ydelse**: alt græs er én instans-tegning, klipperne er flettet til ét mesh,
  og spejlingen renderes i halv opløsning. Bliver billedraten lav, skruer
  spillet selv ned for opløsning og spejlingsfrekvens.

## Værktøjer

- `tools/build.js` — samler alt til `dist/oasen.html`
- `tools/shot.js` — tager skærmbilleder af faste udsigter med headless Chromium
  (`node tools/shot.js <mappe>`), brugt til at finpudse grafikken
