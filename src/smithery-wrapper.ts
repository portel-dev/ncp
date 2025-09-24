/**
 * Smithery wrapper for NCP
 * This file makes NCP compatible with Smithery's TypeScript runtime
 */

import { spawn } from 'child_process';
import { z } from 'zod';

// Config schema for Smithery
export const configSchema = z.object({
  profile: z.string().default('default').describe('NCP profile to use'),
});

// Export default function that Smithery expects
export default function createServer({ config }: { config: z.infer<typeof configSchema> }) {
  // Since NCP is a CLI orchestrator, we spawn it as a subprocess
  const args = config.profile !== 'default' ? ['--profile', config.profile] : [];

  const ncpProcess = spawn('npx', ['@portel/ncp', ...args], {
    stdio: 'inherit',
    shell: true
  });

  // Return a minimal server object (Smithery requires this)
  return {
    // The actual MCP communication happens through the spawned NCP process
    connect: async (transport: any) => {
      // NCP handles its own transport
      return ncpProcess;
    }
  };
}