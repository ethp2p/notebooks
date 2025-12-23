import { parse } from 'node-html-parser';
import fs from 'node:fs';
import path from 'node:path';

export interface Heading {
  id: string;
  text: string;
  level: number;
}

/**
 * Extracts h2 and h3 headings from notebook HTML at build time.
 * Uses a proper HTML parser for safety.
 */
export function extractHeadings(htmlPath: string): Heading[] {
  const fullPath = path.join(process.cwd(), 'rendered', htmlPath);

  if (!fs.existsSync(fullPath)) {
    return [];
  }

  try {
    const html = fs.readFileSync(fullPath, 'utf-8');
    const root = parse(html);
    const headings: Heading[] = [];

    // Only select h2 and h3 elements with id attributes
    const headingElements = root.querySelectorAll('h2[id], h3[id]');

    for (const el of headingElements) {
      const id = el.getAttribute('id');
      if (!id) continue;

      // Get text content, stripping anchor links and pilcrow
      let text = el.textContent || '';
      text = text.replace(/¶/g, '').trim();

      // Skip empty headings
      if (!text) continue;

      const level = el.tagName.toLowerCase() === 'h2' ? 2 : 3;
      headings.push({ id, text, level });
    }

    return headings;
  } catch (error) {
    console.error(`Error extracting headings from ${htmlPath}:`, error);
    return [];
  }
}
