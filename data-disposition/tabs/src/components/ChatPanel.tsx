import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatBubble } from './ui/ChatBubble';
import type { Message } from '../types';
import { getSuggestions } from '../api';

interface ChatPanelProps {
  messages: Message[];
  isStreaming: boolean;
  streamingText: string;
  onSend: (text: string, displayText?: string) => void;
  onStop: () => void;
  onRegenerate?: () => void;
  userName?: string;
  token: string;
  hasActiveConversation: boolean;
  onSuggestedPrompt: (text: string) => void;
}


const FAVS_KEY = 'nova_favs';
const loadFavs = (): string[] => { try { return JSON.parse(localStorage.getItem(FAVS_KEY) || '[]'); } catch { return []; } };
const saveFavs = (f: string[]) => localStorage.setItem(FAVS_KEY, JSON.stringify(f));

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages, isStreaming, streamingText, onSend, onStop,
  token, hasActiveConversation, userName,
}) => {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [favs, setFavs] = useState<string[]>(loadFavs);
  const [showFavs, setShowFavs] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAttach = useCallback(() => { fileInputRef.current?.click(); }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX = 200_000; // 200 KB text limit
    const reader = new FileReader();
    reader.onload = (ev) => {
      const raw = ev.target?.result as string;
      const content = raw.length > MAX ? raw.slice(0, MAX) + '\n...[truncated]' : raw;
      setAttachedFile({ name: file.name, content });
      setInput(prev => prev || '');
      taRef.current?.focus();
    };
    reader.readAsText(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  }, []);

  // Send: payload to LLM includes file content; display bubble shows only the question + file pill
  const send = useCallback((text?: string) => {
    const userQuestion = (text ?? input).trim();
    if (!userQuestion || isStreaming) return;
    setShowSugg(false); setShowFavs(false);

    if (attachedFile) {
      // Full payload sent to backend (file content + question)
      const payload = `File: ${attachedFile.name}\n\`\`\`\n${attachedFile.content}\n\`\`\`\n\n${userQuestion}`;
      // Display text: just the question with a file badge marker
      const display = `__file__${attachedFile.name}__\n${userQuestion}`;
      setAttachedFile(null);
      onSend(payload, display);
    } else {
      onSend(userQuestion);
    }

    setInput('');
    if (taRef.current) { taRef.current.style.height = 'auto'; }
  }, [input, isStreaming, onSend, attachedFile]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  // Derive user initial from userName prop (e.g. "mahesh.k@techsophy.com" → "M")
  const userInitial = (userName || 'U').charAt(0).toUpperCase();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (composerRef.current && !composerRef.current.contains(e.target as Node)) {
        setShowSugg(false); setShowFavs(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setInput(v);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    if (v.trim().length >= 2) {
      setShowFavs(false);
      getSuggestions(token, v.trim()).then(r => { setSuggestions(r); setShowSugg(r.length > 0); });
    } else { setShowSugg(false); setSuggestions([]); }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === 'Escape') { setShowSugg(false); setShowFavs(false); }
  };

  const handleMic = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition is not supported in this browser. Use Chrome or Edge.'); return; }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript.trim();
      if (transcript) {
        setIsListening(false);
        // Directly send — same as typing + Enter
        onSend(transcript);
        setInput('');
      }
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);

    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  }, [isListening, onSend]);

  const toggleFav = (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavs(prev => {
      const n = prev.includes(text) ? prev.filter(f => f !== text) : [text, ...prev];
      saveFavs(n); return n;
    });
  };

  /* ── Chat input panel (always rendered at bottom) ── */
  const InputPanel = (
    <div ref={composerRef} className="px-7 pb-6 pt-2 flex-shrink-0">
      {/* Suggestions dropdown */}
      <AnimatePresence>
        {showSugg && suggestions.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            className="rounded-2xl mb-2 overflow-hidden"
            style={{ background: '#2f2f2f', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'none', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            {suggestions.map((s, i) => (
              <div key={i} onMouseDown={() => send(s)}
                className="flex items-center justify-between px-4 py-2.5 cursor-pointer text-sm border-b border-white/5 last:border-none transition-colors"
                style={{ color: 'rgba(255,255,255,0.75)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <span className="flex-1 truncate">{s}</span>
                <button onMouseDown={e => toggleFav(s, e)}
                  className={`ml-2 text-base transition-colors ${favs.includes(s) ? 'text-yellow-400' : 'text-white/20 hover:text-yellow-300'}`}>★</button>
              </div>
            ))}
          </motion.div>
        )}
        {showFavs && favs.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            className="rounded-2xl mb-2 overflow-hidden"
            style={{ background: '#2f2f2f', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Saved</p>
            {favs.map((s, i) => (
              <div key={i} onMouseDown={() => send(s)}
                className="flex items-center justify-between px-4 py-2.5 cursor-pointer text-sm border-t border-white/5 transition-colors"
                style={{ color: 'rgba(255,255,255,0.75)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <span className="flex-1 truncate">{s}</span>
                <button onMouseDown={e => toggleFav(s, e)} className="ml-2 text-base text-yellow-400">★</button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main input box */}
      <div className="rounded-[18px] transition-all duration-200"
        style={{
          background: '#2f2f2f',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: 'none',
        }}
      >
        {/* Text area row */}
        <div className="flex items-start gap-3 px-5 pt-[18px] pb-2">
          {/* Sparkle icon */}
          <div className="mt-0.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2 L13.4 9 L20 10.5 L13.4 12 L12 19 L10.6 12 L4 10.5 L10.6 9 Z" />
            </svg>
          </div>
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={handleChange}
            onKeyDown={onKey}
            onFocus={() => { if (input.trim().length >= 2 && suggestions.length > 0) setShowSugg(true); }}
            disabled={isStreaming}
            placeholder="Ask Anything..."
            className="flex-1 bg-transparent text-sm outline-none leading-relaxed disabled:opacity-50"
            style={{ color: 'rgba(255,255,255,0.85)', maxHeight: 120, caretColor: 'white' }}
          />
        </div>

        {/* Bottom action row */}
        <div className="flex items-center px-5 pb-[14px] gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, marginTop: 4 }}>

          {/* Left actions */}
          {/* Favourites button */}
          <button
            onMouseDown={e => { e.preventDefault(); setShowFavs(v => !v); setShowSugg(false); }}
            disabled={isStreaming}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all disabled:opacity-40"
            style={showFavs
              ? { color: '#facc15', background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.3)' }
              : { color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }
            }
            onMouseEnter={e => { if (!showFavs) { (e.currentTarget as HTMLElement).style.color = '#facc15'; (e.currentTarget as HTMLElement).style.background = 'rgba(250,204,21,0.10)'; } }}
            onMouseLeave={e => { if (!showFavs) { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; } }}
          >
            <span style={{ fontSize: 12 }}>★</span> Favourites{favs.length > 0 && <span style={{ marginLeft: 3, fontSize: 10, background: 'rgba(250,204,21,0.2)', color: '#facc15', borderRadius: 999, padding: '1px 5px' }}>{favs.length}</span>}
          </button>

          <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.08)' }} />

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv,.json,.sql,.md,.log,.xml,.yaml,.yml"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button
            onClick={handleAttach}
            disabled={isStreaming}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all disabled:opacity-40"
            style={attachedFile
              ? { color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.2)' }
              : { color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }
            }
            onMouseEnter={e => { if (!attachedFile) { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.75)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)'; } }}
            onMouseLeave={e => { if (!attachedFile) { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; } }}
            title={attachedFile ? `Attached: ${attachedFile.name} (click to replace)` : 'Attach a file'}
          >
            <AttachIcon />
            {attachedFile ? (
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {attachedFile.name}
                <span
                  onMouseDown={e => { e.stopPropagation(); setAttachedFile(null); setInput(''); }}
                  style={{ marginLeft: 5, color: 'rgba(255,100,100,0.8)', cursor: 'pointer', fontWeight: 700 }}
                >✕</span>
              </span>
            ) : 'Attach'}
          </button>

          <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.08)' }} />

          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{ color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.75)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
          >
            <SettingsSmIcon /> Settings
          </button>

          <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.08)' }} />

          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{ color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.75)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
          >
            <GridIcon /> Options
          </button>

          {/* Right: mic + send */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleMic}
              disabled={isStreaming}
              title={isListening ? 'Stop listening' : 'Speak a message'}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-40"
              style={isListening
                ? { background: 'rgba(255,60,60,0.85)', border: '1px solid rgba(255,80,80,0.5)', color: 'white', boxShadow: '0 0 12px rgba(255,60,60,0.5)', animation: 'pulse-mic 1s ease-in-out infinite' }
                : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }
              }
              onMouseEnter={e => { if (!isListening) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.10)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.8)'; } }}
              onMouseLeave={e => { if (!isListening) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; } }}
            >
              <MicIcon />
            </button>

            {isStreaming ? (
              <button onClick={onStop}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white transition-all"
                style={{ background: 'rgba(255,60,60,0.8)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,60,60,1)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,60,60,0.8)'}
              >
                <StopIcon />
              </button>
            ) : (
              <motion.button
                whileHover={input.trim() ? { scale: 1.07 } : undefined}
                whileTap={input.trim() ? { scale: 0.93 } : undefined}
                onClick={() => send()}
                disabled={!input.trim()}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white transition-all"
                style={input.trim()
                  ? { background: '#ffffff', color: '#212121', boxShadow: 'none' }
                  : { background: 'rgba(255,255,255,0.08)', cursor: 'not-allowed' }
                }
              >
                <SendIcon />
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  /* ── Active chat view ── */
  if (hasActiveConversation || messages.length > 0) {
    return (
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto px-7 py-5 flex flex-col gap-4">
          {messages.map((m, i) => (
            <ChatBubble key={i} role={m.role as 'user' | 'assistant'} content={m.content} userInitial={userInitial} />
          ))}
          {isStreaming && (
            <ChatBubble role="assistant" content={streamingText} isStreaming={!streamingText} />
          )}
          <div ref={bottomRef} />
        </div>
        {InputPanel}
      </div>
    );
  }

  /* ── Welcome / hero screen ── */
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <TopBar />

      {/* Hero area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-1 overflow-hidden">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="text-[28px] font-[500] text-center leading-tight mb-2"
          style={{ color: 'rgba(255,255,255,0.88)', letterSpacing: '-0.02em' }}
        >
          What shall we discover in your data today?
        </motion.h1>
      </div>

      {/* Chat input */}
      {InputPanel}
    </div>
  );
};

/* ── Top bar ── */
const TopBar = () => (
  <div className="flex items-center justify-between px-7 py-4 flex-shrink-0"
    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>

    {/* Model dropdown */}
    <motion.button
      whileHover={{ scale: 1.02 }}
      className="flex items-center gap-2 px-[14px] h-9 rounded-full text-sm font-medium transition-all"
      style={{
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.8)',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.11)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: '#19c37d' }} />
      Nova AI
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </motion.button>

    {/* Right buttons */}
    <div className="flex items-center gap-2">
      <TopBarBtn icon={<GearIcon />} label="Configuration" />
      <TopBarBtn icon={<ExportIcon />} label="Export" />
    </div>
  </div>
);

const TopBarBtn: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <motion.button
    whileHover={{ scale: 1.03 }}
    className="flex items-center gap-2 px-[14px] h-9 rounded-full text-[13px] font-medium transition-all"
    style={{
      background: 'rgba(255,255,255,0.07)',
      border: '1px solid rgba(255,255,255,0.1)',
      color: 'rgba(255,255,255,0.65)',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.11)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.85)'; }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.65)'; }}
  >
    <span className="w-4 h-4 flex items-center justify-center">{icon}</span>
    {label}
  </motion.button>
);

/* ─── Icons ─── */
function AttachIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>;
}
function SettingsSmIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
}
function GridIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>;
}
function MicIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" /></svg>;
}
function SendIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>;
}
function StopIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3" /></svg>;
}
function GearIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
}
function ExportIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>;
}

export default ChatPanel;
