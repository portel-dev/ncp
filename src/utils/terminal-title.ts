/**
 * Terminal Title Control
 *
 * Utilities for setting and restoring terminal window titles.
 * Prevents child processes from changing the terminal title during command execution.
 * Also serves as branding and user information display.
 */

/**
 * Set the terminal title
 */
export function setTerminalTitle(title: string): void {
  // Use OSC 0 (Operating System Command) to set both icon and window title
  // Format: ESC ] 0 ; title BEL
  // \x1b = ESC, ]0; = OSC 0, \x07 = BEL
  if (process.stdout.isTTY) {
    process.stdout.write(`\x1b]0;${title}\x07`);
  }
}

/**
 * Restore terminal title to default (usually shows current directory or command)
 */
export function restoreTerminalTitle(): void {
  // Empty string resets to default behavior in most terminals
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b]0;\x07');
  }
}

/**
 * Set terminal title for the duration of an async operation
 * Automatically restores the title when done
 */
export async function withTerminalTitle<T>(
  title: string,
  fn: () => Promise<T>
): Promise<T> {
  setTerminalTitle(title);
  try {
    return await fn();
  } finally {
    restoreTerminalTitle();
  }
}

/**
 * Set branded NCP terminal title with command context
 * Format: "NCP - [Command] [Optional Context]"
 *
 * Examples:
 * - "NCP - Doctor"
 * - "NCP - Running github:create_issue"
 * - "NCP - Finding tools"
 * - "NCP - Adding MCPs"
 */
export function setNCPTitle(command: string, context?: string): void {
  const title = context
    ? `NCP - ${command} - ${context}`
    : `NCP - ${command}`;
  setTerminalTitle(title);
}

/**
 * Update terminal title with progress information
 * Format: "NCP - [Command] ([Progress])"
 *
 * Example: "NCP - Doctor (15/50 MCPs checked)"
 */
export function updateNCPProgress(command: string, progress: string): void {
  setTerminalTitle(`NCP - ${command} (${progress})`);
}
