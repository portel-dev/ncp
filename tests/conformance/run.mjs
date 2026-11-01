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
// Keep the previous stable lifecycle covered while exercising the currently
// published wire protocol. The 2026-07-28 revision is stateless, so it has no
// initialize scenario; tools_call is applicable to both revisions.
for (const [scenario, specVersion] of [
  ['initialize', '2025-11-25'],
  ['tools_call', '2025-11-25'],
  ['tools_call', '2026-07-28'],
]) {
  const result = spawnSync(process.execPath, [cli, 'client', '--command', command,
    '--scenario', scenario, '--spec-version', specVersion, '--timeout', '30000'], {
    cwd: root, stdio: 'inherit', timeout: 60_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
