/**
 * Helper to manage mock server processes for tests
 */
import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const wait = promisify(setTimeout);

/**
 * Interface to track server readiness state
 */
interface ServerState {
  sawStdout: boolean;
  sawStderr: boolean;
  sawReady: boolean;
  sawError: boolean;
  lastError: string;
  outputLog: string[];
}

export class MockServerManager {
  private servers: Map<string, ChildProcess>;

  constructor() {
    this.servers = new Map();
  }

  private readonly MAX_RETRIES = 5;
  private readonly RETRY_DELAY = 3000;
  private readonly TIMEOUT_MS = 10000;

  async startServer(name: string, serverScript: string): Promise<void> {
    if (this.servers.has(name)) {
      return; // Server already running
    }

    // Retry loop for starting server
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.error(`Starting ${name} server (attempt ${attempt}/${this.MAX_RETRIES})...`);
        
        const scriptPath = join(__dirname, '..', 'mock-mcps', serverScript);
        console.error(`[DEBUG] Starting server from path: ${scriptPath}`);
        
        const serverProcess = spawn('node', [scriptPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: false,
          env: {
            ...process.env,
            NODE_ENV: 'test',
            DEBUG: '*',
            FORCE_COLOR: '0'
          }
        });
        
        // Handle process errors
        serverProcess.on('spawn', () => {
          console.error(`[DEBUG] Process spawned for ${name} server with pid ${serverProcess.pid}`);
        });

        // Wait for server to signal it's ready
        await new Promise<void>((resolve, reject) => {
          const state: ServerState = {
            sawStdout: false,
            sawStderr: false,
            sawReady: false,
            sawError: false,
            lastError: '',
            outputLog: []
          };

          const logOutput = (type: string, msg: string) => {
            state.outputLog.push(`[${type}] ${msg.trim()}`);
            if (state.outputLog.length > 100) {
              state.outputLog.shift();
            }
          };

          let readyTimeout: NodeJS.Timeout | undefined;

          // Set timeout for server startup
          readyTimeout = setTimeout(() => {
            // Print output log for diagnosis
            console.error('Recent output:', state.outputLog.join('\n'));
            
            // Log timeout status
            console.error(`Timeout status for ${name} server:`, {
              pid: serverProcess.pid,
              ...state,
              uptime: process.uptime(),
              memory: process.memoryUsage()
            });
            
            if (!serverProcess.killed) {
              console.error(`Killing ${name} server (pid: ${serverProcess.pid})...`);
              try {
                serverProcess.kill('SIGTERM');
                // Force kill after 1s if SIGTERM doesn't work
                setTimeout(() => {
                  if (!serverProcess.killed) {
                    console.error(`Force killing ${name} server...`);
                    try {
                      serverProcess.kill('SIGKILL');
                    } catch (err) {
                      // Ignore kill errors
                    }
                  }
                }, 1000).unref();
              } catch (err) {
                console.error(`Error killing ${name} server:`, err);
              }
            }
            reject(new Error(`Timeout waiting for ${name} server to start - ${state.lastError}`));
          }, this.TIMEOUT_MS);
          readyTimeout.unref();

          // Enhanced stdout handling with buffering
          let stdoutBuffer = '';
          serverProcess.stdout?.on('data', (data: Buffer) => {
            state.sawStdout = true;
            const output = data.toString();
            stdoutBuffer += output;
            logOutput('STDOUT', output);
            
            // Check for ready signal in accumulated buffer
            if (stdoutBuffer.includes(`[READY] ${name}`)) {
              state.sawReady = true;
              console.error(`[DEBUG] ${name} server ready signal received in stdout buffer (attempt ${attempt}/${this.MAX_RETRIES})`);
              if (readyTimeout) clearTimeout(readyTimeout);
              this.servers.set(name, serverProcess);
              resolve();
            }
            
            // Check for various error conditions
            if (output.includes('Failed to load MCP SDK dependencies')) {
              state.sawError = true;
              state.lastError = 'Failed to load SDK dependencies';
              console.error(`[ERROR] ${name} server failed to load dependencies (attempt ${attempt}/${this.MAX_RETRIES})`);
              if (readyTimeout) clearTimeout(readyTimeout);
              serverProcess.kill('SIGTERM');
              reject(new Error('Server failed to load dependencies'));
              return;
            }
            
            if (output.includes('Error:') || output.includes('Error stack:') || output.includes('Failed to')) {
              state.sawError = true;
              state.lastError = output.trim();
            }
          });

          // Enhanced stderr handling with buffering
          let stderrBuffer = '';
          serverProcess.stderr?.on('data', (data: Buffer) => {
            state.sawStderr = true;
            const output = data.toString();
            stderrBuffer += output;
            logOutput('STDERR', output);
            
            // Collect error messages
            if (output.includes('Error:') || output.includes('Failed to')) {
              state.sawError = true;
              state.lastError = output.trim();
            }
            
            // Check for ready signal in accumulated buffer
            if (stderrBuffer.includes(`[READY] ${name}`)) {
              state.sawReady = true;
              console.error(`[DEBUG] ${name} server ready signal received in stderr buffer`);
              if (readyTimeout) clearTimeout(readyTimeout);
              this.servers.set(name, serverProcess);
              resolve();
            }
          });

          // Set up error handling
          serverProcess.on('error', (err: Error) => {
            if (readyTimeout) clearTimeout(readyTimeout);
            console.error(`Error in mock server ${name}:`, err);
            console.error(`Error status for ${name}:`, {
              pid: serverProcess.pid,
              ...state
            });
            reject(err);
          });

          // Set up exit handling
          serverProcess.on('exit', (code: number | null) => {
            console.error(`Mock server ${name} (pid: ${serverProcess.pid}) exited with code ${code}`, {
              ...state
            });
            this.servers.delete(name);
          });
        });

        // Successfully started server
        return;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Attempt ${attempt} failed:`, errorMessage);
        if (attempt < this.MAX_RETRIES) {
          // Wait before retrying
          await wait(this.RETRY_DELAY);
        }
      }
    }

    // All retries failed
    throw new Error(`Failed to start ${name} server after ${this.MAX_RETRIES} attempts`);
  }

  async stopAll(): Promise<void> {
    console.error('[DEBUG] Stopping all servers...');
    
    // Give processes a chance to clean up gracefully
    for (const [name, serverProcess] of this.servers.entries()) {
      try {
        console.error(`[DEBUG] Sending SIGTERM to ${name} server (pid: ${serverProcess.pid})...`);
        // Send SIGTERM first to allow clean shutdown
        serverProcess.kill('SIGTERM');
        
        // Remove from map immediately to prevent duplicate cleanup
        this.servers.delete(name);
        
        console.error(`[DEBUG] Successfully sent SIGTERM to ${name} server`);
      } catch (err) {
        console.error(`[ERROR] Error stopping server ${name}:`, err);
      }
    }

    // Wait longer for graceful shutdown
    console.error('[DEBUG] Waiting for processes to exit gracefully...');
    await wait(1000);

    // Force kill any remaining processes
    const remainingServers = new Map(this.servers);
    for (const [name, serverProcess] of remainingServers.entries()) {
      try {
        console.error(`[DEBUG] Force killing ${name} server (pid: ${serverProcess.pid})...`);
        // Kill process group to ensure child processes are terminated
        process.kill(-serverProcess.pid!, 'SIGKILL');
        this.servers.delete(name);
        console.error(`[DEBUG] Successfully killed ${name} server`);
      } catch (err: any) {
        // Only log if it's not a "no such process" error
        if (err instanceof Error && !err.message.includes('ESRCH')) {
          console.error(`[ERROR] Error force killing server ${name}:`, err);
        }
      }
    }

    // Clear any remaining entries and wait for final cleanup
    console.error('[DEBUG] Cleaning up server references...');
    this.servers.clear();
    await wait(100);
    console.error('[DEBUG] Server cleanup complete');
  }

  /**
   * Get all currently running servers
   */
  getAllServers(): Map<string, ChildProcess> {
    return new Map(this.servers);
  }
}