/**
 * CLI Help Parser
 * Parses CLI tool help output to extract operations and parameters
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

export interface CLIOperation {
  name: string;
  description: string;
  keywords: string[];  // For search/discovery
  commandTemplate?: string;  // Template for AI to use
  examples?: string[];
}

export interface CLIToolInfo {
  baseCommand: string;
  version?: string;
  description?: string;
  operations: CLIOperation[];
}

export class CLIParser {
  /**
   * Parse CLI tool and extract operations
   */
  async parseCliTool(
    baseCommand: string,
    helpFlag: string = '--help'
  ): Promise<CLIToolInfo> {
    try {
      // Try to get help output
      const helpOutput = await this.getHelpOutput(baseCommand, helpFlag);

      // Detect tool type and use appropriate parser
      if (baseCommand === 'ffmpeg' || helpOutput.includes('FFmpeg version')) {
        return await this.parseFFmpeg(baseCommand, helpOutput);
      } else {
        return await this.parseGeneric(baseCommand, helpOutput);
      }
    } catch (error: any) {
      logger.error(`Failed to parse CLI tool ${baseCommand}:`, error);
      throw new Error(`Failed to parse ${baseCommand}: ${error.message}`);
    }
  }

  /**
   * Get help output from CLI tool
   */
  private async getHelpOutput(
    baseCommand: string,
    helpFlag: string
  ): Promise<string> {
    try {
      // Try primary help flag
      const { stdout, stderr } = await execAsync(`${baseCommand} ${helpFlag} 2>&1`, {
        timeout: 10000,
        maxBuffer: 1024 * 1024 * 10  // 10MB buffer for large help outputs
      });
      return stdout || stderr;
    } catch (error: any) {
      // Some tools output help to stderr or return non-zero exit
      if (error.stdout || error.stderr) {
        return error.stdout || error.stderr;
      }
      throw error;
    }
  }

  /**
   * Parse ffmpeg - use knowledge-based approach for common operations
   */
  private async parseFFmpeg(baseCommand: string, helpOutput: string): Promise<CLIToolInfo> {
    // Extract version
    const versionMatch = helpOutput.match(/FFmpeg version ([^\s]+)/);
    const version = versionMatch ? versionMatch[1] : undefined;

    // Define common ffmpeg operations that users would search for
    const operations: CLIOperation[] = [
      {
        name: 'convert',
        description: 'Convert video/audio to different format',
        keywords: ['convert', 'transcode', 'format', 'video', 'audio', 'encode', 'mp4', 'webm', 'avi', 'mkv'],
        commandTemplate: 'ffmpeg -i {input} {output}',
        examples: [
          'ffmpeg -i input.mp4 output.webm',
          'ffmpeg -i video.avi -c:v libx264 output.mp4'
        ]
      },
      {
        name: 'extract_audio',
        description: 'Extract audio track from video',
        keywords: ['extract', 'audio', 'sound', 'track', 'mp3', 'aac', 'wav'],
        commandTemplate: 'ffmpeg -i {input} -vn -acodec {codec} {output}',
        examples: [
          'ffmpeg -i video.mp4 -vn -acodec mp3 audio.mp3',
          'ffmpeg -i movie.mkv -vn -acodec copy audio.aac'
        ]
      },
      {
        name: 'compress',
        description: 'Compress/reduce video file size',
        keywords: ['compress', 'reduce', 'size', 'smaller', 'quality', 'crf', 'bitrate'],
        commandTemplate: 'ffmpeg -i {input} -crf {quality} {output}',
        examples: [
          'ffmpeg -i input.mp4 -crf 28 compressed.mp4',
          'ffmpeg -i large.avi -c:v libx264 -crf 23 smaller.mp4'
        ]
      },
      {
        name: 'resize',
        description: 'Resize/scale video dimensions',
        keywords: ['resize', 'scale', 'dimensions', 'width', 'height', 'resolution', '1080p', '720p'],
        commandTemplate: 'ffmpeg -i {input} -vf scale={width}:{height} {output}',
        examples: [
          'ffmpeg -i input.mp4 -vf scale=1280:720 output.mp4',
          'ffmpeg -i video.avi -vf scale=1920:-1 hd.mp4'
        ]
      },
      {
        name: 'cut',
        description: 'Cut/trim video segment',
        keywords: ['cut', 'trim', 'segment', 'clip', 'extract', 'portion', 'time', 'duration'],
        commandTemplate: 'ffmpeg -i {input} -ss {start} -t {duration} {output}',
        examples: [
          'ffmpeg -i video.mp4 -ss 00:00:10 -t 00:00:30 clip.mp4',
          'ffmpeg -i movie.mkv -ss 5 -to 60 segment.mp4'
        ]
      },
      {
        name: 'merge',
        description: 'Concatenate/merge multiple videos',
        keywords: ['merge', 'concatenate', 'join', 'combine', 'multiple', 'concat'],
        commandTemplate: 'ffmpeg -f concat -safe 0 -i {filelist} -c copy {output}',
        examples: [
          'ffmpeg -f concat -safe 0 -i files.txt -c copy merged.mp4'
        ]
      },
      {
        name: 'extract_frames',
        description: 'Extract frames/images from video',
        keywords: ['extract', 'frames', 'images', 'screenshots', 'thumbnail', 'png', 'jpg'],
        commandTemplate: 'ffmpeg -i {input} -vf fps={fps} {output_pattern}',
        examples: [
          'ffmpeg -i video.mp4 -vf fps=1 frame_%04d.png',
          'ffmpeg -i movie.mkv -ss 00:00:10 -vframes 1 thumbnail.jpg'
        ]
      },
      {
        name: 'add_audio',
        description: 'Add audio track to video',
        keywords: ['add', 'audio', 'track', 'overlay', 'music', 'sound', 'background'],
        commandTemplate: 'ffmpeg -i {video} -i {audio} -c:v copy -c:a aac {output}',
        examples: [
          'ffmpeg -i video.mp4 -i audio.mp3 -c:v copy -c:a aac output.mp4'
        ]
      },
      {
        name: 'create_gif',
        description: 'Convert video to animated GIF',
        keywords: ['gif', 'animated', 'animation', 'convert', 'loop'],
        commandTemplate: 'ffmpeg -i {input} -vf "fps={fps},scale={width}:-1:flags=lanczos" {output}',
        examples: [
          'ffmpeg -i video.mp4 -vf "fps=10,scale=320:-1:flags=lanczos" output.gif'
        ]
      },
      {
        name: 'stream_copy',
        description: 'Copy streams without re-encoding (fast)',
        keywords: ['copy', 'fast', 'remux', 'container', 'no encode', 'quick'],
        commandTemplate: 'ffmpeg -i {input} -c copy {output}',
        examples: [
          'ffmpeg -i input.mkv -c copy output.mp4'
        ]
      },
      {
        name: 'get_info',
        description: 'Get video/audio file information',
        keywords: ['info', 'metadata', 'properties', 'details', 'duration', 'codec', 'bitrate'],
        commandTemplate: 'ffmpeg -i {input}',
        examples: [
          'ffmpeg -i video.mp4 2>&1 | grep "Duration"',
          'ffprobe -v quiet -print_format json -show_format -show_streams {input}'
        ]
      },
      {
        name: 'change_codec',
        description: 'Change video/audio codec',
        keywords: ['codec', 'encoder', 'h264', 'h265', 'vp9', 'av1', 'aac', 'opus'],
        commandTemplate: 'ffmpeg -i {input} -c:v {video_codec} -c:a {audio_codec} {output}',
        examples: [
          'ffmpeg -i input.mp4 -c:v libx265 -c:a aac output.mp4',
          'ffmpeg -i video.avi -c:v libvpx-vp9 -c:a libopus output.webm'
        ]
      },
      {
        name: 'adjust_volume',
        description: 'Adjust audio volume level',
        keywords: ['volume', 'audio', 'loud', 'quiet', 'amplify', 'gain', 'normalize'],
        commandTemplate: 'ffmpeg -i {input} -af "volume={level}" {output}',
        examples: [
          'ffmpeg -i input.mp4 -af "volume=2.0" louder.mp4',
          'ffmpeg -i quiet.mp4 -af "volume=0.5" quieter.mp4'
        ]
      },
      {
        name: 'rotate',
        description: 'Rotate video orientation',
        keywords: ['rotate', 'orientation', 'flip', 'transpose', '90', '180', '270'],
        commandTemplate: 'ffmpeg -i {input} -vf "transpose={direction}" {output}',
        examples: [
          'ffmpeg -i input.mp4 -vf "transpose=1" rotated_90.mp4',
          'ffmpeg -i video.mp4 -vf "transpose=2" rotated_180.mp4'
        ]
      },
      {
        name: 'add_subtitles',
        description: 'Add subtitles to video',
        keywords: ['subtitles', 'srt', 'captions', 'text', 'overlay', 'burn'],
        commandTemplate: 'ffmpeg -i {input} -vf "subtitles={subtitle_file}" {output}',
        examples: [
          'ffmpeg -i video.mp4 -vf "subtitles=subs.srt" output.mp4'
        ]
      },
      {
        name: 'watermark',
        description: 'Add watermark/logo to video',
        keywords: ['watermark', 'logo', 'overlay', 'image', 'brand'],
        commandTemplate: 'ffmpeg -i {input} -i {watermark} -filter_complex "overlay={x}:{y}" {output}',
        examples: [
          'ffmpeg -i video.mp4 -i logo.png -filter_complex "overlay=10:10" watermarked.mp4'
        ]
      }
    ];

    return {
      baseCommand,
      version,
      description: 'A complete, cross-platform solution to record, convert and stream audio and video',
      operations
    };
  }

  /**
   * Parse generic CLI tool - basic extraction from help text
   */
  private async parseGeneric(baseCommand: string, helpOutput: string): Promise<CLIToolInfo> {
    // For generic tools, create a single "run" operation
    // that allows AI to execute the tool with arbitrary parameters

    // Extract description from first few lines
    const lines = helpOutput.split('\n').filter(l => l.trim());
    const description = lines.slice(0, 3).join(' ').trim().substring(0, 200);

    const operations: CLIOperation[] = [
      {
        name: 'run',
        description: `Execute ${baseCommand} command`,
        keywords: [baseCommand, 'execute', 'run', 'command'],
        commandTemplate: `${baseCommand} {args}`,
        examples: [
          `${baseCommand} --help`
        ]
      }
    ];

    return {
      baseCommand,
      description,
      operations
    };
  }

  /**
   * Check if CLI tool is available
   */
  async isCliAvailable(command: string): Promise<boolean> {
    try {
      await execAsync(`which ${command} || where ${command}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get CLI tool version if available
   */
  async getVersion(command: string): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync(`${command} --version 2>&1 || ${command} -v 2>&1`, {
        timeout: 5000
      });
      const firstLine = stdout.split('\n')[0];
      return firstLine.trim();
    } catch {
      return undefined;
    }
  }
}
