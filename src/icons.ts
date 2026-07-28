export type IconName = 'chevron-left' | 'chevron-right' | 'minus' | 'plus' | 'fit' | 'maximize' | 'more' | 'diagram' | 'edit' | 'preview' | 'share' | 'download' | 'palette';

const PATHS: Record<IconName, string> = {
  'chevron-left': '<path d="m14 6-6 6 6 6"/>',
  'chevron-right': '<path d="m10 6 6 6-6 6"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  maximize: '<path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  diagram: '<rect x="4" y="5" width="6" height="5" rx="1"/><rect x="14" y="14" width="6" height="5" rx="1"/><path d="M10 8h4v8"/>',
  edit: '<path d="m4 16 9-9 3 3-9 9-3 1zM12 8l3 3"/>',
  preview: '<path d="M3 12s3-5 9-5 9 5 9 5-3 5-9 5-9-5-9-5z"/><circle cx="12" cy="12" r="2"/>',
  share: '<path d="M15 5h4v4M19 5l-7 7"/><path d="M17 12v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
  download: '<path d="M12 4v10M8 10l4 4 4-4M5 20h14"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4 9 9 0 0 0 0-10z"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16" cy="10" r="1"/>',
};

export function icon(name: IconName): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
}
