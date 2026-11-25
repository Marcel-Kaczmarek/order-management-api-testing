import { spawnSync, type SpawnSyncOptions } from 'node:child_process';

/** Cross-platform command runner (Windows, Linux, macOS). */
export function run(command: string, args: string[], options: SpawnSyncOptions = {}): number {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.error) {
    console.error(`Failed to start "${command}": ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

export function commandExists(command: string): boolean {
  const probe = spawnSync(command, ['--version'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return probe.status === 0;
}

/**
 * Tools such as Newman and k6 honour HTTP(S)_PROXY. Traffic to the local AUT
 * must never be routed through a (corporate) proxy, so localhost is exempted.
 */
export function bypassProxyForLocalhost(): void {
  const hosts = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'];
  const current = (process.env.NO_PROXY ?? process.env.no_proxy ?? '').split(',').filter(Boolean);
  const merged = [...new Set([...current, ...hosts])].join(',');
  process.env.NO_PROXY = merged;
  process.env.no_proxy = merged;
}

export function exitWith(code: number): never {
  process.exit(code);
}
