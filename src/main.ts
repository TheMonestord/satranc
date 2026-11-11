import './ui/styles.css';
import { App } from './app';

const host = document.getElementById('app');
if (host) void new App(host).run();
