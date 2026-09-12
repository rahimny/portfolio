/** Lightweight companion when motion or graphics are unavailable. */
export function HomeWatcherStill() {
  return (
    <svg
      className="home-watcher-still"
      viewBox="0 0 180 140"
      aria-hidden="true"
    >
      <ellipse
        cx="90"
        cy="115"
        rx="64"
        ry="10"
        fill="currentColor"
        opacity="0.08"
      />
      <g fill="none" stroke="var(--fg)" strokeWidth="4" strokeLinejoin="bevel">
        <path d="M71 75 46 66 30 110M70 82 35 81 17 121M111 75 139 67 151 108M112 82 150 83 165 120" />
        <path d="M69 90 44 93 34 126M75 94 65 106 61 134M108 90 135 96 145 126M101 94 117 107 123 134" />
      </g>
      <g fill="none" stroke="var(--fg-muted)" strokeWidth="6">
        <path d="M71 75 46 66M70 82 35 81M111 75 139 67M112 82 150 83M69 90 44 93M75 94 65 106M108 90 135 96M101 94 117 107" />
      </g>
      <path d="m62 72 42-6 19 9-5 22-48 2-11-10z" fill="var(--fg)" />
      <path d="m62 72 42-6 19 9-49 7z" fill="var(--fg-muted)" />
      <path
        d="M75 86h28"
        stroke="var(--paper)"
        strokeWidth="5"
        strokeDasharray="3 3"
      />
      <path d="M91 74V56" stroke="var(--fg)" strokeWidth="9" />
      <path d="M85 66h13" stroke="var(--brand)" strokeWidth="4" />
      <path d="m69 24 40-4 18 12-3 28-42 7-15-13z" fill="var(--fg-muted)" />
      <path
        d="m68 23 43-5 20 12-47 6-18-4z"
        fill="var(--paper)"
        stroke="var(--fg)"
        strokeWidth="2"
      />
      <path d="m83 36 41-5-2 26-39 7z" fill="var(--fg)" />
      <ellipse cx="104" cy="47" rx="9" ry="10" fill="var(--paper)" />
      <ellipse cx="104" cy="47" rx="6" ry="7" fill="var(--fg)" />
      <circle cx="117" cy="53" r="2" fill="var(--brand)" />
    </svg>
  );
}
