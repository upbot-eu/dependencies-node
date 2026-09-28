# UpBot: monitoring závislostí pre Node.js

[English](README.md) · [Deutsch](README.de.md) · [Slovenčina](README.sk.md)

Node.js **20.12+ v rade 20.x alebo 22+**. Bez runtime závislostí. Číta
`composer.lock` a/alebo `package-lock.json` (npm v1–v3), vrátane nepriamych
a dev závislostí. Odosiela názvy balíkov, verzie, ekosystém, príznaky dev/zdroja
a voliteľný identifikátor release.

Inštalácia v projekte:

```sh
npm install @upbot-eu/dependencies
```

Do existujúceho súkromného `.env` alebo prostredia procesu pridaj token sledovania:

```dotenv
UPBOT_TOKEN=replace_with_monitor_token
```

```sh
npx --no-install upbot doctor
npx --no-install upbot report
```

Produkčný endpoint a aktuálny adresár projektu sú prednastavené. Node, Next.js,
Express ani ďalšie serverové frameworky nepotrebujú adaptér. Balík inštaluj ako
produkčnú závislosť, ak server používa `--omit=dev`.

Voliteľný `npx --no-install upbot init` vytvorí súkromný `.env.upbot`.
Existujúci súbor neprepíše. Ďalšie voliteľné nastavenia:

```dotenv
# UPBOT_ENDPOINT=https://app.upbot.eu/api/v1/dependencies/report
# UPBOT_RELEASE=deploy-42
# UPBOT_PRIVATE_PACKAGES=company/internal,@company/private
```

## Overenie a konfigurácia

`doctor` overí konfiguráciu, lock súbory, spojenie a token bez odoslania či zmeny
inventára. Vyžaduje endpoint `/v1/dependencies/verify` v UpBote. `report` odošle
inventár; jeho prijatie ešte neznamená dokončenie kontroly zraniteľností.
Chyby vracajú nenulový exit status. Tokeny ani obsah odpovede servera sa nelogujú.

Klient načíta `.env.upbot`, prípadne `.env`. Existujúce premenné procesu majú
prednosť. Oba príkazy podporujú `--project-dir /app` a
`--dotenv /private/.env.upbot`; explicitný adresár má prednosť pred
`UPBOT_PROJECT_DIR`. Relatívne cesty z dotenv sa počítajú od pracovného adresára.
Token ulož mimo verejného webového adresára, obmedz prístup cez `chmod 600`
a vylúč súbor z Gitu. Nepoužívaj `NEXT_PUBLIC_` ani inú premennú dostupnú prehliadaču.

## Cron a nasadenie

Denný cron; uprav cesty k runtime a projektu (`command -v node`):

```cron
17 3 * * * /usr/bin/node /var/www/project/current/node_modules/@upbot-eu/dependencies/bin/upbot.mjs report --project-dir /var/www/project/current --dotenv /home/deploy/.config/upbot/project.env >> /home/deploy/upbot-report.log 2>&1
```

Očakávaný interval v UpBote nastav na 24 hodín. Pre 6 hodín použi `17 */6 * * *`.
Cron používa čas servera; cesty s medzerami daj do úvodzoviek a `%` v crontabe
escapuj. Používateľ cronu musí vedieť čítať súbory. Logy uchovávaj mimo webrootu
a rotuj ich. `report` spusti aj po úspešnom nasadení. Reporty sú obmedzené na jeden
za minútu pre každé sledovanie (HTTP 429). Klient automaticky neinštaluje ani
neaktualizuje závislosti, nevytvára cron a neopakuje neúspešné odoslanie.

## Rozsah

Lock súbory musia opisovať aktívny release a zostať na serveri. Balíky uvedené
v `UPBOT_PRIVATE_PACKAGES` a npm balíky mimo verejného registra sú neoverené.
Ich názvy sa odošlú UpBotu, ale nie do OSV. Yarn/pnpm a viac koreňových adresárov
nie sú podporované; pre každú aplikáciu a prostredie vytvor samostatné sledovanie
a token. Inventár opisuje verzie z lock súborov, nie skutočný obsah `vendor`
či `node_modules`.

## Licencia

MIT. Pozri [LICENSE](LICENSE).
