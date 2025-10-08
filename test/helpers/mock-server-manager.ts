/**
 * Helper to manage mock MCP server processes for tests
 */
import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const wait = promisify(setTimeout);

export class MockServerManager {
  private servers: Map<string, ChildProcess> = new Map();

  async startServer(name: string, serverScript: string): Promise<void> {
    if (this.servers.has(name)) {
      return; // Server already running
    }

    const scriptPath = join(__dirname, '..', 'mock-mcps', serverScript);
    const process = spawn('node', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    });

    this.servers.set(name, process);

    // Wait a bit for the server to initialize
    await wait(1000);

    // Set up error handling
    process.on('error', (err) => {
      console.error(`Error in mock server ${name}:`, err);
    });

    // Set up exit handling
    process.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Mock server ${name} exited with code ${code}`);
      }
      this.servers.delete(name);
    });
  }

  async stopAll(): Promise<void> {
    // Give processes a chance to clean up gracefully
    for (const [name, process] of this.servers.entries()) {
      if (!process.killed) {
        process.kill('SIGTERM');
      }
      this.servers.delete(name);
    }

    // Wait for processes to clean up
    await wait(500);

    // Force kill any remaining processes
    for (const [name, process] of this.servers.entries()) {
      if (!process.killed) {
        process.kill('SIGKILL');
        this.servers.delete(name);
      }
    }
  }
}