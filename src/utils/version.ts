/**
 * Version utility for reading package version
 * Uses Node.js createRequire pattern with fixed relative path to package.json
 */

import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';

// Read package.json using the standard approach for ES modules
// This file is at: dist/utils/version.js
// Package.json is at: ../../package.json (relative to compiled file)
export function getPackageInfo() {
  try {
    // In test environments, return test version
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      return { version: '0.0.0-test', packageName: '@portel/ncp' };
    }

    // Get the entry script location (handles symlinks for global npm installs)
    // e.g., /usr/local/bin/ncp (symlink) -> /usr/.../ncp/dist/index.js (real)
    const entryScript = realpathSync(process.argv[1]);
    const entryScriptUrl = `file://${entryScript}`;

    // Use createRequire to load package.json with fixed relative path
    const require = createRequire(entryScriptUrl);
    const pkg = require('../package.json'); // From dist/index.js to package.json

    return { version: pkg.version, packageName: pkg.name };
  } catch (e) {
    throw new Error(`Failed to load package.json: ${e}`);
  }
}

export const version = getPackageInfo().version;
export const packageName = getPackageInfo().packageName;