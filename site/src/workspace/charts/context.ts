import { marked } from 'marked';

export async function renderContext(
  loader: (() => Promise<{ default: string }>) | undefined,
): Promise<string> {
  if (!loader) return '';
  const mod = await loader();
  return marked.parse(mod.default) as string;
}
