import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  userInitial?: string;
}

/* ── Cycling streaming phases ── */
const PHASES = [
  { label: 'Thinking',           color: 'rgba(155,92,255,0.9)' },
  { label: 'Analyzing',          color: 'rgba(100,180,255,0.9)' },
  { label: 'Querying database',  color: 'rgba(0,210,180,0.9)'  },
  { label: 'Processing results', color: 'rgba(255,160,80,0.9)' },
];

/* Spinning ring + bot image — used as the avatar during streaming */
const SpinningBotAvatar: React.FC<{ color: string }> = () => (
  <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
    <div style={{
      position: 'absolute', inset: -3, borderRadius: '50%',
      border: '2.5px solid transparent',
      borderTopColor: 'rgba(255,255,255,0.9)',
      borderRightColor: 'rgba(255,255,255,0.3)',
      borderBottomColor: 'rgba(255,255,255,0.1)',
      animation: 'spin 1s linear infinite',
    }} />
    <img
      src="/bot.png"
      alt="Nova AI"
      style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: '50%', filter: 'none' }}
    />
  </div>
);

/* Parse display content — extract optional file pill from __file__name__ prefix */
function parseUserContent(content: string): { fileName: string | null; question: string } {
  const m = content.match(/^__file__(.+?)__\n([\s\S]*)$/);
  if (m) return { fileName: m[1], question: m[2] };
  return { fileName: null, question: content };
}

/** Returns true if the URL looks like a chart/attachment image */
function isChartUrl(href: string): boolean {
  return /\/api\/(attachments|charts)\//i.test(href) &&
    /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(href);
}

/** Returns true if the URL looks like a data export (CSV/Excel) */
function isExportUrl(href: string): boolean {
  return /\/api\/attachments\//i.test(href) &&
    /\.(csv|xlsx|xls)$/i.test(href);
}

const CHART_IMG_STYLE: React.CSSProperties = {
  maxWidth: '100%',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  display: 'block',
};

/** A small, elegant download button for attachments */
const DownloadButton: React.FC<{ href: string; label?: string; icon?: React.ReactNode }> = ({ href, label, icon }) => (
  <a
    href={href}
    download
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-all hover:scale-105 active:scale-95"
    style={{
      background: 'rgba(155, 92, 255, 0.15)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(155, 92, 255, 0.3)',
      color: '#c7a4ff',
      fontSize: 12,
      fontWeight: 600,
      width: 'fit-content',
    }}
  >
    {icon || (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    )}
    {label || 'Download'}
  </a>
);

/** Renders an <img> with an error fallback and a download button */
const MdImage: React.FC<{ src?: string; alt?: string }> = ({ src, alt }) => {
  const [broken, setBroken] = useState(false);
  if (!src) return null;
  if (broken) {
    return (
      <div className="my-3 p-3 rounded-xl border border-dashed border-white/10 bg-white/5 flex flex-col gap-2">
        <span className="text-xs text-white/40 font-medium">Chart failed to load</span>
        <DownloadButton href={src} label="View Original" icon={<span>📊</span>} />
      </div>
    );
  }
  return (
    <div className="relative group my-4 inline-block max-w-full">
      <img src={src} alt={alt || 'Chart'} onError={() => setBroken(true)} style={CHART_IMG_STYLE} />
      <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-1 group-hover:translate-y-0">
        <DownloadButton href={src} label="Save" />
      </div>
    </div>
  );
};

/** Renders links as images or download cards for attachments */
const MdLink: React.FC<{ href?: string; children?: React.ReactNode }> = ({ href, children }) => {
  const [broken, setBroken] = useState(false);
  const isChart = !!(href && isChartUrl(href));
  const isExport = !!(href && isExportUrl(href));
  const label = Array.isArray(children) ? children[0] : children;

  if (isChart) {
    return <MdImage src={href} alt={typeof label === 'string' ? label : 'Chart'} />;
  }

  if (isExport) {
    return (
      <div className="my-3 p-4 rounded-2xl flex items-center justify-between gap-4 transition-colors hover:bg-white/5"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(10px)',
          maxWidth: 320,
        }}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-white/90 truncate">
              {typeof label === 'string' ? label : 'Data Export'}
            </span>
            <span className="text-[10px] text-white/40 uppercase tracking-wider font-bold">Excel Document</span>
          </div>
        </div>
        <DownloadButton href={href ?? '#'} label="" />
      </div>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="text-white/60 hover:text-white/90 underline underline-offset-4 decoration-white/20 transition-colors">
      {children}
    </a>
  );
};

