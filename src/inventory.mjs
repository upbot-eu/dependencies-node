import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function collectPackages(projectDir, privatePackages = []) {
  const packages = [];
  let files = 0;
  const privateNames = new Set(privatePackages);
  async function read(name) {
    try {
      const text = await readFile(resolve(projectDir, name), 'utf8');
      files++;
      const value = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error();
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new Error(`Cannot read valid ${name}.`);
    }
  }
  function add(ecosystem, name, entry, dev, registry = true) {
    if (!name) throw new Error('A lockfile package has no name.');
    const version =
      typeof entry.version === 'string' &&
      /^[a-zA-Z0-9.+_-]{1,100}$/.test(entry.version)
        ? entry.version
        : 'unknown';
    packages.push({
      ecosystem,
      name,
      version,
      dev: !!dev,
      source:
        version !== 'unknown' && registry && !privateNames.has(name)
          ? 'registry'
          : 'unverified',
    });
  }
  const composer = await read('composer.lock');
  if (composer) {
    if (
      !Array.isArray(composer.packages) ||
      (composer['packages-dev'] !== undefined &&
        !Array.isArray(composer['packages-dev']))
    )
      throw new Error('Invalid composer.lock');
    for (const p of composer.packages) add('Packagist', p.name, p, false);
    for (const p of composer['packages-dev'] ?? [])
      add('Packagist', p.name, p, true);
  }
  const npm = await read('package-lock.json');
  const isRegistry = (p) =>
    typeof p.resolved === 'string' &&
    p.resolved.startsWith('https://registry.npmjs.org/');
  if (npm) {
    if (
      [2, 3].includes(npm.lockfileVersion) &&
      npm.packages &&
      typeof npm.packages === 'object' &&
      !Array.isArray(npm.packages)
    ) {
      for (const [path, p] of Object.entries(npm.packages)) {
        if (!path.includes('node_modules/')) continue;
        const name = p.name ?? path.split('node_modules/').at(-1);
        add('npm', name, p, p.dev, !p.link && isRegistry(p));
      }
    } else if (
      npm.lockfileVersion === 1 &&
      npm.dependencies &&
      typeof npm.dependencies === 'object' &&
      !Array.isArray(npm.dependencies)
    ) {
      function walk(dependencies) {
        if (
          !dependencies ||
          typeof dependencies !== 'object' ||
          Array.isArray(dependencies)
        )
          throw new Error('Invalid npm dependencies.');
        for (const [name, p] of Object.entries(dependencies)) {
          add('npm', name, p, p.dev, isRegistry(p));
          if (p.dependencies) walk(p.dependencies);
        }
      }
      walk(npm.dependencies);
    } else throw new Error('Supported npm lockfile versions: 1, 2, 3.');
  }
  if (!files) throw new Error('No composer.lock or package-lock.json found.');
  return packages;
}
