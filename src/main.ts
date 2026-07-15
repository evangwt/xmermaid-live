import './styles.css';
import { mountApp } from './app';
import { SAMPLE_DOCUMENT } from './sample';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app root.');
mountApp(root, { initialText: SAMPLE_DOCUMENT });
