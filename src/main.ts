import './style.css';
import { Application } from './app/Application';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root is missing.');
const app = new URLSearchParams(location.search).get('scene') === 'tripo-rock'
  ? new (await import('./app/TripoApplication')).TripoApplication(root)
  : new Application(root);

if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) app.dispose();
});
