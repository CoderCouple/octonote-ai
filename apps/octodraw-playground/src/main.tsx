import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/patrick-hand';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerPdfFonts } from '@octonote/octodraw';
import { App } from './App';
import { Compare } from './Compare';
import './styles.css';

// PDF exports embed these TrueType copies of the UI fonts (jsPDF can't embed the WOFF2 web fonts).
registerPdfFonts([
  ...([
    [400, 'Regular'],
    [500, 'Medium'],
    [600, 'SemiBold'],
    [700, 'Bold'],
  ] as const).map(([weight, name]) => ({ family: 'Inter Variable', weight, url: `/fonts/Inter-${name}.ttf` })),
  { family: 'JetBrains Mono Variable', weight: 400, url: '/fonts/JetBrainsMono-Regular.ttf' },
  // typeface rough: one weight, used for every weight so headings don't fall back to Helvetica.
  ...[400, 500, 600, 700].map((weight) => ({ family: 'Patrick Hand', weight, url: '/fonts/PatrickHand-Regular.ttf' })),
]);

const isCompare = new URLSearchParams(location.search).has('compare');

createRoot(document.getElementById('root')!).render(<StrictMode>{isCompare ? <Compare /> : <App />}</StrictMode>);
