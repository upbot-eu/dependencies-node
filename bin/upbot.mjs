#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';
import { defaultEndpoint, run } from '../src/index.mjs';

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'project-dir': { type: 'string' },
      dotenv: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(
      'Usage: upbot init|doctor|report [--project-dir /app] [--dotenv /private/.env.upbot]',
    );
    return;
  }
  const action = positionals[0] ?? 'doctor';
  if (positionals.length > 1 || !['init', 'doctor', 'report'].includes(action))
    throw new Error('Supported actions: init, doctor, report. Use --help.');
  const directory = resolve(values['project-dir'] ?? process.cwd());
  const envPath = resolve(directory, values['dotenv'] ?? '.env.upbot');
  if (action === 'init') {
    try {
      await writeFile(
        envPath,
        `# Keep this file private and outside the public web root.\nUPBOT_TOKEN=replace_with_monitor_token\nUPBOT_ENDPOINT=${defaultEndpoint}\n# UPBOT_RELEASE=deploy-identifier\n# UPBOT_PRIVATE_PACKAGES=company/internal,@company/private\n`,
        { mode: 0o600, flag: 'wx' },
      );
    } catch (error) {
      if (error.code === 'EEXIST')
        throw new Error('Config already exists; it was left unchanged.');
      throw new Error('Cannot create private config file.');
    }
    console.log(
      'Created .env configuration (mode 600). Set UPBOT_TOKEN, then run upbot doctor and upbot report. See README for cron setup.',
    );
    return;
  }
  let env = {};
  let text;
  try {
    text = await readFile(envPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT' || values['dotenv'])
      throw new Error('Cannot read env file.');
    try {
      text = await readFile(resolve(directory, '.env'), 'utf8');
    } catch (fallback) {
      if (fallback.code !== 'ENOENT') throw new Error('Cannot read .env file.');
    }
  }
  if (text !== undefined) {
    try {
      env = parseEnv(text);
    } catch {
      throw new Error('Invalid env file.');
    }
  }
  const value = (key) => process.env[key] ?? env[key];
  const result = await run(
    {
      endpoint: value('UPBOT_ENDPOINT') || defaultEndpoint,
      token: value('UPBOT_TOKEN'),
      projectDir: resolve(
        directory,
        values['project-dir'] ? '.' : value('UPBOT_PROJECT_DIR') || '.',
      ),
      release: value('UPBOT_RELEASE'),
      privatePackages: (value('UPBOT_PRIVATE_PACKAGES') || '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    },
    action,
  );
  console.log(
    action === 'doctor'
      ? `UpBot: token and connection OK; ${result.packageCount} dependency entries readable. No inventory sent.`
      : `UpBot: ${result.packageCount} dependency entries accepted.`,
  );
}

main().catch((error) => {
  // Parser errors may contain argument values; never log arbitrary config or argv.
  console.error(
    error.code?.startsWith('ERR_PARSE_ARGS')
      ? 'UpBot: invalid arguments. Use --help.'
      : `UpBot: ${error.message}`,
  );
  process.exitCode = 1;
});
