/**
 * Native OS Dialog Fallback
 *
 * Provides native OS dialog boxes for when MCP elicitation is not supported.
 * Works independently of the MCP stdio protocol.
 *
 * Timeout Strategy:
 * - Short timeout (45s) for AI responsiveness
 * - Cached responses for retry support
 * - Clear user feedback on timeout
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import { logger } from './logger.js';

const execAsync = promisify(exec);

export interface DialogOptions {
  title: string;
  message: string;
  buttons?: string[];  // e.g., ['Approve', 'Cancel']
  defaultButton?: number;  // 0-based index
  icon?: 'warning' | 'info' | 'error' | 'question';
  timeoutSeconds?: number;  // Custom timeout (default: 45 seconds)
}

/**
 * Pending dialog state for retry support
 */
interface PendingDialog {
  promise: Promise<DialogResult>;
  startTime: number;
  options: DialogOptions;
}

/**
 * Cache of pending dialogs by content hash
 * Allows retry mechanism when AI times out before user responds
 */
const pendingDialogs = new Map<string, PendingDialog>();

/**
 * Cache of completed dialog results
 * Kept for 60 seconds to support retry after user responds
 */
const completedDialogs = new Map<string, { result: DialogResult; timestamp: number }>();

/**
 * Generate a hash for dialog content to enable retry lookups
 */
function getDialogHash(options: DialogOptions): string {
  return `${options.title}:${options.message}:${options.buttons?.join(',')}`;
}

export interface DialogResult {
  button: string;  // Button text that was clicked
  cancelled: boolean;  // True if user cancelled/closed dialog
  timedOut?: boolean;  // True if dialog timed out waiting for user
  stillPending?: boolean;  // True if dialog is still waiting (for retry)
}

/**
 * Show a native OS dialog box with retry support
 *
 * Falls back through different methods based on OS:
 * - macOS: AppleScript display dialog
 * - Windows: PowerShell dialogs
 * - Linux: zenity or kdialog
 *
 * Retry Mechanism:
 * 1. First call: Shows dialog with short timeout (45s), caches promise
 * 2. If timeout before user responds: Returns timedOut=true, stillPending=true
 * 3. Retry call: Checks cache, returns result if user already responded
 *
 * @param options Dialog configuration
 * @returns Which button was clicked and whether user cancelled/timed out
 */
export async function showNativeDialog(options: DialogOptions): Promise<DialogResult> {
  const hash = getDialogHash(options);
  const now = Date.now();

  // Clean up old completed dialogs (older than 60 seconds)
  for (const [key, value] of completedDialogs.entries()) {
    if (now - value.timestamp > 60000) {
      completedDialogs.delete(key);
    }
  }

  // Check if we already have a completed result (retry after user responded)
  const completed = completedDialogs.get(hash);
  if (completed) {
    logger.info('Returning cached dialog result from retry');
    completedDialogs.delete(hash); // Clear after use
    return completed.result;
  }

  // Check if dialog is already pending (concurrent call)
  let pending = pendingDialogs.get(hash);

  if (!pending) {
    // Start new dialog
    const os = platform();
    const dialogPromise = (async () => {
      try {
        let result: DialogResult;
        switch (os) {
          case 'darwin':
            result = await showMacDialog(options);
            break;
          case 'win32':
            result = await showWindowsDialog(options);
            break;
          case 'linux':
            result = await showLinuxDialog(options);
            break;
          default:
            throw new Error(`Unsupported platform: ${os}`);
        }

        // Cache the result for retry support
        completedDialogs.set(hash, { result, timestamp: Date.now() });
        pendingDialogs.delete(hash);

        return result;
      } catch (error: any) {
        pendingDialogs.delete(hash);
        logger.error(`Failed to show native dialog: ${error.message}`);
        throw error;
      }
    })();

    pending = {
      promise: dialogPromise,
      startTime: now,
      options
    };

    pendingDialogs.set(hash, pending);
  }

  // Wait for result with our own timeout check
  const timeoutMs = (options.timeoutSeconds || 45) * 1000;
  const elapsed = now - pending.startTime;
  const remainingTime = Math.max(0, timeoutMs - elapsed);

  if (remainingTime === 0) {
    // Already timed out
    return {
      button: 'Cancel',
      cancelled: true,
      timedOut: true,
      stillPending: false // Dialog already closed
    };
  }

  try {
    // Race between dialog result and our timeout
    const result = await Promise.race([
      pending.promise,
      new Promise<DialogResult>((_, reject) =>
        setTimeout(() => reject(new Error('DIALOG_TIMEOUT')), remainingTime)
      )
    ]);

    return result;
  } catch (error: any) {
    if (error.message === 'DIALOG_TIMEOUT') {
      // Our timeout hit, but dialog might still be open
      logger.warn(`Dialog timed out after ${Math.round(elapsed / 1000)}s, but may still be waiting for user`);
      return {
        button: 'Cancel',
        cancelled: true,
        timedOut: true,
        stillPending: true // Dialog is still open, user can still respond
      };
    }
    throw error;
  }
}

