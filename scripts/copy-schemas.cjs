const { copyFileSync, mkdirSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const sourceDirectory = join(__dirname, '..', 'src', 'internal-mcps');
const destinationDirectory = join(__dirname, '..', 'dist', 'internal-mcps');

mkdirSync(destinationDirectory, { recursive: true });

let schemaFiles;
try {
  schemaFiles = readdirSync(sourceDirectory).filter((name) => name.endsWith('.schema.json'));
} catch (error) {
  if (error.code === 'ENOENT') process.exit(0);
  throw error;
}

for (const name of schemaFiles) {
  copyFileSync(join(sourceDirectory, name), join(destinationDirectory, name));
}
