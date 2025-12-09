// Jest setup file that runs before the test framework initializes
// Ensure photon runtime stays disabled during tests to avoid loading TypeScript Photons
if (!process.env.NCP_ENABLE_PHOTON_RUNTIME) {
  process.env.NCP_ENABLE_PHOTON_RUNTIME = 'false';
}

// Disable heavy background initialization during tests to prevent async teardown warnings
if (!process.env.NCP_DISABLE_BACKGROUND_INIT) {
  process.env.NCP_DISABLE_BACKGROUND_INIT = 'true';
}
