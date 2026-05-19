import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { ensureServiceWorkerForPush } from './lib/devicePush.js';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed', error);
    });
  });
}

// Keep the service worker alive for push notifications in dev and prod.
// In prod the SW is registered above; this ensures it is re-activated after
// a browser restart so push events are received without re-visiting Profile.
window.addEventListener('load', () => { ensureServiceWorkerForPush(); });

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
