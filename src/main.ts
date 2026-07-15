import './styles.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app root.');
root.textContent = 'xmermaid live';