/**
 * Show macOS dialog using AppleScript
 */
async function showMacDialog(options: DialogOptions): Promise<DialogResult> {
  const buttons = options.buttons || ['OK', 'Cancel'];
  const defaultButton = options.defaultButton !== undefined ? options.defaultButton + 1 : 1; // AppleScript is 1-indexed
  const timeoutSeconds = options.timeoutSeconds || 45;

  // Map icon type to AppleScript icon
  const iconMap: Record<string, string> = {
    'warning': 'caution',
    'info': 'note',
    'error': 'stop',
    'question': 'note'
  };
  const icon = options.icon ? iconMap[options.icon] || 'note' : 'note';

  // Escape strings for AppleScript
  const escapeAS = (str: string) => str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const buttonsStr = buttons.map(b => `"${escapeAS(b)}"`).join(', ');

  // Build AppleScript as single line (continuation characters don't work with -e flag)
  const script = `tell application "System Events" to return button returned of (display dialog "${escapeAS(options.message)}" with title "${escapeAS(options.title)}" buttons {${buttonsStr}} default button ${defaultButton} with icon ${icon} giving up after ${timeoutSeconds})`;

  try {
    const { stdout } = await execAsync(`osascript -e ${JSON.stringify(script)}`);
    const buttonClicked = stdout.trim();

    return {
      button: buttonClicked,
      cancelled: buttonClicked === 'Cancel' || buttonClicked === ''
    };
  } catch (error: any) {
    // User cancelled (Command+Period or clicked X)
    if (error.code === 1) {
      return {
        button: 'Cancel',
        cancelled: true
      };
    }
    throw error;
  }
}

/**
 * Show Windows dialog using PowerShell
 *
 * Note: Windows MessageBox doesn't support timeout natively.
 * The 45-second timeout is handled by our Promise.race wrapper in showNativeDialog().
 */
