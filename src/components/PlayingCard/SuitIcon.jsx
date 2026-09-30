// SVG suit symbols (spade, heart, diamond, club), filled with the current text color.

export default function SuitIcon({ suit, className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {suit === 's' && (
        <path d="M12 2s-8 6.2-8 11.2c0 2.6 2 4.3 4.3 4.3 1.3 0 2.5-.6 3.2-1.5-.2 2-1 3.6-2.5 5h6c-1.5-1.4-2.3-3-2.5-5 .7.9 1.9 1.5 3.2 1.5 2.3 0 4.3-1.7 4.3-4.3C20 8.2 12 2 12 2z" />
      )}
      {suit === 'h' && (
        <path d="M12 21s-7.5-4.6-9.5-9.3C1.1 8.3 3.2 4.5 6.9 4.5c2.1 0 3.8 1.1 5.1 3 1.3-1.9 3-3 5.1-3 3.7 0 5.8 3.8 4.4 7.2C19.5 16.4 12 21 12 21z" />
      )}
      {suit === 'd' && <path d="M12 2l8 10-8 10-8-10z" />}
      {suit === 'c' && (
        <>
          <circle cx="12" cy="7" r="4.3" />
          <circle cx="7" cy="13.5" r="4.3" />
          <circle cx="17" cy="13.5" r="4.3" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M12 12l-2 10h4z" />
        </>
      )}
    </svg>
  );
}
