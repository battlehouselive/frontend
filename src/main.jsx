import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import legacyDocument from '../app/index.html?raw';

function LegacyApp() {
  const host = useRef(null);

  useEffect(() => {
    const parsed = new DOMParser().parseFromString(legacyDocument, 'text/html');
    parsed.querySelectorAll('style').forEach((style) => {
      const node = document.createElement('style');
      node.dataset.battlehouseLegacy = 'true';
      node.textContent = style.textContent;
      document.head.appendChild(node);
    });

    const fragment = document.createDocumentFragment();
    [...parsed.body.childNodes].forEach((node) => fragment.appendChild(document.importNode(node, true)));
    host.current.appendChild(fragment);

    const scripts = [...parsed.querySelectorAll('script')];
    scripts.forEach((script) => {
      if (!script.textContent.trim()) return;
      // The source app is intentionally executed unchanged so its approved UI,
      // storage model, deep links, and inline event handlers remain identical.
      (0, eval)(script.textContent);
    });
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // The original mobile-first layout has fixed/nested scroll regions. Some
    // desktop webviews expose the scrollbar but do not route mouse-wheel input
    // into those regions, so forward wheel movement explicitly.
    const onWheel = (event) => {
      if (event.deltaY === 0) return;
      const gate = document.getElementById('gate');
      const appBody = document.getElementById('scroller');
      const active = gate && gate.style.display !== 'none' ? gate : appBody;
      if (!active) return;
      const canScroll = active.scrollHeight > active.clientHeight;
      if (canScroll) {
        active.scrollTop += event.deltaY;
        event.preventDefault();
      } else if (active === appBody) {
        window.scrollBy(0, event.deltaY);
      }
    };
    document.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      document.removeEventListener('wheel', onWheel);
      document.querySelectorAll('[data-battlehouse-legacy="true"]').forEach((node) => node.remove());
      host.current?.replaceChildren();
    };
  }, []);

  return <div ref={host} />;
}

createRoot(document.getElementById('root')).render(<LegacyApp />);
