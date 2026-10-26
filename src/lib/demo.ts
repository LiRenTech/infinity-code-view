import type { ProjectEntry, ProjectSnapshot } from './model';

const file = (id: string, content: string | null, language: string | null = 'typescript'): ProjectEntry => ({ id, parentId: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '', name: id.split('/').pop()!, kind: 'file', content, language, notice: null });
const folder = (id: string): ProjectEntry => ({ ...file(id, null, null), parentId: id === '' ? null : id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '', kind: 'folder', name: id === '' ? 'my-little-project' : id.split('/').pop()! });
export const demo: ProjectSnapshot = {
  rootPath: 'demo://infinity-code-view', warnings: [], entries: [
    folder(''), folder('src'), folder('src/core'), folder('src/components'), folder('public'),
    file('src/core/camera.ts', `export interface Camera {
  x: number;
  y: number;
  scale: number;
}

// 世界坐标与屏幕坐标各自独立。
export function screenToWorld(
  camera: Camera,
  point: { x: number; y: number },
) {
  return {
    x: (point.x - camera.x) / camera.scale,
    y: (point.y - camera.y) / camera.scale,
  };
}

export const initialCamera: Camera = {
  x: 64,
  y: 64,
  scale: 1,
};`),
    file('src/core/project.ts', `export interface ProjectFile {
  path: string;
  content: string;
}

// 刷新内容时，保留你记住的位置。
export function reconcileProject(
  files: ProjectFile[],
  positions: Map<string, { x: number; y: number }>,
) {
  return files.map(file => ({
    ...file,
    position: positions.get(file.path),
  }));
}`),
    file('src/components/FileCard.tsx', `type FileCardProps = {
  name: string;
  content: string;
};

export function FileCard({
  name,
  content,
}: FileCardProps) {
  return (
    <article className="file-card">
      <header>{name}</header>
      <pre><code>{content}</code></pre>
    </article>
  );
}`),
    file('src/components/theme.css', `:root {
  --canvas: #11171c;
  --surface: #1b232b;
  --accent: #91cbb1;
}

.file-card {
  border-radius: 8px;
  background: var(--surface);
  color: var(--accent);
}`, 'css'),
    file('src/main.tsx', `import { createRoot } from 'react-dom/client';
import { FileCard } from './components/FileCard';

const root = document.getElementById('root');

if (root) {
  createRoot(root).render(
    <FileCard
      name="hello.ts"
      content="const hello = 'world';"
    />,
  );
}`),
    file('public/favicon.svg', null, null),
    file('package.json', `{
  "name": "my-little-project",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build"
  }
}`, 'json'),
    file('README.md', '# A place for your code\n\n在空间中阅读，在变化中保留记忆。\n\n- 滚轮缩放\n- 中键拖动画布\n- 拖动标题调整布局\n- 空白处拖动框选', 'markdown'),
  ],
};
