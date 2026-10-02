// Inline SVG icon set (stroke icons, 24x24). Used instead of emojis everywhere in the app.

// Each icon is the inner SVG markup, drawn with the current text color.
const ICONS = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  cards: (
    <>
      <rect x="8" y="3" width="12" height="16" rx="2" />
      <path d="M5 7.5 4.2 8a2 2 0 0 0-.7 2.7l5.4 9.3a2 2 0 0 0 2.7.7l.6-.3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  chart: <path d="M4 20V11M10 20V5M16 20v-6M21 20H3" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  close: <path d="M18 6 6 18M6 6l12 12" />,
  trendUp: <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />,
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  flag: <path d="M4 22V4a1 1 0 0 1 1-1h13l-2 5 2 5H5" />,
  play: <path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  pencil: (
    <>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
      <path d="m14.5 5.5 3 3" />
    </>
  ),
  note: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="9" cy="7" rx="6" ry="3" />
      <path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" />
      <path d="M9 18c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3" />
    </>
  ),
  calculator: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v3M8 18.5h4" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  star: <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" />,
  trophy: (
    <>
      <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </>
  ),
  flame: <path d="M12 22c-3.9 0-7-2.9-7-6.8C5 11 8.5 9 9.5 5.5 11 7 11.5 9 11 10.5c1.8-.8 3-2.8 3-5.5 3 2.5 5 5.8 5 9.7 0 4.3-3.1 7.3-7 7.3z" />,
  trendDown: <path d="m3 7 6 6 4-4 8 8M15 17h6v-6" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.7.8 2.8 2.6 3.2 5.2" />
    </>
  ),
  zap: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  // Coach: graduation cap
  coach: (
    <>
      <path d="M2 9l10-5 10 5-10 5z" />
      <path d="M6 11.2V16c0 1.6 2.7 3 6 3s6-1.4 6-3v-4.8M22 9v5" />
    </>
  ),
  // All-in: warning octagon with a double exclamation mark
  allIn: (
    <>
      <path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z" />
      <path d="M9.5 7v6.5M14.5 7v6.5M9.5 17h.01M14.5 17h.01" />
    </>
  ),
  // Hero: shield with a star (you)
  hero: (
    <>
      <path d="M12 2.5 4.5 5.5v5.5c0 4.8 3.2 8.9 7.5 10.5 4.3-1.6 7.5-5.7 7.5-10.5V5.5z" />
      <path d="m12 8 1.3 2.6 2.9.4-2.1 2 .5 2.9L12 14.5l-2.6 1.4.5-2.9-2.1-2 2.9-.4z" />
    </>
  ),
  // Villain: face with a domino mask
  villain: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M4.5 10.2c2.3-1.6 5-1.6 7.5.3 2.5-1.9 5.2-1.9 7.5-.3-.4 2.4-2.4 3.6-4.4 3.3-1.4-.2-2.3-1.1-3.1-2-.8.9-1.7 1.8-3.1 2-2 .3-4-.9-4.4-3.3z" />
      <path d="M9.5 17c1.6.8 3.5.7 5-.4" />
    </>
  ),
};

export default function Icon({ name, size = 20, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}
