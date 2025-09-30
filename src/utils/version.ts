/**
 * Version utility for reading package version
 * Centralized to avoid duplication and simplify testing
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Helper to get package info - tries multiple strategies
function getPackageInfo() {
  // Try from process.cwd() (works when running from project root in tests and development)
  try {
    const cwdPackagePath = join(process.cwd(), 'package.json');
    if (existsSync(cwdPackagePath)) {
      const packageJson = JSON.parse(readFileSync(cwdPackagePath, 'utf8'));
      if (packageJson.name === '@portel/ncp') {
        return { version: packageJson.version, packageName: packageJson.name };
      }
    }
  } catch {}

  // Fallback for when package.json can't be found
  return { version: '1.3.2', packageName: '@portel/ncp' };
}

const packageInfo = getPackageInfo();
export const version = packageInfo.version;
export const packageName = packageInfo.packageName;