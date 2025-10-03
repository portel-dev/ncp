// Syncs server.json version with package.json
const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(__dirname, '../package.json');
const serverPath = path.resolve(__dirname, '../server.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const server = JSON.parse(fs.readFileSync(serverPath, 'utf8'));

if (server.version !== pkg.version) {
  server.version = pkg.version;
  if (server.packages && server.packages[0]) {
    server.packages[0].version = pkg.version;
  }
  fs.writeFileSync(serverPath, JSON.stringify(server, null, 2));
  console.log(`server.json version updated to ${pkg.version}`);
} else {
  console.log('server.json version already matches package.json');
}
