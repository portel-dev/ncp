/**
 * Curated Catalog of Useful CLI Tools
 *
 * Organized by category with descriptions and capabilities.
 * When CLI discovery runs, it checks which of these tools exist on the system.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  capabilities: string[];
  packageManagers?: {
    brew?: string;
    apt?: string;
    npm?: string;
    pip?: string;
    cargo?: string;
  };
}

/**
 * Comprehensive catalog of useful CLI tools
 */
export const CLI_TOOL_CATALOG: ToolDefinition[] = [
  // ===== Media & Graphics =====
  {
    name: 'ffmpeg',
    description: 'Convert, record, and stream audio and video',
    category: 'media',
    capabilities: ['video', 'audio', 'convert', 'encode', 'stream', 'media'],
    packageManagers: { brew: 'ffmpeg', apt: 'ffmpeg' }
  },
  {
    name: 'imagemagick',
    description: 'Create, edit, compose, or convert images',
    category: 'media',
    capabilities: ['image', 'convert', 'resize', 'edit', 'graphics'],
    packageManagers: { brew: 'imagemagick', apt: 'imagemagick' }
  },
  {
    name: 'convert',
    description: 'ImageMagick convert utility',
    category: 'media',
    capabilities: ['image', 'convert', 'resize', 'format'],
    packageManagers: { brew: 'imagemagick', apt: 'imagemagick' }
  },
  {
    name: 'gifsicle',
    description: 'Create, edit, and optimize GIF images',
    category: 'media',
    capabilities: ['gif', 'image', 'optimize', 'animation'],
    packageManagers: { brew: 'gifsicle', apt: 'gifsicle' }
  },

  // ===== Version Control =====
  {
    name: 'git',
    description: 'Distributed version control system',
    category: 'vcs',
    capabilities: ['git', 'version', 'control', 'repository', 'commit'],
    packageManagers: { brew: 'git', apt: 'git' }
  },
  {
    name: 'gh',
    description: 'GitHub CLI tool',
    category: 'vcs',
    capabilities: ['github', 'git', 'pr', 'issue', 'repo'],
    packageManagers: { brew: 'gh', apt: 'gh' }
  },
  {
    name: 'svn',
    description: 'Subversion version control',
    category: 'vcs',
    capabilities: ['svn', 'version', 'control', 'repository'],
    packageManagers: { brew: 'subversion', apt: 'subversion' }
  },
  {
    name: 'hg',
    description: 'Mercurial version control',
    category: 'vcs',
    capabilities: ['mercurial', 'version', 'control', 'repository'],
    packageManagers: { brew: 'mercurial', apt: 'mercurial' }
  },

  // ===== Data & Text Processing =====
  {
    name: 'jq',
    description: 'Command-line JSON processor',
    category: 'data',
    capabilities: ['json', 'parse', 'query', 'filter', 'transform'],
    packageManagers: { brew: 'jq', apt: 'jq' }
  },
  {
    name: 'yq',
    description: 'Command-line YAML/XML/JSON processor',
    category: 'data',
    capabilities: ['yaml', 'xml', 'json', 'parse', 'query'],
    packageManagers: { brew: 'yq', apt: 'yq', pip: 'yq' }
  },
  {
    name: 'xmllint',
    description: 'XML parser and validator',
    category: 'data',
    capabilities: ['xml', 'parse', 'validate', 'format'],
    packageManagers: { brew: 'libxml2', apt: 'libxml2-utils' }
  },
  {
    name: 'pandoc',
    description: 'Universal document converter',
    category: 'data',
    capabilities: ['convert', 'markdown', 'html', 'pdf', 'document'],
    packageManagers: { brew: 'pandoc', apt: 'pandoc' }
  },
  {
    name: 'csvkit',
    description: 'Suite of utilities for working with CSV',
    category: 'data',
    capabilities: ['csv', 'parse', 'convert', 'analyze'],
    packageManagers: { pip: 'csvkit' }
  },

  // ===== Network & HTTP =====
  {
    name: 'curl',
    description: 'Transfer data with URLs',
    category: 'network',
    capabilities: ['http', 'download', 'upload', 'api', 'request'],
    packageManagers: { brew: 'curl', apt: 'curl' }
  },
  {
    name: 'wget',
    description: 'Network downloader',
    category: 'network',
    capabilities: ['download', 'http', 'ftp', 'fetch'],
    packageManagers: { brew: 'wget', apt: 'wget' }
  },
  {
    name: 'httpie',
    description: 'User-friendly HTTP client',
    category: 'network',
    capabilities: ['http', 'api', 'request', 'rest'],
    packageManagers: { brew: 'httpie', apt: 'httpie', pip: 'httpie' }
  },
  {
    name: 'nmap',
    description: 'Network exploration and security scanner',
    category: 'network',
    capabilities: ['network', 'scan', 'security', 'port'],
    packageManagers: { brew: 'nmap', apt: 'nmap' }
  },
  {
    name: 'netcat',
    description: 'Read and write data across networks',
    category: 'network',
    capabilities: ['network', 'tcp', 'udp', 'port'],
    packageManagers: { brew: 'netcat', apt: 'netcat' }
  },

  // ===== Development Tools =====
  {
    name: 'docker',
    description: 'Container platform',
    category: 'development',
    capabilities: ['container', 'docker', 'build', 'deploy'],
    packageManagers: { brew: 'docker' }
  },
  {
    name: 'kubectl',
    description: 'Kubernetes command-line tool',
    category: 'development',
    capabilities: ['kubernetes', 'k8s', 'container', 'deploy'],
    packageManagers: { brew: 'kubectl' }
  },
  {
    name: 'npm',
    description: 'Node.js package manager',
    category: 'development',
    capabilities: ['nodejs', 'javascript', 'package', 'install'],
    packageManagers: { brew: 'node' }
  },
  {
    name: 'yarn',
    description: 'Fast JavaScript package manager',
    category: 'development',
    capabilities: ['nodejs', 'javascript', 'package', 'install'],
    packageManagers: { brew: 'yarn', npm: 'yarn' }
  },
  {
    name: 'pnpm',
    description: 'Fast, disk space efficient package manager',
    category: 'development',
    capabilities: ['nodejs', 'javascript', 'package', 'install'],
    packageManagers: { brew: 'pnpm', npm: 'pnpm' }
  },
  {
    name: 'cargo',
    description: 'Rust package manager',
    category: 'development',
    capabilities: ['rust', 'package', 'build', 'compile'],
    packageManagers: { brew: 'rust' }
  },
  {
    name: 'go',
    description: 'Go programming language compiler',
    category: 'development',
    capabilities: ['golang', 'compile', 'build', 'run'],
    packageManagers: { brew: 'go', apt: 'golang' }
  },
  {
    name: 'python',
    description: 'Python interpreter',
    category: 'development',
    capabilities: ['python', 'script', 'run', 'execute'],
    packageManagers: { brew: 'python', apt: 'python3' }
  },
  {
    name: 'pip',
    description: 'Python package installer',
    category: 'development',
    capabilities: ['python', 'package', 'install'],
    packageManagers: { brew: 'python', apt: 'python3-pip' }
  },
  {
    name: 'node',
    description: 'Node.js JavaScript runtime',
    category: 'development',
    capabilities: ['nodejs', 'javascript', 'runtime', 'execute'],
    packageManagers: { brew: 'node', apt: 'nodejs' }
  },
  {
    name: 'make',
    description: 'Build automation tool',
    category: 'development',
    capabilities: ['build', 'compile', 'make', 'automation'],
    packageManagers: { brew: 'make', apt: 'build-essential' }
  },

  // ===== Archives & Compression =====
  {
    name: 'tar',
    description: 'Archive utility',
    category: 'archive',
    capabilities: ['archive', 'compress', 'extract', 'tar'],
    packageManagers: { brew: 'gnu-tar', apt: 'tar' }
  },
  {
    name: 'zip',
    description: 'Package and compress files',
    category: 'archive',
    capabilities: ['zip', 'compress', 'archive'],
    packageManagers: { brew: 'zip', apt: 'zip' }
  },
  {
    name: 'unzip',
    description: 'Extract compressed files',
    category: 'archive',
    capabilities: ['unzip', 'extract', 'decompress'],
    packageManagers: { brew: 'unzip', apt: 'unzip' }
  },
  {
    name: '7z',
    description: '7-Zip file archiver',
    category: 'archive',
    capabilities: ['archive', 'compress', 'extract', '7z'],
    packageManagers: { brew: 'p7zip', apt: 'p7zip-full' }
  },
  {
    name: 'gzip',
    description: 'GNU zip compression',
    category: 'archive',
    capabilities: ['compress', 'gzip', 'decompress'],
    packageManagers: { brew: 'gzip', apt: 'gzip' }
  },

  // ===== Cloud & Infrastructure =====
  {
    name: 'aws',
    description: 'AWS command-line interface',
    category: 'cloud',
    capabilities: ['aws', 'cloud', 'amazon', 's3', 'ec2'],
    packageManagers: { brew: 'awscli', pip: 'awscli' }
  },
  {
    name: 'gcloud',
    description: 'Google Cloud SDK',
    category: 'cloud',
    capabilities: ['gcp', 'google', 'cloud'],
    packageManagers: { brew: 'google-cloud-sdk' }
  },
  {
    name: 'az',
    description: 'Azure command-line interface',
    category: 'cloud',
    capabilities: ['azure', 'microsoft', 'cloud'],
    packageManagers: { brew: 'azure-cli' }
  },
  {
    name: 'terraform',
    description: 'Infrastructure as code tool',
    category: 'cloud',
    capabilities: ['infrastructure', 'terraform', 'cloud', 'provision'],
    packageManagers: { brew: 'terraform' }
  },
  {
    name: 'ansible',
    description: 'IT automation tool',
    category: 'cloud',
    capabilities: ['automation', 'deploy', 'configuration'],
    packageManagers: { brew: 'ansible', pip: 'ansible' }
  },

  // ===== Database =====
  {
    name: 'mysql',
    description: 'MySQL client',
    category: 'database',
    capabilities: ['mysql', 'database', 'sql', 'query'],
    packageManagers: { brew: 'mysql-client', apt: 'mysql-client' }
  },
  {
    name: 'psql',
    description: 'PostgreSQL client',
    category: 'database',
    capabilities: ['postgresql', 'database', 'sql', 'query'],
    packageManagers: { brew: 'postgresql', apt: 'postgresql-client' }
  },
  {
    name: 'redis-cli',
    description: 'Redis client',
    category: 'database',
    capabilities: ['redis', 'cache', 'database'],
    packageManagers: { brew: 'redis', apt: 'redis-tools' }
  },
  {
    name: 'mongosh',
    description: 'MongoDB shell',
    category: 'database',
    capabilities: ['mongodb', 'database', 'nosql'],
    packageManagers: { brew: 'mongosh' }
  },

  // ===== Security & Encryption =====
  {
    name: 'openssl',
    description: 'SSL/TLS toolkit',
    category: 'security',
    capabilities: ['ssl', 'encrypt', 'decrypt', 'certificate'],
    packageManagers: { brew: 'openssl', apt: 'openssl' }
  },
  {
    name: 'gpg',
    description: 'GNU Privacy Guard',
    category: 'security',
    capabilities: ['encrypt', 'decrypt', 'sign', 'pgp'],
    packageManagers: { brew: 'gnupg', apt: 'gnupg' }
  },
  {
    name: 'ssh-keygen',
    description: 'Generate SSH authentication keys',
    category: 'security',
    capabilities: ['ssh', 'key', 'generate', 'authentication'],
    packageManagers: { brew: 'openssh', apt: 'openssh-client' }
  },

  // ===== System Utilities =====
  {
    name: 'rsync',
    description: 'Fast file transfer tool',
    category: 'utilities',
    capabilities: ['sync', 'copy', 'backup', 'transfer'],
    packageManagers: { brew: 'rsync', apt: 'rsync' }
  },
  {
    name: 'htop',
    description: 'Interactive process viewer',
    category: 'utilities',
    capabilities: ['monitor', 'process', 'system', 'performance'],
    packageManagers: { brew: 'htop', apt: 'htop' }
  },
  {
    name: 'watch',
    description: 'Execute a program periodically',
    category: 'utilities',
    capabilities: ['monitor', 'repeat', 'watch'],
    packageManagers: { brew: 'watch', apt: 'procps' }
  },
  {
    name: 'tmux',
    description: 'Terminal multiplexer',
    category: 'utilities',
    capabilities: ['terminal', 'session', 'multiplex'],
    packageManagers: { brew: 'tmux', apt: 'tmux' }
  },
  {
    name: 'screen',
    description: 'Terminal multiplexer',
    category: 'utilities',
    capabilities: ['terminal', 'session', 'multiplex'],
    packageManagers: { brew: 'screen', apt: 'screen' }
  },

  // ===== Search & Find =====
  {
    name: 'rg',
    description: 'Ripgrep - fast search tool',
    category: 'search',
    capabilities: ['search', 'grep', 'find', 'text'],
    packageManagers: { brew: 'ripgrep', apt: 'ripgrep', cargo: 'ripgrep' }
  },
  {
    name: 'ag',
    description: 'The Silver Searcher',
    category: 'search',
    capabilities: ['search', 'grep', 'find', 'text'],
    packageManagers: { brew: 'the_silver_searcher', apt: 'silversearcher-ag' }
  },
  {
    name: 'fd',
    description: 'Fast alternative to find',
    category: 'search',
    capabilities: ['find', 'search', 'file'],
    packageManagers: { brew: 'fd', apt: 'fd-find', cargo: 'fd-find' }
  },
  {
    name: 'fzf',
    description: 'Fuzzy finder',
    category: 'search',
    capabilities: ['fuzzy', 'search', 'find', 'filter'],
    packageManagers: { brew: 'fzf', apt: 'fzf' }
  },

  // ===== Package Managers =====
  {
    name: 'brew',
    description: 'Homebrew package manager',
    category: 'package-manager',
    capabilities: ['install', 'package', 'homebrew', 'macos'],
    packageManagers: { brew: 'brew' }
  },
  {
    name: 'apt',
    description: 'Advanced Package Tool',
    category: 'package-manager',
    capabilities: ['install', 'package', 'debian', 'ubuntu'],
    packageManagers: { apt: 'apt' }
  },
  {
    name: 'yum',
    description: 'Yellowdog Updater Modified',
    category: 'package-manager',
    capabilities: ['install', 'package', 'redhat', 'centos'],
    packageManagers: {}
  },
  {
    name: 'gem',
    description: 'RubyGems package manager',
    category: 'package-manager',
    capabilities: ['ruby', 'package', 'install'],
    packageManagers: { brew: 'ruby' }
  },
];
