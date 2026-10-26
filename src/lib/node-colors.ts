import type { ProjectEntry } from './model';

// Adapted from Material Icon Theme's file/folder associations, with brighter dark
// colors and darker light colors for readable text rather than small icon fills.
const palettes = {
  neutral: { dark: '#cccccc', light: '#354550' },
  blue: { dark: '#68b2f8', light: '#2165ad' },
  cyan: { dark: '#65cce3', light: '#087b93' },
  yellow: { dark: '#e7cf69', light: '#896600' },
  pink: { dark: '#e694c0', light: '#ad3975' },
  purple: { dark: '#b8a0ec', light: '#7951ad' },
  green: { dark: '#97c978', light: '#487a28' },
  teal: { dark: '#73c9b5', light: '#197c69' },
  orange: { dark: '#e9a16e', light: '#aa5823' },
  red: { dark: '#ef9090', light: '#b63c42' },
  slate: { dark: '#a7b7cb', light: '#556e8b' },
} as const;
export type NodeTone = keyof typeof palettes;

type Associations = Partial<Record<NodeTone, readonly string[]>>;
const lookup = (groups: Associations): ReadonlyMap<string, NodeTone> => new Map(
  Object.entries(groups).flatMap(([tone, names]) => names.map(name => [name, tone as NodeTone] as const)),
);

const extensions = lookup({
  blue: ['ts', 'tsx', 'mts', 'cts', 'd.ts', 'd.mts', 'd.cts', 'py', 'pyi', 'ps1', 'sql', 'cpp', 'cc', 'cxx', 'hpp', 'hxx', 'r', 'rmd'],
  yellow: ['js', 'jsx', 'mjs', 'cjs', 'es6', 'esx', 'json', 'jsonc', 'json5', 'jsonl', 'ndjson', 'webmanifest'],
  pink: ['css', 'scss', 'sass', 'less', 'styl', 'stylus', 'graphql', 'gql'],
  orange: ['html', 'htm', 'xhtml', 'xml', 'xsl', 'xslt', 'svg', 'svelte', 'astro', 'rs', 'toml', 'java', 'kt', 'kts', 'swift'],
  green: ['vue', 'sh', 'bash', 'zsh', 'fish', 'env', 'awk', 'diff', 'patch'],
  cyan: ['go', 'mod', 'sum', 'c', 'h', 'cmake', 'dockerfile'],
  purple: ['cs', 'fs', 'fsx', 'php', 'phtml', 'ex', 'exs', 'erl', 'hrl', 'hs', 'lhs', 'lua', 'dart', 'ipynb'],
  teal: ['md', 'mdx', 'markdown', 'rst', 'yml', 'yaml', 'csv', 'tsv', 'xls', 'xlsx'],
  red: ['rb', 'erb', 'rake', 'gemspec', 'pdf'],
  slate: ['txt', 'log', 'ini', 'cfg', 'conf', 'config', 'properties', 'lock', 'map', 'gitignore', 'gitattributes', 'editorconfig'],
});
const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'icns', 'bmp', 'tif', 'tiff', 'heic', 'psd', 'ai'];
const mediaExtensions = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'mp4', 'mov', 'webm', 'avi', 'mkv'];
const specialFiles = lookup({
  blue: ['tsconfig.json', 'jsconfig.json'],
  red: ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'gemfile', 'gemfile.lock'],
  orange: ['cargo.toml', 'cargo.lock', '.gitignore', '.gitattributes', '.gitmodules'],
  cyan: ['dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml', 'go.mod', 'go.sum'],
  green: ['.env', 'makefile', 'gnumakefile'],
  teal: ['license', 'licence', 'license.md', 'license.txt', 'copying', 'changelog', 'changelog.md', 'readme', 'readme.md', 'readme.txt'],
  purple: ['.prettierrc', '.prettierrc.json', '.prettierignore', 'eslint.config.js', 'eslint.config.mjs', '.eslintrc', '.eslintrc.json'],
});
const folders = lookup({
  green: ['src', 'srcs', 'source', 'sources', 'code', 'node', 'nodejs', 'node_modules'],
  yellow: ['dist', 'out', 'output', 'outputs', 'build', 'builds', 'release', 'bin', 'distribution', 'compiled', 'lib', 'libs', 'library', 'libraries', 'js', 'javascript'],
  cyan: ['components', 'component', 'widgets', 'widget', 'fragments', 'utils', 'util', 'utilities', 'helpers', 'helper', 'tools', 'scripts', 'script'],
  blue: ['docs', 'doc', 'documentation', 'wiki', '.vscode', 'types', 'typings', 'interfaces', 'ts', 'typescript'],
  teal: ['test', 'tests', '__tests__', 'testing', 'spec', 'specs', '__snapshots__', 'snapshots', 'e2e', 'public', 'www', 'web', 'i18n', 'locales', 'locale', 'translations', 'languages'],
  purple: ['assets', 'asset', 'resources', 'resource', 'res', 'static', 'images', 'image', 'img', 'icons', 'icon', 'fonts', 'font', 'api', 'routes', 'router', 'services', 'service'],
  pink: ['css', 'sass', 'scss', 'styles', 'style', 'stylesheets', 'themes', 'theme'],
  orange: ['.git', 'android', 'server', 'servers', 'backend', 'database', 'databases', 'db', 'migrations'],
  slate: ['.github', '.gitlab', 'config', 'configs', 'configuration', 'conf', 'cfg', 'settings', 'options', '.idea', '.vscode-test'],
});

export function nodeTone(entry: Pick<ProjectEntry, 'name' | 'kind'>): NodeTone {
  const name = entry.name.toLowerCase();
  if (entry.kind === 'folder') return folders.get(name) ?? 'neutral';
  const special = specialFiles.get(name);
  if (special) return special;
  if (/^tsconfig\..+\.json$/.test(name)) return 'blue';
  if (name.startsWith('.env.') || name.endsWith('.env')) return 'green';
  if (name.startsWith('dockerfile.')) return 'cyan';
  // Try compound suffixes first (e.g. d.ts); do not interpret folder names as extensions.
  for (let dot = name.indexOf('.'); dot !== -1; dot = name.indexOf('.', dot + 1)) {
    const suffix = name.slice(dot + 1);
    const tone = extensions.get(suffix);
    if (tone) return tone;
  }
  if (!name.includes('.')) return 'neutral';
  const suffix = name.slice(name.lastIndexOf('.') + 1);
  if (imageExtensions.includes(suffix)) return 'purple';
  if (mediaExtensions.includes(suffix)) return 'pink';
  return 'neutral';
}

export function nodeColorStyle(tone: NodeTone) {
  // Explicit values on every node prevent a colored parent folder leaking its hue.
  return {
    '--node-color-dark': palettes[tone].dark,
    '--node-color-light': palettes[tone].light,
  };
}
