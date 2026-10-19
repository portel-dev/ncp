const { chmodSync } = require('node:fs');
const { join } = require('node:path');

const distDirectory = join(__dirname, '..', 'dist');
for (const name of ['index.js', 'index-mcp.js']) {
  chmodSync(join(distDirectory, name), 0o755);
}
