import './style.css';
import { Application } from './app/Application';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root is missing.');
const app = new Application(root);

if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) app.dispose();
});
