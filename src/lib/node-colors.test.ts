import { describe, expect, it } from 'vitest';
import { nodeColorStyle, nodeTone } from './node-colors';

const file = (name: string) => nodeTone({ name, kind: 'file' });
const folder = (name: string) => nodeTone({ name, kind: 'folder' });

describe('node identity colors', () => {
  it('keeps CSS pink, JavaScript yellow, TypeScript blue, including module variants', () => {
    for (const name of ['theme.css', 'theme.scss', 'THEME.LESS']) expect(file(name)).toBe('pink');
    for (const name of ['index.js', 'index.jsx', 'index.mjs', 'index.cjs']) expect(file(name)).toBe('yellow');
    for (const name of ['index.ts', 'index.tsx', 'index.mts', 'index.cts', 'types.d.ts']) expect(file(name)).toBe('blue');
  });

  it('prefers well-known file names over generic extensions', () => {
    expect(file('package.json')).toBe('red');
    expect(file('package-lock.json')).toBe('red');
    expect(file('settings.json')).toBe('yellow');
    expect(file('TSCONFIG.JSON')).toBe('blue');
    expect(file('tsconfig.app.json')).toBe('blue');
    expect(file('Cargo.lock')).toBe('orange');
    expect(file('unknown.lock')).toBe('slate');
    expect(file('.env.local')).toBe('green');
    expect(file('Dockerfile.prod')).toBe('cyan');
  });

  it('uses folder names independently from file suffixes', () => {
    expect(folder('SRC')).toBe('green');
    expect(folder('dist')).toBe('yellow');
    expect(folder('components')).toBe('cyan');
    expect(folder('.github')).toBe('slate');
    expect(folder('theme.css')).toBe('neutral');
    expect(file('src')).toBe('neutral');
  });

  it('handles compact assets, dotfiles, and unrecognized names without borrowing parent colors', () => {
    expect(file('photo.PNG')).toBe('purple');
    expect(file('demo.webm')).toBe('pink');
    expect(file('.gitignore')).toBe('orange');
    for (const name of ['unknown.custom', 'no-extension', 'png']) expect(file(name)).toBe('neutral');
    const neutralStyle = nodeColorStyle('neutral');
    expect(neutralStyle['--node-color-dark']).toBeTruthy();
    expect(neutralStyle['--node-color-light']).toBeTruthy();
    expect(neutralStyle).not.toEqual(nodeColorStyle('green'));
  });
});
