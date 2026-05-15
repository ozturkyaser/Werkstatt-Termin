/**
 * Werkstatt-Termin Widget-Loader
 *
 * Einbindung in WordPress (oder jeder Website):
 *
 *   <div id="werkstatt-termin"></div>
 *   <script src="https://ihre-werkstatt.de/widget/widget.js"
 *           data-key="wk_live_XXXX"
 *           data-api="https://ihre-werkstatt.de/api/public"
 *           data-height="780"></script>
 *
 * Alternativ programmatisch:
 *   WerkstattTermin.mount({ container: '#div', apiKey: '...', apiBase: '...' });
 */
(function (global) {
  'use strict';

  const currentScript = document.currentScript;

  function mount({ container, apiKey, apiBase, height = 780 }) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) { console.error('[Werkstatt-Termin] Container nicht gefunden'); return; }
    if (!apiKey) { console.error('[Werkstatt-Termin] apiKey fehlt'); return; }

    const origin = apiBase
      ? new URL(apiBase, location.href).origin
      : (currentScript ? new URL(currentScript.src).origin : location.origin);
    const embedUrl = new URL('/widget/embed.html', origin);
    embedUrl.searchParams.set('api_key', apiKey);
    if (apiBase) embedUrl.searchParams.set('api', apiBase);

    const iframe = document.createElement('iframe');
    iframe.src = embedUrl.toString();
    iframe.style.cssText = `width:100%;height:${height}px;border:0;display:block;`;
    iframe.setAttribute('title', 'Werkstatt-Termin online buchen');
    iframe.loading = 'lazy';

    el.innerHTML = '';
    el.appendChild(iframe);
    return iframe;
  }

  global.WerkstattTermin = { mount };

  if (currentScript) {
    const key = currentScript.getAttribute('data-key');
    const apiBase = currentScript.getAttribute('data-api') || undefined;
    const height = Number(currentScript.getAttribute('data-height') || 780);
    const containerSel = currentScript.getAttribute('data-container') || '#werkstatt-termin';

    const run = () => {
      const el = document.querySelector(containerSel);
      if (el && key) mount({ container: el, apiKey: key, apiBase, height });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }
})(window);
