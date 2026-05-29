import './lib/highchartsInit';
import './index.css';
import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// Throwaway design-prototype routes (/optiona /optionb /optionc). Lazy-loaded so
// the proto code never lands in the main app bundle. See src/proto/.
const OptionA = lazy(() => import('./proto/OptionA').then((m) => ({ default: m.OptionA })));
const OptionB = lazy(() => import('./proto/OptionB').then((m) => ({ default: m.OptionB })));
const OptionC = lazy(() => import('./proto/OptionC').then((m) => ({ default: m.OptionC })));

function Root() {
  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  if (path === '/optiona') return <Suspense fallback={null}><OptionA /></Suspense>;
  if (path === '/optionb') return <Suspense fallback={null}><OptionB /></Suspense>;
  if (path === '/optionc') return <Suspense fallback={null}><OptionC /></Suspense>;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
