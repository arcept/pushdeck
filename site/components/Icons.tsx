// Small inline icons (24-unit grid, drawn with the current text colour). Decorative: the link or button text says what it does.
type P = { size?: number; className?: string };

const Stroke = ({ size = 18, className, children }: P & { children: React.ReactNode }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
);

/** The GitHub mark. */
export const GitHub = ({ size = 18, className }: P) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
  </svg>
);

/** ↗ leaves this site */
export const External = (p: P) => <Stroke size={14} {...p}><path d="M7 17 17 7" /><path d="M8 7h9v9" /></Stroke>;
export const Download = (p: P) => <Stroke {...p}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></Stroke>;
export const Copy = (p: P) => <Stroke size={14} {...p}><rect x="8" y="8" width="13" height="13" rx="2.5" /><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8" /></Stroke>;
export const Check = (p: P) => <Stroke size={14} {...p}><path d="m5 12 5 5 9-10" /></Stroke>;
export const Pointer = (p: P) => <Stroke {...p}><path d="M5 3l14 7-6 2-2 6Z" /><path d="m13 12 6 6" /></Stroke>;
export const Drag = (p: P) => <Stroke {...p}><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></Stroke>;
export const Screen = (p: P) => <Stroke {...p}><rect x="2.5" y="6" width="19" height="9" rx="2" /><path d="M8 19h8" /><path d="M12 15v4" /></Stroke>;
export const Shield = (p: P) => <Stroke {...p}><path d="M12 3 4.5 6v5.5c0 4.5 3.1 7.9 7.5 9.5 4.4-1.6 7.5-5 7.5-9.5V6Z" /><path d="m9 12 2.2 2.2L15.5 10" /></Stroke>;
export const Laptop = (p: P) => <Stroke {...p}><rect x="4" y="5" width="16" height="11" rx="2" /><path d="M2 19.5h20" /></Stroke>;
export const CloudOff = (p: P) => <Stroke {...p}><path d="M9.5 5.2A5 5 0 0 1 17 9.5h.5a3.5 3.5 0 0 1 2.7 5.7M6.5 8.4A4.5 4.5 0 0 0 7 17.5h9.5" /><path d="m3 3 18 18" /></Stroke>;
export const Key = (p: P) => <Stroke {...p}><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8" /><path d="m16 7 2.5 2.5" /></Stroke>;
export const Wave = (p: P) => <Stroke {...p}><path d="M4 12v0M8 8v8M12 4v16M16 8v8M20 12v0" /></Stroke>;
export const Folder = (p: P) => <Stroke {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></Stroke>;
export const Ban = (p: P) => <Stroke {...p}><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></Stroke>;
export const Widgets = (p: P) => <Stroke {...p}><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" /><rect x="13" y="10" width="8" height="11" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /></Stroke>;
