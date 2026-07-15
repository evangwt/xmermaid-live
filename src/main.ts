import { decodeShareState } from 'xmermaid/editor';
import './styles.css';
import { mountApp } from './app';
import { SAMPLE_DOCUMENT } from './sample';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app root.');

const restored = decodeShareState(window.location.hash);
const selectedNumber = restored?.selectedDiagramId?.match(/^diagram-(\d+)$/)?.[1];
mountApp(root, {
  initialText: restored?.documentText ?? SAMPLE_DOCUMENT,
  initialSelectedIndex: selectedNumber ? Number(selectedNumber) - 1 : 0,
});