/** Extracts table data and downloads it as a CSV file */
const downloadTableAsCsv = (tableEl: HTMLTableElement | null) => {
  if (!tableEl) return;
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  const csvContent = rows
    .map(row => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      return cells.map(cell => `"${(cell.textContent || '').replace(/"/g, '""')}"`).join(',');
    })
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'table_data.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/** Renders a stylized table with a dedicated header action bar */
const MdTable: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const tableRef = React.useRef<HTMLTableElement>(null);
  return (
    <div className="my-6 rounded-xl overflow-hidden shadow-2xl" 
      style={{ 
        background: 'rgba(15, 12, 30, 0.4)', 
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(12px)'
      }}
    >
      {/* Header Action Bar */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-white/5 bg-white/5">
        <div className="flex items-center gap-2 text-[10px] font-bold text-white/30 uppercase tracking-widest">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
          Dataset
        </div>
        <button
          onClick={() => downloadTableAsCsv(tableRef.current)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all hover:scale-105 active:scale-95 text-[11px] font-bold"
          title="Download as CSV"
          style={{
            background: 'rgba(155, 92, 255, 0.15)',
            border: '1px solid rgba(155, 92, 255, 0.3)',
            color: '#c7a4ff',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Scrollable table container */}
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full border-collapse">
          {children}
        </table>
      </div>
    </div>
  );
};

/** Custom react-markdown components for assistant bubbles */
const markdownComponents: Components = {
  img: MdImage,
  a: MdLink,
  table: MdTable,
};

export const ChatBubble: React.FC<ChatBubbleProps> = ({ role, content, isStreaming, userInitial = 'U' }) => {
  const isUser = role === 'user';
  const showSpinner = !isUser && isStreaming && !content;

  const [phaseIdx, setPhaseIdx] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!showSpinner) return;
    const t = setInterval(() => setPhaseIdx(i => (i + 1) % PHASES.length), 1800);
    return () => clearInterval(t);
  }, [showSpinner]);

  useEffect(() => {
    if (!showSpinner) return;
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 420);
    return () => clearInterval(t);
  }, [showSpinner]);

  const phase = PHASES[phaseIdx];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar — spinning ring bot during streaming, static bot otherwise */}
      {isUser ? (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
          style={{ background: '#19c37d', color: 'white' }}
        >
          {userInitial}
        </div>
      ) : showSpinner ? (
        <div className="flex-shrink-0 mt-0.5">
          <SpinningBotAvatar color={phase.color} />
        </div>
      ) : (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', overflow: 'hidden', padding: 2 }}
        >
          <img
            src="/bot.png"
            alt="Nova AI"
            style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'none' }}
          />
        </div>
      )}

      {/* Bubble */}
      {isUser ? (
        <div
          className="max-w-[72%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
          style={{
            background: '#2f2f2f',
            color: 'white',
            borderBottomRightRadius: 6,
            boxShadow: 'none',
          }}
        >
          {(() => {
            const { fileName, question } = parseUserContent(content);
            return (
              <>
                {fileName && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(255,255,255,0.18)', borderRadius: 8,
                    padding: '4px 10px', marginBottom: question ? 8 : 0,
                    fontSize: 11.5, fontWeight: 600,
                    border: '1px solid rgba(255,255,255,0.28)',
                    maxWidth: '100%', overflow: 'hidden',
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
                  </div>
                )}
                {question && (
                  <div className="chat-prose chat-prose-user">
                    <Markdown remarkPlugins={[remarkGfm]}>{question}</Markdown>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : (
        <div
          className="flex-1 min-w-0 rounded-2xl px-4 py-3 text-sm leading-relaxed"
          style={{
            background: '#2f2f2f',
            border: '1px solid rgba(255,255,255,0.08)',
            borderBottomLeftRadius: 6,
            backdropFilter: 'none',
            maxWidth: 'calc(100% - 44px)',
          }}
        >
          {showSpinner ? (
            <motion.span
              key={phaseIdx}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.88)', letterSpacing: '0.01em' }}
            >
              {phase.label}<span style={{ color: 'rgba(255,255,255,0.35)' }}>{dots}</span>
            </motion.span>
          ) : (
            <div style={{ overflowX: 'auto' }} className="chat-prose">
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{content}</Markdown>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};
