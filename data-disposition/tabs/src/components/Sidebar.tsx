import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Conversation } from '../types';
import type { AuthUser } from '../contexts/AuthContext';

interface SidebarProps {
  conversations: Conversation[];
  activeConvId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onSearch: (q: string) => void;
  onRename: (id: string, title: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  dbSource: string;
  dbOptions: string[];
  onDbChange: (v: string) => void;
  user: AuthUser;
  onLogout: () => void;
  view: 'chat' | 'dashboard';
  onViewChange: (v: 'chat' | 'dashboard') => void;
}

function groupConvs(convs: Conversation[]): [string, Conversation[]][] {
  const ts0 = new Date(); ts0.setHours(0, 0, 0, 0);
  const todayTs = ts0.getTime() / 1000;
  const yTs = todayTs - 86400, wTs = todayTs - 7 * 86400;
  const buckets = new Map<string, Conversation[]>();
  const ORDER = ['Today', 'Yesterday', 'Last 7 days', 'Older'];
  for (const c of convs) {
    const ts = parseFloat(c.updated_at ?? '0');
    const label = ts >= todayTs ? 'Today' : ts >= yTs ? 'Yesterday' : ts >= wTs ? 'Last 7 days' : 'Older';
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(c);
  }
  return ORDER.filter(g => buckets.has(g)).map(g => [g, buckets.get(g)!]);
}

/* ── Sidebar item ── */
const SItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}> = ({ icon, label, active, onClick }) => (
  <motion.button
    whileHover={{ x: 2 }}
    onClick={onClick}
    className="w-full flex items-center gap-3 px-3 py-[9px] rounded-[10px] text-left transition-all duration-150 group"
    style={{
      background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
      color: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)',
    }}
    onMouseEnter={e => {
      if (!active) {
        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)';
        (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.85)';
      }
    }}
    onMouseLeave={e => {
      if (!active) {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
        (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.55)';
      }
    }}
  >
    <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 opacity-80">{icon}</span>
    <span className="text-[13.5px] font-[450]">{label}</span>
  </motion.button>
);

/* ── Section label ── */
const SLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] px-3 pt-5 pb-1.5"
    style={{ color: 'rgba(255,255,255,0.28)' }}>
    {children}
  </p>
);

