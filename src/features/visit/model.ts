export const VISIT_LIMIT = 64;

/** Keep first-visit order; malformed or removed editions never reach the UI. */
export function readVisits(
  raw: string | null,
  valid: ReadonlySet<string>
): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value.filter(
          (slug): slug is string => typeof slug === 'string' && valid.has(slug)
        )
      ),
    ].slice(0, VISIT_LIMIT);
  } catch {
    return [];
  }
}

export function addVisit(
  visits: readonly string[],
  slug: string
): readonly string[] {
  return visits.includes(slug) || visits.length >= VISIT_LIMIT
    ? visits
    : [...visits, slug];
}

export function escapeXml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]!
  );
}

export function visitReceipt(
  editions: readonly { edition: number; title: string }[],
  palette: { paper: string; ink: string } = { paper: 'white', ink: 'black' }
): string {
  const height = 208 + editions.length * 66;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="${height}" viewBox="0 0 440 ${height}">
  <title>Your visit — Rahim Neal Yakoob</title>
  <rect width="440" height="${height}" fill="${escapeXml(palette.paper)}"/>
  <g fill="${escapeXml(palette.ink)}" font-family="monospace">
  <text x="30" y="42" font-size="12">RAHIM NEAL YAKOOB / LAB</text>
  <text x="30" y="88" font-size="30">YOUR VISIT</text>
  <text x="30" y="116" font-size="11">${editions.length} EDITIONS · IN ORDER OF DISCOVERY</text>
  ${editions.map((study, i) => `<g transform="translate(30 ${153 + i * 66})"><path d="M0 0H380" stroke="${escapeXml(palette.ink)}" stroke-opacity=".25"/><text y="33" font-size="12">${String(study.edition).padStart(3, '0')}</text><text x="46" y="33" font-size="14">${escapeXml(study.title)}</text></g>`).join('')}
  <text x="30" y="${height - 30}" font-size="11">A SMALL RECORD OF BEING HERE.</text>
  </g></svg>`;
}
