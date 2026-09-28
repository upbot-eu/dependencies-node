# UpBot: Abhängigkeitsmonitoring für Node.js

[English](README.md) · [Deutsch](README.de.md) · [Slovenčina](README.sk.md)

Node.js **20.12+ innerhalb von 20.x oder 22+**. Keine Laufzeitabhängigkeiten.
Liest `composer.lock` und/oder `package-lock.json` (npm v1–v3), einschließlich
transitiver und Entwicklungsabhängigkeiten. Übermittelt Paketnamen, Versionen,
Ökosystem, Kennzeichen für Entwicklungsabhängigkeiten und Paketquellen sowie
eine optionale Release-Kennung.

**Die Veröffentlichung in der Registry steht noch aus.** Danach:

```sh
npm install @upbot-eu/dependencies
```

Das Token dieses Monitors in die vorhandene private `.env` oder Prozessumgebung eintragen:

```dotenv
UPBOT_TOKEN=replace_with_monitor_token
```

```sh
npx --no-install upbot doctor
npx --no-install upbot report
```

Der Produktionsendpunkt und das aktuelle Projektverzeichnis sind voreingestellt.
Node, Next.js, Express und andere Server-Frameworks benötigen keinen Adapter.
Als Produktionsabhängigkeit installieren, wenn der Server `--omit=dev` verwendet.

Optional erstellt `npx --no-install upbot init` eine private `.env.upbot`.
Vorhandene Dateien werden nicht überschrieben. Weitere optionale Einstellungen:

```dotenv
# UPBOT_ENDPOINT=https://app.upbot.eu/api/v1/dependencies/report
# UPBOT_RELEASE=deploy-42
# UPBOT_PRIVATE_PACKAGES=company/internal,@company/private
```

Bis zur Veröffentlichung können Entwickler das lokale Archiv installieren:
`npm install /absolute/path/upbot-eu-dependencies-0.1.0.tgz`.

## Prüfung und Konfiguration

`doctor` prüft Konfiguration, Lockdateien, Verbindung und Token, ohne das Inventar
zu übermitteln oder zu ändern. Dafür ist UpBots Endpunkt
`/v1/dependencies/verify` erforderlich. `report` übermittelt das Inventar;
die Annahme bedeutet noch nicht, dass die Schwachstellenprüfung abgeschlossen ist.
Fehler führen zu einem Exitstatus ungleich null. Token und Antwortinhalte werden
nicht protokolliert.

Der Client lädt `.env.upbot`, andernfalls `.env`. Vorhandene Prozessvariablen
haben Vorrang. Beide Befehle unterstützen `--project-dir /app` und
`--dotenv /private/.env.upbot`; das explizite Verzeichnis hat Vorrang vor
`UPBOT_PROJECT_DIR`. Relative dotenv-Pfade beziehen sich auf das Arbeitsverzeichnis.
Token außerhalb des öffentlich zugänglichen Webverzeichnisses speichern,
Dateirechte mit `chmod 600` einschränken und die Datei von Git ausschließen.
Keine `NEXT_PUBLIC_`-Variable oder andere im Browser zugängliche Variable verwenden.

## Cron und Deployment

Täglicher Cronjob; Laufzeit- und Projektpfade anpassen (`command -v node`):

```cron
17 3 * * * /usr/bin/node /var/www/project/current/node_modules/@upbot-eu/dependencies/bin/upbot.mjs report --project-dir /var/www/project/current --dotenv /home/deploy/.config/upbot/project.env >> /home/deploy/upbot-report.log 2>&1
```

Das erwartete Intervall in UpBot auf 24 Stunden einstellen. Für 6 Stunden
`17 */6 * * *` verwenden. Cron nutzt die Serverzeitzone; Pfade mit Leerzeichen
in Anführungszeichen setzen und `%` in der Crontab maskieren. Der Cronbenutzer
muss die Dateien lesen können. Logs außerhalb des Webverzeichnisses speichern
und rotieren. `report` auch nach einem erfolgreichen Deployment ausführen.
Pro Monitor ist höchstens ein Bericht pro Minute erlaubt (HTTP 429). Der Client
installiert oder aktualisiert keine Abhängigkeiten, richtet keinen Cronjob ein
und wiederholt fehlgeschlagene Übermittlungen nicht automatisch.

## Umfang

Lockdateien müssen das aktive Release beschreiben und auf dem Server bleiben.
Pakete in `UPBOT_PRIVATE_PACKAGES` und npm-Pakete außerhalb der öffentlichen
Registry werden als ungeprüft markiert. Ihre Namen erreichen UpBot, werden aber
nicht an OSV gesendet. Yarn/pnpm und mehrere Projektverzeichnisse werden nicht
unterstützt. Für jede Anwendung und Umgebung einen eigenen Monitor mit eigenem
Token konfigurieren. Das Inventar beschreibt Lockdateiversionen, nicht den
tatsächlichen Inhalt von `vendor` oder `node_modules`.

## Lizenz

MIT. Siehe [LICENSE](LICENSE).
