// Cartoon face for a tilt level, from 1 (big smile) to 5 (angry), like a doctor's pain scale.

// Face colors go from calm teal to hot red.
export const TILT_COLORS = ['#7FC8C2', '#A9D6A0', '#E9C46A', '#EE9B5B', '#E06456'];

// Mouth shape for each level (index 0 = level 1).
const MOUTHS = [
  'M7.5 13.8q4.5 5.2 9 0z',
  'M8.3 14.6q3.7 2.8 7.4 0',
  'M8.5 15.4h7',
  'M8.5 16.6q3.5-2.6 7 0',
  'M8 17.4q4-4.2 8 0',
];

export default function TiltFace({ level, size = 40 }) {
  const color = TILT_COLORS[level - 1];

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill={color} />
      <g fill="none" stroke="#12181B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {/* Eyes: happy arcs at level 1, dots otherwise */}
        {level === 1 ? (
          <path d="M7.3 10.2q1.7-2 3.4 0M13.3 10.2q1.7-2 3.4 0" />
        ) : (
          <>
            <circle cx="9" cy="10" r="0.9" fill="#12181B" />
            <circle cx="15" cy="10" r="0.9" fill="#12181B" />
          </>
        )}

        {/* Brows: worried at 4, angry at 5 */}
        {level === 4 && <path d="M7.3 7.9l2.9-1M16.7 7.9l-2.9-1" />}
        {level === 5 && <path d="M7 6.6l3.4 1.6M17 6.6l-3.4 1.6" />}

        <path d={MOUTHS[level - 1]} fill={level === 1 ? '#12181B' : 'none'} />
      </g>
    </svg>
  );
}
