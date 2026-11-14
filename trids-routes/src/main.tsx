import { render } from 'preact';
import { App } from './ui/App';
import 'leaflet/dist/leaflet.css';
import './styles.css';

render(<App />, document.getElementById('app')!);