async function showWindowsDialog(options: DialogOptions): Promise<DialogResult> {
  const buttons = options.buttons || ['OK', 'Cancel'];

  // Map to MessageBox buttons
  let buttonType = 'OKCancel';
  if (buttons.length === 1) {
    buttonType = 'OK';
  } else if (buttons.includes('Yes') && buttons.includes('No')) {
    buttonType = 'YesNo';
  }

  const iconMap: Record<string, string> = {
    'warning': 'Warning',
    'info': 'Information',
    'error': 'Error',
    'question': 'Question'
  };
  const icon = options.icon ? iconMap[options.icon] || 'Information' : 'Information';

  // Escape strings for PowerShell (use backticks for quotes)
  const escapePS = (str: string) => str.replace(/"/g, '`"').replace(/\n/g, '`n');

  // PowerShell as single-line command (multi-line scripts can fail with -Command)
  const script = `Add-Type -AssemblyName System.Windows.Forms; $result = [System.Windows.Forms.MessageBox]::Show("${escapePS(options.message)}", "${escapePS(options.title)}", [System.Windows.Forms.MessageBoxButtons]::${buttonType}, [System.Windows.Forms.MessageBoxIcon]::${icon}); Write-Output $result`;

  try {
    const { stdout } = await execAsync(`powershell -Command ${JSON.stringify(script)}`);
    const result = stdout.trim();

    // Map PowerShell result to button text
    const buttonMap: Record<string, string> = {
      'OK': buttons[0] || 'OK',
      'Cancel': buttons[buttons.length - 1] || 'Cancel',
      'Yes': 'Yes',
      'No': 'No'
    };

    const button = buttonMap[result] || result;

    return {
      button,
      cancelled: result === 'Cancel' || result === 'No'
    };
  } catch (error: any) {
    throw new Error(`PowerShell dialog failed: ${error.message}`);
  }
}

/**
 * Show Linux dialog using zenity (fallback to kdialog)
 *
 * Note: Neither zenity nor kdialog support timeout natively.
 * The 45-second timeout is handled by our Promise.race wrapper in showNativeDialog().
 * User must manually close dialog if they don't respond within timeout period.
 */
async function showLinuxDialog(options: DialogOptions): Promise<DialogResult> {
  // Try zenity first
  try {
    return await showZenityDialog(options);
  } catch (error) {
    // Fallback to kdialog
    try {
      return await showKDialogDialog(options);
    } catch (error2) {
      throw new Error('Neither zenity nor kdialog is available. Please install one of them.');
    }
  }
}

/**
 * Show dialog using zenity (GNOME/GTK environments)
 */
async function showZenityDialog(options: DialogOptions): Promise<DialogResult> {
  const buttons = options.buttons || ['OK', 'Cancel'];

  const iconMap: Record<string, string> = {
    'warning': 'warning',
    'info': 'info',
    'error': 'error',
    'question': 'question'
  };
  const icon = options.icon ? `--icon-name=${iconMap[options.icon]}` : '';

  // Zenity uses --extra-button for custom buttons
  const extraButtons = buttons.slice(0, -1).map(b => `--extra-button="${b}"`).join(' ');
  const cancelButton = buttons[buttons.length - 1];

  const cmd = `zenity --question --title="${options.title}" --text="${options.message}" ${icon} ${extraButtons} --ok-label="${buttons[0]}" --cancel-label="${cancelButton}"`;

  try {
    const { stdout } = await execAsync(cmd);
    const result = stdout.trim() || buttons[0];

    return {
      button: result,
      cancelled: false
    };
  } catch (error: any) {
    // Exit code 1 means Cancel was clicked
    if (error.code === 1) {
      return {
        button: cancelButton,
        cancelled: true
      };
    }
    throw error;
  }
}

/**
 * Show dialog using kdialog (KDE/Qt environments)
 */
async function showKDialogDialog(options: DialogOptions): Promise<DialogResult> {
  const buttons = options.buttons || ['OK', 'Cancel'];

  const iconMap: Record<string, string> = {
    'warning': 'warning',
    'info': 'information',
    'error': 'error',
    'question': 'question'
  };
  const icon = options.icon ? `--icon ${iconMap[options.icon]}` : '';

  // KDialog uses --yes-label and --no-label
  const cmd = `kdialog --yesno "${options.message}" --title "${options.title}" ${icon} --yes-label "${buttons[0]}" --no-label "${buttons[buttons.length - 1]}"`;

  try {
    await execAsync(cmd);
    return {
      button: buttons[0],
      cancelled: false
    };
  } catch (error: any) {
    // Exit code 1 means No/Cancel was clicked
    if (error.code === 1) {
      return {
        button: buttons[buttons.length - 1],
        cancelled: true
      };
    }
    throw error;
  }
}

/**
 * Show a confirmation dialog with Approve/Cancel buttons
 *
 * Convenience wrapper around showNativeDialog with retry support
 *
 * @returns Object with approved flag and retry information
 */
export async function showConfirmDialog(
  title: string,
  message: string,
  approveText: string = 'Approve',
  cancelText: string = 'Cancel'
): Promise<{
  approved: boolean;
  timedOut?: boolean;
  stillPending?: boolean;
}> {
  const result = await showNativeDialog({
    title,
    message,
    buttons: [approveText, cancelText],
    defaultButton: 0,
    icon: 'warning',
    timeoutSeconds: 45 // Short timeout for AI responsiveness
  });

  return {
    approved: !result.cancelled && result.button === approveText,
    timedOut: result.timedOut,
    stillPending: result.stillPending
  };
}
