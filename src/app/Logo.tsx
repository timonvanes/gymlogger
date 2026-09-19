export function Logo({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="112" fill="#c8f542" />
      <g
        transform="translate(256,256) rotate(-30) scale(0.95)"
        stroke="#1a1a1c"
        strokeWidth="16"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <rect x="-112" y="-20" width="224" height="40" rx="20" fill="#ffffff" />
        <rect x="-150" y="-62" width="44" height="124" rx="16" fill="#3b3b40" />
        <rect x="-196" y="-92" width="52" height="184" rx="20" fill="#2a2a2e" />
        <rect x="106" y="-62" width="44" height="124" rx="16" fill="#3b3b40" />
        <rect x="144" y="-92" width="52" height="184" rx="20" fill="#2a2a2e" />
        <g stroke="none" fill="#ffffff">
          <rect x="-184" y="-74" width="10" height="70" rx="5" />
          <rect x="156" y="-74" width="10" height="70" rx="5" />
        </g>
      </g>
    </svg>
  );
}
