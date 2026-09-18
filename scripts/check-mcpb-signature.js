#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { extractSignatureBlock } from '@anthropic-ai/mcpb/node';

const execFileAsync = promisify(execFile);
const bundlePath = resolve(process.argv[2] || '_internal/artifacts/ncp.mcpb');
const workDir = await mkdtemp(join(tmpdir(), 'ncp-mcpb-signature-'));

try {
  const bundle = await readFile(bundlePath);
  const { originalContent, pkcs7Signature } = extractSignatureBlock(bundle);

  if (!pkcs7Signature?.length) {
    throw new Error(`${basename(bundlePath)} has no MCPB signature block`);
  }

  const contentPath = join(workDir, 'content.bin');
  const signaturePath = join(workDir, 'signature.der');
  const verifiedOutputPath = join(workDir, 'verified.bin');
  await Promise.all([
    writeFile(contentPath, originalContent),
    writeFile(signaturePath, pkcs7Signature),
  ]);

  // Verify the detached PKCS#7 signature and content digest. Certificate-chain
  // trust is intentionally separate: development bundles use a self-signed
  // certificate, while production signing supplies the release certificate.
  await execFileAsync('openssl', [
    'smime',
    '-verify',
    '-inform', 'DER',
    '-in', signaturePath,
    '-content', contentPath,
    '-noverify',
    '-out', verifiedOutputPath,
  ]);

  console.log(`Verified detached MCPB signature: ${bundlePath}`);
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`MCPB signature verification failed: ${detail}`);
  process.exitCode = 1;
} finally {
  await rm(workDir, { recursive: true, force: true });
}
