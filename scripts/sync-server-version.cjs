// Syncs release metadata versions with package.json.
const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(__dirname, '../package.json');
const serverPath = path.resolve(__dirname, '../server.json');
const manifestPath = path.resolve(__dirname, '../manifest.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const server = JSON.parse(fs.readFileSync(serverPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

let changed = false;

if (server.version !== pkg.version || server.packages?.[0]?.version !== pkg.version) {
  server.version = pkg.version;
  if (server.packages && server.packages[0]) {
    server.packages[0].version = pkg.version;
  }
  fs.writeFileSync(serverPath, `${JSON.stringify(server, null, 2)}\n`);
  console.log(`server.json version updated to ${pkg.version}`);
  changed = true;
} else {
  console.log('server.json version already matches package.json');
}

if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest.json version updated to ${pkg.version}`);
  changed = true;
} else {
  console.log('manifest.json version already matches package.json');
}

if (!changed) {
  console.log('Release metadata is already synchronized');
}
