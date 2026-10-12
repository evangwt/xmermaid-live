import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GALLERY_SUBSET } from '../scripts/readme-gallery.mjs';

// The READMEs caption the gallery with an explicit list of families, and the
// capture script composes the image from the same list. Nothing else ties the
// two together, so without this test the image can stop matching its caption —
// which is exactly how the previous hand-assembled gallery drifted.
function galleryCaption(readme: string): string {
  const match = /!\[([^\]]*)\]\([^)]*diagram-gallery\.png\)/.exec(readme);
  if (!match) throw new Error('the gallery image is missing from the README');
  return match[1]!;
}

function captionFamilies(caption: string): string[] {
  const list = caption.split(/[:：]/).pop() ?? '';
  return list
    .replace(/\s+(?:and|与)\s+/g, ',')
    .split(/[,、]/)
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);
}

describe('README gallery', () => {
  const readmes: Array<[string, string]> = [
    ['README.md', 'twelve'],
    ['README.zh-CN.md', '十二'],
  ];

  for (const [file, countWord] of readmes) {
    it(`${file} names exactly the families the compositor renders`, () => {
      const caption = galleryCaption(readFileSync(file, 'utf8'));

      expect(captionFamilies(caption)).toEqual(GALLERY_SUBSET);
      expect(caption).toContain(countWord);
    });
  }

  it('renders a subset of the examples, not a list of its own', () => {
    expect(new Set(GALLERY_SUBSET).size).toBe(GALLERY_SUBSET.length);
  });
});
