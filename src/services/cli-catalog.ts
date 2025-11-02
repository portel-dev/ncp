/**
 * CLI Tool Catalog
 * Maintains knowledge of popular CLI tools and their capabilities
 * Provides installation suggestions when relevant tools aren't installed
 */

export interface CLIToolInfo {
  name: string;
  description: string;
  capabilities: string[];  // Keywords for matching
  installCommands: {
    darwin: string;   // macOS
    linux: string;    // Linux
    win32: string;    // Windows
  };
  homepage?: string;
  category: string;
}

/**
 * Catalog of popular CLI tools
 * This is just metadata - no tools are installed or indexed by default
 */
export const CLI_TOOL_CATALOG: Record<string, CLIToolInfo> = {
  ffmpeg: {
    name: 'ffmpeg',
    description: 'Complete solution to record, convert and stream audio and video',
    capabilities: [
      'convert video', 'convert audio', 'video conversion', 'audio conversion',
      'extract audio', 'compress video', 'resize video', 'trim video', 'cut video',
      'merge video', 'concatenate video', 'video format', 'audio format',
      'mp4', 'webm', 'avi', 'mkv', 'mp3', 'aac', 'wav',
      'video codec', 'audio codec', 'h264', 'h265', 'vp9',
      'video frames', 'extract frames', 'screenshots from video',
      'add audio', 'remove audio', 'adjust volume', 'audio level',
      'rotate video', 'flip video', 'video orientation',
      'add subtitles', 'burn subtitles', 'watermark video',
      'gif from video', 'animated gif', 'video to gif'
    ],
    installCommands: {
      darwin: 'brew install ffmpeg',
      linux: 'sudo apt install ffmpeg',
      win32: 'winget install ffmpeg'
    },
    homepage: 'https://ffmpeg.org',
    category: 'media'
  },

  imagemagick: {
    name: 'imagemagick',
    description: 'Create, edit, compose, or convert digital images',
    capabilities: [
      'convert image', 'resize image', 'crop image', 'rotate image',
      'image format', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
      'image compression', 'optimize image', 'image quality',
      'add watermark', 'image watermark', 'text on image',
      'combine images', 'merge images', 'image montage',
      'image effects', 'blur image', 'sharpen image',
      'convert pdf to image', 'image to pdf'
    ],
    installCommands: {
      darwin: 'brew install imagemagick',
      linux: 'sudo apt install imagemagick',
      win32: 'winget install ImageMagick.ImageMagick'
    },
    homepage: 'https://imagemagick.org',
    category: 'media'
  },

  youtube_dl: {
    name: 'yt-dlp',
    description: 'Download videos from YouTube and other sites',
    capabilities: [
      'download video', 'download youtube', 'youtube video',
      'download audio', 'extract audio from video',
      'video downloader', 'youtube downloader',
      'download playlist', 'download channel'
    ],
    installCommands: {
      darwin: 'brew install yt-dlp',
      linux: 'sudo apt install yt-dlp',
      win32: 'winget install yt-dlp.yt-dlp'
    },
    homepage: 'https://github.com/yt-dlp/yt-dlp',
    category: 'media'
  },

  pandoc: {
    name: 'pandoc',
    description: 'Universal document converter',
    capabilities: [
      'convert document', 'document conversion',
      'markdown to pdf', 'pdf to markdown',
      'markdown to html', 'html to markdown',
      'markdown to docx', 'docx to markdown',
      'convert markdown', 'convert pdf', 'convert html',
      'document format', 'file format conversion'
    ],
    installCommands: {
      darwin: 'brew install pandoc',
      linux: 'sudo apt install pandoc',
      win32: 'winget install JohnMacFarlane.Pandoc'
    },
    homepage: 'https://pandoc.org',
    category: 'documents'
  },

  jq: {
    name: 'jq',
    description: 'Command-line JSON processor',
    capabilities: [
      'parse json', 'json query', 'json filter',
      'json transformation', 'json pretty print',
      'extract json', 'json data', 'process json'
    ],
    installCommands: {
      darwin: 'brew install jq',
      linux: 'sudo apt install jq',
      win32: 'winget install jqlang.jq'
    },
    homepage: 'https://jqlang.github.io/jq/',
    category: 'data'
  },

  ripgrep: {
    name: 'rg',
    description: 'Ultra-fast text search tool',
    capabilities: [
      'search text', 'find text', 'grep', 'search files',
      'code search', 'search codebase', 'fast search'
    ],
    installCommands: {
      darwin: 'brew install ripgrep',
      linux: 'sudo apt install ripgrep',
      win32: 'winget install BurntSushi.ripgrep.MSVC'
    },
    homepage: 'https://github.com/BurntSushi/ripgrep',
    category: 'search'
  },

  curl: {
    name: 'curl',
    description: 'Transfer data with URLs',
    capabilities: [
      'http request', 'download file', 'api request',
      'get url', 'post request', 'web request',
      'fetch url', 'http client', 'rest api'
    ],
    installCommands: {
      darwin: 'brew install curl',
      linux: 'sudo apt install curl',
      win32: 'winget install cURL.cURL'
    },
    homepage: 'https://curl.se',
    category: 'network'
  },

  git: {
    name: 'git',
    description: 'Distributed version control system',
    capabilities: [
      'version control', 'git repository', 'commit changes',
      'clone repository', 'pull changes', 'push changes',
      'git branch', 'git merge', 'git diff', 'git log'
    ],
    installCommands: {
      darwin: 'brew install git',
      linux: 'sudo apt install git',
      win32: 'winget install Git.Git'
    },
    homepage: 'https://git-scm.com',
    category: 'development'
  }
};

/**
 * Find relevant CLI tools based on a search query
 */
export function suggestCLITools(query: string, limit: number = 3): CLIToolInfo[] {
  const queryLower = query.toLowerCase();
  const matches: Array<{ tool: CLIToolInfo; score: number }> = [];

  for (const tool of Object.values(CLI_TOOL_CATALOG)) {
    let score = 0;

    // Check description
    if (tool.description.toLowerCase().includes(queryLower)) {
      score += 10;
    }

    // Check capabilities (most important)
    for (const capability of tool.capabilities) {
      if (capability.toLowerCase().includes(queryLower) ||
          queryLower.includes(capability.toLowerCase())) {
        score += 5;
      }
    }

    // Check tool name
    if (tool.name.toLowerCase().includes(queryLower)) {
      score += 3;
    }

    if (score > 0) {
      matches.push({ tool, score });
    }
  }

  // Sort by score and return top matches
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(m => m.tool);
}

/**
 * Get installation command for current platform
 */
export function getInstallCommand(toolName: string): string | null {
  const tool = CLI_TOOL_CATALOG[toolName];
  if (!tool) return null;

  const platform = process.platform as 'darwin' | 'linux' | 'win32';
  return tool.installCommands[platform] || tool.installCommands.darwin;
}

/**
 * Get all tools in a category
 */
export function getToolsByCategory(category: string): CLIToolInfo[] {
  return Object.values(CLI_TOOL_CATALOG).filter(t => t.category === category);
}

/**
 * List all available categories
 */
export function getCategories(): string[] {
  const categories = new Set(Object.values(CLI_TOOL_CATALOG).map(t => t.category));
  return Array.from(categories).sort();
}
