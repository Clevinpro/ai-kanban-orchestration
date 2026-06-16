import { useEffect, useRef, useState } from 'react';

// Brand-ish marks for each agent. Kept as inline SVG so the dropdown can show
// real icons (a native <select> can only render text in its options).
export function AgentIcon({ agent, className = 'w-3 h-3' }) {
  if (agent === 'cursor') {
    // Cursor — angular cursor/cube glyph in slate.
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5 3l14 7.5-6.2 1.5L11 18.5z" />
      </svg>
    );
  }
  // Claude (Anthropic) — sunburst spark in brand orange.
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#D97757" aria-hidden="true">
      <path d="M12 2l1.6 6.1L18 4.6l-2.3 5.6 6.1-.9-5.4 3 5.4 3-6.1-.9L18 19.4l-4.4-3.5L12 22l-1.6-6.1L6 19.4l2.3-5.6-6.1.9 5.4-3-5.4-3 6.1.9L6 4.6l4.4 3.5z" />
    </svg>
  );
}

const LABELS = { claude: 'Claude', cursor: 'Cursor' };

// Compact custom dropdown (icon + label) for picking the per-epic agent.
// Closes on outside click / Escape; positioned under its trigger button.
export default function AgentSelect({ value, options = ['claude', 'cursor'], onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Which agent runs this epic's tasks"
        className="flex items-center gap-1 rounded border border-blue-300 bg-white text-blue-800 text-[10px] font-semibold uppercase tracking-wide py-0.5 pl-1 pr-0.5 cursor-pointer hover:border-blue-400 focus:outline-none"
      >
        <AgentIcon agent={value} />
        <span>{LABELS[value] || value}</span>
        <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-0.5 min-w-[5.5rem] rounded border border-blue-200 bg-white shadow-lg py-0.5">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-1.5 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide normal-case text-left hover:bg-blue-50 ${
                opt === value ? 'text-blue-800 bg-blue-50/60' : 'text-gray-600'
              }`}
            >
              <AgentIcon agent={opt} />
              <span className="uppercase">{LABELS[opt] || opt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
