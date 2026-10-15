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
export const Widgets = (p: P) => <Stroke {...p}><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" /><rect x="13" y="10" width="8" height="11" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /></Stroke>;
