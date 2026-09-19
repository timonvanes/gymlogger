export function Logo({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lg-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22261a" />
          <stop offset="1" stopColor="#0a0a0b" />
        </linearGradient>
        <radialGradient id="lg-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#c8f542" stopOpacity="0.32" />
          <stop offset="1" stopColor="#c8f542" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lg-lime" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eaff8f" />
          <stop offset="0.5" stopColor="#c8f542" />
          <stop offset="1" stopColor="#9ccc16" />
        </linearGradient>
        <linearGradient id="lg-lime-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6fa5c" />
          <stop offset="1" stopColor="#7fae0e" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#lg-bg)" />
      <circle cx="256" cy="256" r="230" fill="url(#lg-glow)" />
      <g transform="translate(256,256) rotate(-40)">
        <rect x="-118" y="-15" width="236" height="30" rx="15" fill="#d9d9d4" />
        <rect x="-118" y="-15" width="236" height="10" rx="5" fill="#ffffff" opacity="0.35" />
        <rect x="-150" y="-58" width="40" height="116" rx="14" fill="url(#lg-lime-dark)" />
        <rect x="-186" y="-84" width="46" height="168" rx="17" fill="url(#lg-lime)" />
        <rect x="-180" y="-74" width="9" height="148" rx="4.5" fill="#ffffff" opacity="0.38" />
        <rect x="110" y="-58" width="40" height="116" rx="14" fill="url(#lg-lime-dark)" />
        <rect x="140" y="-84" width="46" height="168" rx="17" fill="url(#lg-lime)" />
        <rect x="146" y="-74" width="9" height="148" rx="4.5" fill="#ffffff" opacity="0.38" />
      </g>
    </svg>
  );
}
