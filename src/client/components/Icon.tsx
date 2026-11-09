import React from 'react';

type IconKind = 'edit' | 'check' | 'copy';

export function Icon({ kind }: { kind: IconKind }) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === 'edit' ? <path d="m15.5 4.5 4 4M4 20l4.5-1 12-12a2.83 2.83 0 0 0-4-4l-12 12L4 20Z" />
        : kind === 'check' ? <path d="m5 12 4 4L19 6" />
          : <><rect x={8} y={8} width={12} height={13} rx={2} /><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" /></>}
    </svg>
  );
}
