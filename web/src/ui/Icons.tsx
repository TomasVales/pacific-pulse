import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 18): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

export const IconPlay = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none" /></svg>
);
export const IconPause = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" /></svg>
);
export const IconSearch = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
);
export const IconClose = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconDrop = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 3.5s6 6.4 6 10.6a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5z" /></svg>
);
export const IconThermo = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z" /></svg>
);
export const IconLeaf = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15" /><path d="M5 19c3-4 6-6.5 9.5-8.5" /></svg>
);
export const IconBolt = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M13 2.8 5 13.5h6l-1 7.7 8-10.7h-6z" /></svg>
);
export const IconHeart = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" /><path d="M8 12h2l1.2-2 1.6 4 1.2-2h2" /></svg>
);
export const IconGlobe = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5S9.5 6.1 12 3.5z" /></svg>
);
export const IconSliders = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
);
export const IconHistory = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3.5 4.5v4h4" /><path d="M12 8v4.5l3 2" /></svg>
);
export const IconSpark = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></svg>
);
export const IconWind = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8" /></svg>
);
export const IconChevL = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m15 5-7 7 7 7" /></svg>
);
export const IconChevR = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m9 5 7 7-7 7" /></svg>
);
export const IconDownload = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></svg>
);
export const IconPin = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>
);
export const IconFlag = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>
);
export const IconReset = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5" /><path d="M4 4v4.5h4.5" /></svg>
);
export const IconInfo = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></svg>
);
