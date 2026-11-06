import './style.css';
import { Application } from './app/Application';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root is missing.');
const scene = new URLSearchParams(location.search).get('scene');
const app = scene === 'coastal-assembly'
  ? new (await import('./app/CoastalApplication')).CoastalApplication(root)
  : scene === 'cottage-ab'
  ? new (await import('./app/CottageComparisonApplication')).CottageComparisonApplication(root)
  : scene === 'cottage-calibration'
  ? new (await import('./app/CottageCalibrationApplication')).CottageCalibrationApplication(root)
  : scene === 'cottage-candidate-01'
  ? new (await import('./app/CottageApplication')).CottageApplication(root)
  : scene === 'tripo-rock'
  ? new (await import('./app/TripoApplication')).TripoApplication(root)
  : new Application(root);

if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) app.dispose();
});
