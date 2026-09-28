import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { createServer } from 'node:http';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  stat,
  rm,
  copyFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('UPBOT_')),
);

test('installed clients use env configuration, verify without reporting and fail safely', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'upbot-client-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, 'customer project');
  await mkdir(project);
  const { stdout } = await execFile(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', root],
    { cwd: packageDirectory, env },
  );
  const archive = join(root, JSON.parse(stdout)[0].filename);
  await writeFile(join(project, 'package.json'), '{"private":true}');
  await execFile(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--offline',
      '--no-audit',
      '--no-fund',
      archive,
    ],
    { cwd: project, env },
  );
  const clients = [
    {
      name: 'npm',
      runtime: process.execPath,
      bin: join(project, 'node_modules/@upbot-eu/dependencies/bin/upbot.mjs'),
    },
  ];
  if (process.env.UPBOT_TEST_PHP_ROOT)
    clients.push({
      name: 'Composer',
      runtime: 'php',
      bin: join(process.env.UPBOT_TEST_PHP_ROOT, 'vendor/bin/upbot'),
    });
  else
    t.diagnostic(
      'PHP/Laravel installation checks require UPBOT_TEST_PHP_ROOT (see docs/DEPENDENCY_PACKAGES.md).',
    );

  const requests = [];
  let reportStatus = 202;
  const token = 'upbot_dep_' + 'A'.repeat(43);
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({
      method: request.method,
      url: request.url,
      body,
      authorization: request.headers.authorization,
    });
    if (request.headers.authorization !== 'Bearer ' + token) {
      response.writeHead(401).end();
      return;
    }
    if (request.url.endsWith('/verify')) {
      response.writeHead(204).end();
      return;
    }
    response.writeHead(reportStatus, {
      'content-type': 'application/json',
      ...(reportStatus === 302 ? { location: '/redirected' } : {}),
    });
    response.end('{"accepted":true}');
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise((done) => server.close(done)));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/v1/dependencies/report`;
  const config = `UPBOT_TOKEN=${token}\nUPBOT_ENDPOINT=${endpoint}\nUPBOT_PRIVATE_PACKAGES="company/private"\nUPBOT_RELEASE="deploy 42" # comment\n`;
  const composerLock = JSON.stringify({
    packages: [
      {
        name: 'public/package',
        version: '1.0.0',
        dist: { url: 'https://private.example?secret=never-send' },
      },
      { name: 'company/private', version: '2.0.0' },
    ],
    'packages-dev': [],
  });
  const npmLock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      'node_modules/example': {
        version: '1.2.3',
        resolved: 'https://registry.npmjs.org/example/-/example.tgz',
      },
    },
  });
  await writeFile(join(project, 'composer.lock'), composerLock);
  await writeFile(join(project, 'package-lock.json'), npmLock);

  for (const client of clients) {
    const call = (args, overrides = {}) =>
      execFile(client.runtime, [client.bin, ...args], {
        cwd: project,
        env: { ...env, ...overrides },
      });
    const configName = `.env.${client.name}`;
    await call(['init', '--dotenv', configName]);
    assert.equal((await stat(join(project, configName))).mode & 0o077, 0);
    const original = await readFile(join(project, configName), 'utf8');
    await assert.rejects(call(['init', '--dotenv', configName]));
    assert.equal(await readFile(join(project, configName), 'utf8'), original);
    await writeFile(join(project, configName), config);
    const before = requests.length;
    assert.match(
      (await call(['doctor', '--dotenv', configName])).stdout,
      /No inventory sent/,
    );
    assert.equal(requests.length, before + 1);
    assert.equal(requests.at(-1).method, 'GET');
    assert.equal(requests.at(-1).body, '');
    assert.match(
      (
        await call(
          ['doctor', '--project-dir', project, '--dotenv', configName],
          { UPBOT_PROJECT_DIR: '/missing/project' },
        )
      ).stdout,
      /connection OK/,
    );
    const report = await call(['report', '--dotenv', configName]);
    assert.match(report.stdout, /3 dependency entries accepted/);
    const body = JSON.parse(requests.at(-1).body);
    assert.equal(body.release, 'deploy 42');
    assert.equal(
      body.packages.find((p) => p.name === 'company/private').source,
      'unverified',
    );
    assert.ok(!requests.at(-1).body.includes('never-send'));
    assert.ok(!report.stdout.includes(token));
    await assert.rejects(
      call(['doctor', '--dotenv', configName], {
        UPBOT_TOKEN: 'upbot_dep_' + 'B'.repeat(43),
      }),
      (error) =>
        error.stderr.includes('401') && !error.stderr.includes('B'.repeat(43)),
    );
    await assert.rejects(call(['report', '--dotenv', 'missing.env']));
    await writeFile(join(project, 'composer.lock'), '{invalid json');
    const count = requests.length;
    await assert.rejects(call(['report', '--dotenv', configName]));
    assert.equal(
      requests.length,
      count,
      'invalid lockfile cannot replace inventory',
    );
    await writeFile(join(project, 'composer.lock'), composerLock);
    for (const status of [200, 302, 429]) {
      reportStatus = status;
      await assert.rejects(call(['report', '--dotenv', configName]));
      assert.ok(
        !requests.some((r) => r.url === '/redirected'),
        'never follow redirects with the token',
      );
    }
    reportStatus = 202;
    await writeFile(join(project, '.env'), config);
    assert.match((await call(['doctor'])).stdout, /connection OK/);
  }

  if (process.env.UPBOT_TEST_PHP_ROOT) {
    await t.test(
      'Laravel discovery, cached config and scheduler use the installed adapter',
      async () => {
        const laravel = join(root, 'laravel');
        for (const path of [
          'bootstrap/cache',
          'config',
          'storage/framework/cache/data',
          'storage/logs',
        ])
          await mkdir(join(laravel, path), { recursive: true });
        await writeFile(
          join(laravel, 'composer.json'),
          '{"name":"upbot/test","extra":{"laravel":{}}}',
        );
        await copyFile(
          join(process.env.UPBOT_TEST_PHP_ROOT, 'composer.lock'),
          join(laravel, 'composer.lock'),
        );
        // Laravel's discovery reads the installed metadata at base_path/vendor.
        const { symlink } = await import('node:fs/promises');
        await symlink(
          join(process.env.UPBOT_TEST_PHP_ROOT, 'vendor'),
          join(laravel, 'vendor'),
        );
        await writeFile(
          join(laravel, '.env'),
          config + '\nUPBOT_SCHEDULE_CRON="19 */6 * * *"\nAPP_ENV=testing\n',
        );
        await writeFile(
          join(laravel, 'config/cache.php'),
          "<?php return ['default' => 'array', 'stores' => ['array' => ['driver' => 'array']]];\n",
        );
        await writeFile(
          join(laravel, 'bootstrap/app.php'),
          '<?php return Illuminate\\Foundation\\Application::configure(basePath: dirname(__DIR__))->create();\n',
        );
        await copyFile(
          resolve(repository, 'integrations/laravel/test/artisan.php'),
          join(laravel, 'artisan'),
        );
        const call = (args) =>
          execFile('php', [join(laravel, 'artisan'), ...args], {
            cwd: laravel,
            env: {
              ...env,
              UPBOT_TEST_PHP_ROOT: process.env.UPBOT_TEST_PHP_ROOT,
            },
          });
        const before = requests.length;
        assert.match(
          (await call(['upbot', 'doctor'])).stdout,
          /No inventory sent/,
        );
        assert.equal(requests.length, before + 1);
        assert.match((await call(['upbot', 'init'])).stdout, /upbot-config/);
        assert.ok(await stat(join(laravel, 'config/upbot.php')));
        assert.match(
          (await call(['schedule:list'])).stdout,
          /19.*6.*upbot report/,
        );
        await call(['config:cache']);
        await rm(join(laravel, '.env'));
        assert.match((await call(['upbot', 'report'])).stdout, /accepted/);
        assert.equal(JSON.parse(requests.at(-1).body).release, 'deploy 42');
        assert.match((await call(['schedule:list'])).stdout, /upbot report/);
        await call(['config:clear']);
        assert.ok(
          !(await call(['schedule:list'])).stdout.includes('upbot report'),
          'unconfigured adapter schedules nothing',
        );
      },
    );
  }
});
