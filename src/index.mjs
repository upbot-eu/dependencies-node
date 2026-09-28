import { collectPackages } from './inventory.mjs';
export { collectPackages } from './inventory.mjs';

export const defaultEndpoint =
  'https://app.upbot.eu/api/v1/dependencies/report';

export function validateConfig(config) {
  let url;
  try {
    url = new URL(config.endpoint ?? defaultEndpoint);
  } catch {
    throw new Error('Invalid endpoint.');
  }
  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
  )
    throw new Error('HTTPS endpoint required.');
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith('/v1/dependencies/report')
  )
    throw new Error(
      'Endpoint must end with /v1/dependencies/report and contain no credentials, query or fragment.',
    );
  if (!/^upbot_dep_[A-Za-z0-9_-]{43}$/.test(config.token ?? ''))
    throw new Error('Invalid monitoring token. Set UPBOT_TOKEN.');
  if (typeof config.projectDir !== 'string' || !config.projectDir)
    throw new Error('Invalid project directory.');
  if (
    config.privatePackages !== undefined &&
    (!Array.isArray(config.privatePackages) ||
      config.privatePackages.some((name) => typeof name !== 'string'))
  )
    throw new Error('privatePackages must be an array of package names.');
  return url;
}

export async function run(config, action = 'report') {
  if (!['doctor', 'report'].includes(action))
    throw new Error('Supported actions: doctor, report.');
  const url = validateConfig(config);
  const packages = await collectPackages(
    config.projectDir,
    config.privatePackages,
  );
  const body = JSON.stringify({ packages, release: config.release || null });
  if (packages.length > 2000 || Buffer.byteLength(body) > 1024 * 1024)
    throw new Error('Inventory exceeds UpBot limits (2000 packages / 1 MiB).');
  if (action === 'doctor')
    url.pathname = url.pathname.replace(/\/report$/, '/verify');
  let response;
  try {
    response = await fetch(url, {
      method: action === 'doctor' ? 'GET' : 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.token}`,
      },
      ...(action === 'report' ? { body } : {}),
    });
  } catch {
    throw new Error(
      'UpBot connection failed (check endpoint, TLS and network).',
    );
  }
  if (action === 'doctor') {
    if (response.status !== 204)
      throw new Error(
        `UpBot HTTP ${response.status}; token verification failed.`,
      );
  } else {
    if (response.status !== 202)
      throw new Error(`UpBot HTTP ${response.status}; report not accepted.`);
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error('Invalid UpBot response.');
    }
    if (result?.accepted !== true)
      throw new Error('UpBot did not confirm report acceptance.');
  }
  return { packageCount: packages.length };
}
