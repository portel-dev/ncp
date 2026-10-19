import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('../../node_modules/@modelcontextprotocol/conformance/dist/index.js', import.meta.url));
// The official CLI accepts a shell command string; quote executable/file paths
// so checkout directories containing spaces work on supported operating systems.
const quote = value => process.platform === 'win32'
  ? `"${value.replaceAll('"', '""')}"`
  : `'${value.replaceAll("'", "'\\''")}'`;
const command = `${quote(process.execPath)} --import tsx ${quote(fileURLToPath(new URL('../fixtures/conformance-client.ts', import.meta.url)))}`;
for (const scenario of ['initialize', 'tools_call']) {
  const result = spawnSync(process.execPath, [cli, 'client', '--command', command,
    '--scenario', scenario, '--spec-version', '2025-11-25', '--timeout', '30000'], {
    cwd: root, stdio: 'inherit', timeout: 60_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
