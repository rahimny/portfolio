import { useEffect } from 'react';

const SITE_TITLE = 'Rahim Neal Yakoob';

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`
  );
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Per-route document title and description, so a study's browser tab, its
 * bookmark and any share sheet that reads the live DOM name the study
 * rather than the site. This only helps clients that execute JS — a crawler
 * that scrapes raw HTML (most link-preview bots) still sees index.html's
 * static tags, since the site has no prerender/SSR step. Fixing that is a
 * separate, larger change.
 */
export function useDocumentMeta(title: string, description: string): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} · ${SITE_TITLE}`;
    upsertMeta('name', 'description', description);
    upsertMeta('property', 'og:title', document.title);
    upsertMeta('property', 'og:description', description);

    return () => {
      document.title = previousTitle;
    };
  }, [title, description]);
}
