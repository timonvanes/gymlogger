export function Logo({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="104" fill="#0e0e0f" />
      <circle cx="256" cy="256" r="180" fill="#c8f542" opacity="0.10" />
      <g transform="translate(256,256) rotate(-35)">
        <rect x="-162" y="-48" width="62" height="96" rx="18" fill="#c8f542" />
        <rect x="100" y="-48" width="62" height="96" rx="18" fill="#c8f542" />
        <rect x="-102" y="-17" width="204" height="34" rx="17" fill="#c8f542" />
        <rect x="-142" y="-30" width="14" height="60" rx="6" fill="#0e0e0f" opacity="0.22" />
        <rect x="128" y="-30" width="14" height="60" rx="6" fill="#0e0e0f" opacity="0.22" />
      </g>
    </svg>
  );
}
