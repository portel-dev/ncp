/**
 * Simple CLI Progress Spinner
 * Shows animated progress during long-running operations
 */

import chalk from 'chalk';

export class ProgressSpinner {
  private interval: NodeJS.Timeout | null = null;
  private frame = 0;
  private message = '';
  private subMessage = '';
  private isSpinning = false;
  private isFirstRender = true;

  private readonly frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  start(message: string): void {
    if (this.isSpinning) {
      this.stop();
    }

    this.message = message;
    this.subMessage = '';
    this.frame = 0;
    this.isSpinning = true;
    this.isFirstRender = true;

    // Add blank line before spinner starts (don't overwrite command line)
    process.stdout.write('\n');

    // Hide cursor
    process.stdout.write('\u001B[?25l');

    this.interval = setInterval(() => {
      this.render();
      this.frame = (this.frame + 1) % this.frames.length;
    }, 80);

    this.render();
  }

  updateMessage(message: string, subMessage?: string): void {
    if (!this.isSpinning) return;

    this.message = message;
    if (subMessage !== undefined) {
      this.subMessage = subMessage;
    }
  }

  updateSubMessage(subMessage: string): void {
    if (!this.isSpinning) return;
    this.subMessage = subMessage;
  }

  stop(): void {
    if (!this.isSpinning) return;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.isSpinning = false;

    // Clear the current line(s)
    this.clearLines();

    // Show cursor
    process.stdout.write('\u001B[?25h');
  }

  success(message: string): void {
    this.stop();
    console.log(chalk.green(`✅ ${message}`));
  }

  error(message: string): void {
    this.stop();
    console.log(chalk.red(`❌ ${message}`));
  }

  private render(): void {
    if (!this.isSpinning) return;

    // Clear previous output (skip on first render to preserve newline)
    if (!this.isFirstRender) {
      this.clearLines();
    } else {
      this.isFirstRender = false;
    }

    // Main spinner line
    const spinnerChar = chalk.cyan(this.frames[this.frame]);
    const mainLine = `${spinnerChar} ${chalk.white(this.message)}`;

    process.stdout.write(mainLine);

    // Sub-message line (debug logs)
    if (this.subMessage) {
      const subLine = `\n  ${chalk.dim(this.subMessage)}`;
      process.stdout.write(subLine);
    }
  }

  private clearLines(): void {
    // Move to beginning of line and clear
    process.stdout.write('\r\u001B[K');

    // If there was a sub-message, clear the previous line too
    if (this.subMessage) {
      process.stdout.write('\u001B[A\r\u001B[K');
    }
  }
}

// Export a singleton instance for convenience
export const spinner = new ProgressSpinner();