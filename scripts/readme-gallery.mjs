// The families the README gallery shows, in the order both READMEs list them.
//
// This lives in its own module because two consumers need the same list: the
// capture script composes the image from it, and a test asserts the README
// captions still name exactly these families. Importing the capture script from
// a test would launch a browser and rewrite the output tree, so the list cannot
// live there.
export const GALLERY_SUBSET = [
  'flowchart',
  'sequence',
  'class',
  'er',
  'gantt',
  'pie',
  'mindmap',
  'quadrant',
  'sankey',
  'xychart',
  'treemap',
  'wardley',
];
