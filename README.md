# UpBot dependency reporter

[English](README.md) · [Deutsch](README.de.md) · [Slovenčina](README.sk.md)

Node.js **20.12+ (20.x) or 22+**. No runtime dependencies. Reads `composer.lock`
and/or `package-lock.json` (npm v1–v3), including transitive and dev dependencies.
Sends package names, versions, ecosystem, dev/source flags and an optional release.

Install in the project:

```sh
npm install @upbot-eu/dependencies
```

Add the unique monitoring token to the existing private `.env` or process environment:

```dotenv
UPBOT_TOKEN=replace_with_monitor_token
```

```sh
npx --no-install upbot doctor
npx --no-install upbot report
```

The production endpoint and current project directory are defaults. No framework
adapter is required for Node, Next.js, Express or other server frameworks.
Install as a production dependency if the server uses `--omit=dev`.

Optionally run `npx --no-install upbot init` to create a private `.env.upbot` instead.
It will not overwrite existing files. Optional settings:

```dotenv
# UPBOT_ENDPOINT=https://app.upbot.eu/api/v1/dependencies/report
# UPBOT_RELEASE=deploy-42
# UPBOT_PRIVATE_PACKAGES=company/internal,@company/private
```

`doctor` checks configuration, lockfiles, connection and token without sending or
changing inventory. It requires UpBot's `/v1/dependencies/verify` endpoint.
`report` sends inventory; acceptance does not mean the vulnerability scan has finished.
Errors return a nonzero exit status. Tokens and response bodies are never logged.

Default dotenv file: `.env.upbot`, falling back to `.env`. Existing process
environment wins. Both commands support `--project-dir /app` and
`--dotenv /private/.env.upbot`; an explicit project directory wins over
`UPBOT_PROJECT_DIR`. Paths in dotenv resolve relative to the starting directory.
Put tokens outside the public web root, restrict the file with `chmod 600`, and
exclude it from Git. Never use a `NEXT_PUBLIC_` or other browser-exposed variable.

Example daily cron; adjust runtime and project paths (`command -v node`):

```cron
17 3 * * * /usr/bin/node /var/www/project/current/node_modules/@upbot-eu/dependencies/bin/upbot.mjs report --project-dir /var/www/project/current --dotenv /home/deploy/.config/upbot/project.env >> /home/deploy/upbot-report.log 2>&1
```

Set UpBot's expected interval to 24 hours. Use `17 */6 * * *` for 6 hours.
Cron uses server time; quote paths containing spaces and escape `%` in crontab.
The cron user must read the files; keep and rotate logs outside the web root.
Also run `report` after a successful deployment. Reports are limited to once a
minute per monitor (HTTP 429). No automatic install, update, cron creation or retry.

The lockfiles must describe the active release and remain available on the server.
Private packages listed in `UPBOT_PRIVATE_PACKAGES` and nonregistry npm packages
are marked unverified. Private package names still reach UpBot, but are not queried
against OSV. Yarn/pnpm locks and multiple project roots are not supported; configure
separate monitors for separate applications/environments. The inventory describes
lockfile versions, not the actual contents of `vendor` or `node_modules`.

## License

MIT. See [LICENSE](LICENSE).