export const Sidebar: React.FC<SidebarProps> = ({
  conversations, activeConvId, onSelect, onNewChat, onDelete,
  onRename, isOpen, onToggle,
  dbSource, dbOptions, onDbChange,
  user, onLogout, view, onViewChange,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const grouped = useMemo(() => groupConvs(conversations), [conversations]);

  const commitEdit = (id: string) => {
    if (editTitle.trim()) onRename(id, editTitle.trim());
    setEditingId(null);
  };

  /* ── Collapsed mini rail ── */
  if (!isOpen) {
    return (
      <div className="flex flex-col items-center gap-3 py-5 flex-shrink-0"
        style={{ width: 56, background: 'rgba(8,7,18,0.90)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={onToggle}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
          style={{ color: 'rgba(255,255,255,0.4)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.85)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <SidebarToggleIcon />
        </button>
        <button onClick={onNewChat}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
          style={{ color: 'rgba(255,255,255,0.4)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.85)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          title="New Chat"
        >
          <PlusCircleIcon />
        </button>
        <button onClick={() => onViewChange('chat')}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
          style={{ color: view === 'chat' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          title="Chat"
        >
          <ChatBubbleIcon />
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ x: -10, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="flex flex-col flex-shrink-0 overflow-hidden"
      style={{
        width: 260,
        background: '#171717',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* ── Logo row ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          {/* Robot logo image */}
          <img
            src="/bot.png"
            alt="Nova AI"
            style={{
              width: 34,
              height: 34,
              objectFit: 'contain',
              filter: 'none',
            }}
          />
          <span className="text-white font-semibold text-[15px] tracking-[-0.01em]">Nova</span>
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
            AI
          </span>
        </div>
        <button onClick={onToggle}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
          style={{ color: 'rgba(255,255,255,0.3)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          title="Collapse sidebar"
        >
          <SidebarToggleIcon />
        </button>
      </div>

      {/* ── New Chat ── */}
      <div className="px-4 pb-1">
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={onNewChat}
          className="w-full flex items-center gap-2.5 px-4 py-[11px] rounded-[12px] transition-all"
          style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.09)',
            color: 'rgba(255,255,255,0.75)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.11)';
            (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.9)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)';
            (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.75)';
          }}
        >
          <PlusCircleIcon />
          <span className="text-sm font-[450]">New Chat</span>
        </motion.button>
      </div>

      {/* ── Scrollable middle section ── */}
      <div className="flex-1 overflow-y-auto px-3 pb-2">

        {/* FEATURES */}
        <SLabel>Features</SLabel>
        <SItem icon={<ChatBubbleIcon />} label="Chat" active={view === 'chat'} onClick={() => onViewChange('chat')} />
        <SItem icon={<ArchiveIcon />} label="Archived" />
        <SItem icon={<LibraryIcon />} label="Library" onClick={() => onViewChange('dashboard')} />

        {/* WORKSPACES */}
        <SLabel>Workspaces</SLabel>
        <SItem icon={<FolderPlusIcon />} label="New Project" onClick={onNewChat} />
        <SItem icon={<FolderIcon />} label="Image" />
        <SItem icon={<FolderIcon />} label="Presentation" />
        <SItem icon={<FolderIcon />} label="Riset" />

        {/* DB Selector */}
        <SLabel>Database</SLabel>
        <div className="flex gap-1.5 px-1 pb-1">
          {dbOptions.map(opt => (
            <button key={opt} onClick={() => onDbChange(opt)}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={dbSource === opt
                ? { background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)', boxShadow: 'none' }
                : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.07)' }
              }
              onMouseEnter={e => { if (dbSource !== opt) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.65)'; }}
              onMouseLeave={e => { if (dbSource !== opt) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'; }}
            >{opt}</button>
          ))}
        </div>

        {/* Chat History */}
        {conversations.length > 0 && (
          <>
            <SLabel>History</SLabel>
            {grouped.map(([group, convs]) => (
              <div key={group}>
                <p className="text-[10px] font-semibold uppercase tracking-wider px-3 pt-2 pb-1"
                  style={{ color: 'rgba(255,255,255,0.18)' }}>{group}</p>
                {convs.map(c => (
                  <div key={c.id}
                    onMouseEnter={() => setHoveredId(c.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => { onSelect(c.id); onViewChange('chat'); }}
                    className="flex items-center gap-2 px-3 py-[7px] rounded-[10px] cursor-pointer mb-0.5 transition-all group"
                    style={c.id === activeConvId
                      ? { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)' }
                      : { border: '1px solid transparent' }
                    }
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: c.id === activeConvId ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.18)' }} />
                    {editingId === c.id ? (
                      <input
                        className="flex-1 text-xs rounded-md px-2 py-0.5 outline-none"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        onBlur={() => commitEdit(c.id)}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(c.id); if (e.key === 'Escape') setEditingId(null); }}
                        autoFocus onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <span className="flex-1 text-[12.5px] truncate"
                          style={{ color: c.id === activeConvId ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)' }}>
                          {c.title}
                        </span>
                        <AnimatePresence>
                          {hoveredId === c.id && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                              className="flex gap-1 flex-shrink-0">
                              <button onClick={e => { e.stopPropagation(); setEditingId(c.id); setEditTitle(c.title); }}
                                className="w-5 h-5 rounded flex items-center justify-center transition-colors"
                                style={{ color: 'rgba(255,255,255,0.35)' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.85)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'}
                              ><EditPencilIcon /></button>
                              <button onClick={e => { e.stopPropagation(); onDelete(c.id); }}
                                className="w-5 h-5 rounded flex items-center justify-center transition-colors"
                                style={{ color: 'rgba(255,255,255,0.35)' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,80,80,0.9)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'}
                              ><TrashIcon /></button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── User footer ── */}
      <div className="px-4 py-3 flex items-center gap-2.5 flex-shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{ background: '#19c37d' }}>
          {(user?.name || 'U').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold truncate" style={{ color: 'rgba(255,255,255,0.8)' }}>{user?.name}</p>
          <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{user?.email}</p>
        </div>
        <button onClick={onLogout} title="Sign out"
          className="w-6 h-6 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
          style={{ color: 'rgba(255,255,255,0.3)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,80,80,0.8)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,80,80,0.08)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        ><LogoutIcon /></button>
      </div>
    </motion.div>
  );
};

/* ─── SVG Icons ─── */

/** Robot logo — matches the attached AI robot reference image */

const SidebarToggleIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="3" y="3" width="18" height="18" rx="3"/>
    <line x1="9" y1="3" x2="9" y2="21"/>
  </svg>
);
const PlusCircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="9"/>
    <line x1="12" y1="8" x2="12" y2="16"/>
    <line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
);
const ChatBubbleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const ArchiveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <polyline points="21 8 21 21 3 21 3 8"/>
    <rect x="1" y="3" width="22" height="5"/>
    <line x1="10" y1="12" x2="14" y2="12"/>
  </svg>
);
const LibraryIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);
const FolderPlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    <line x1="12" y1="11" x2="12" y2="17"/>
    <line x1="9" y1="14" x2="15" y2="14"/>
  </svg>
);
const FolderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);
const EditPencilIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);
const LogoutIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

export default Sidebar;
