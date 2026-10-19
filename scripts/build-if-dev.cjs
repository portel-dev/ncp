const { statSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { isAbsolute, resolve, join } = require('node:path');

function hasLocalTypeScript(projectDirectory = process.cwd()) {
  try {
    return statSync(join(projectDirectory, 'node_modules', 'typescript')).isDirectory();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function runBuild(projectDirectory = process.cwd()) {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    console.error('Cannot run the development build: npm_execpath is not set.');
    process.exitCode = 1;
    return;
  }

  const npmCliPath = isAbsolute(npmExecPath) ? npmExecPath : resolve(projectDirectory, npmExecPath);
  const result = spawnSync(process.execPath, [npmCliPath, 'run', 'build'], {
    cwd: projectDirectory,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error('Cannot run the development build:', result.error.message);
    process.exitCode = 1;
  } else if (result.status !== null) {
    process.exitCode = result.status;
  } else {
    console.error(`The development build stopped with signal ${result.signal ?? 'unknown'}.`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  if (hasLocalTypeScript()) {
    runBuild();
  } else {
    console.log('Build skipped (production install)');
  }
}

module.exports = { hasLocalTypeScript };
