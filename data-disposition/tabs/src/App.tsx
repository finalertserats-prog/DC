import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { Dashboard } from './components/Dashboard';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import * as api from './api';
import type { Conversation, Message } from './types';
import './app.css';

type View = 'chat' | 'dashboard';

const App: React.FC = () => {
  const { token, user, isReady, logout } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [view, setView] = useState<View>('chat');

  const [dbSource, setDbSource] = useState('StarRocks');
  const [dbOptions, setDbOptions] = useState<string[]>(['Snowflake', 'StarRocks']);

  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const activeConvRef = useRef(activeConvId);
  activeConvRef.current = activeConvId;
  const skipLoadRef = useRef(false);
  const [msgsVersion, setMsgsVersion] = useState(0);

  const loadConversations = useCallback(async () => {
    if (!token) return;
    try { setConversations(await api.listConversations(token)); } catch {}
  }, [token]);

  useEffect(() => {
    if (token) {
      loadConversations();
      api.getDbPreference(token).then(d => {
        setDbSource(d.db_source);
        if (d.options?.length) setDbOptions(d.options);
      }).catch(() => {});
    } else {
      setConversations([]); setActiveConvId(null); setMessages([]);
    }
  }, [token, loadConversations]);

  useEffect(() => {
    if (!activeConvId || !token) { setMessages([]); return; }
    if (skipLoadRef.current) { skipLoadRef.current = false; return; }
    setIsStreaming(false); setStreamingText('');
    api.getMessages(token, activeConvId).then(setMessages).catch(() => {});
  }, [activeConvId, token, msgsVersion]);

  const handleNewChat = useCallback(() => {
    setActiveConvId(null); setMessages([]); setStreamingText(''); setIsStreaming(false); setView('chat');
  }, []);

  const handleDbChange = useCallback(async (v: string) => {
    if (!token) return;
    try { const r = await api.setDbPreference(token, v); setDbSource(r.db_source); } catch {}
  }, [token]);

  const handleSelect = useCallback((id: string) => {
    if (id === activeConvId) { if (messages.length === 0) setMsgsVersion(v => v + 1); return; }
    setActiveConvId(id); setStreamingText(''); setIsStreaming(false);
  }, [activeConvId, messages.length]);

  const handleDelete = useCallback(async (id: string) => {
    if (!token) return;
    try {
      await api.deleteConversation(token, id);
      setConversations(p => p.filter(c => c.id !== id));
      if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
    } catch {}
  }, [token, activeConvId]);

  const handleSearch = useCallback(async (q: string) => {
    if (!token) return;
    if (!q.trim()) { loadConversations(); return; }
    try { setConversations(await api.searchConversations(token, q)); } catch {}
  }, [token, loadConversations]);

  const handleRename = useCallback(async (id: string, title: string) => {
    if (!token) return;
    try {
      await api.renameConversation(token, id, title);
      setConversations(p => p.map(c => c.id === id ? { ...c, title } : c));
    } catch {}
  }, [token]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort(); setIsStreaming(false); setStreamingText('');
  }, []);

  const handleSend = useCallback(async (text: string, displayText?: string) => {
    if (!token) return;
    let convId = activeConvRef.current;
    if (!convId) {
      try {
        const conv = await api.createConversation(token, (displayText || text).slice(0, 60));
        convId = conv.id;
        skipLoadRef.current = true;
        setActiveConvId(convId);
        setConversations(p => [conv, ...p]);
      } catch { return; }
    }
    // Show displayText in the bubble, send full text (with file) to the API
    setMessages(p => [...p, { role: 'user', content: displayText ?? text }]);
    setIsStreaming(true); setStreamingText('');
    const ctrl = new AbortController(); abortRef.current = ctrl;
    const fId = convId;
    try {
      await api.sendMessage(token, fId, text,
        delta => setStreamingText(delta),
        final => {
          setMessages(p => [...p, { role: 'assistant', content: final }]);
          setIsStreaming(false); setStreamingText(''); loadConversations();
        },
        err => {
          setMessages(p => [...p, { role: 'assistant', content: `⚠ ${err}` }]);
          setIsStreaming(false); setStreamingText('');
        },
        ctrl.signal
      );
    } catch {
      setMessages(p => [...p, { role: 'assistant', content: 'Something went wrong. Please try again.' }]);
      setIsStreaming(false); setStreamingText('');
    }
  }, [token, loadConversations]);

  const handleRegenerate = useCallback(() => {
    const last = [...messages].reverse().find(m => m.role === 'user');
    if (last) {
      setMessages(p => { const i = [...p].reverse().findIndex(m => m.role === 'user'); return p.slice(0, p.length - i); });
      handleSend(last.content);
    }
  }, [messages, handleSend]);

  if (!isReady) {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ background: '#212121' }}>
        <div className="w-10 h-10 rounded-full border-4 border-[#3a3a3a] border-t-[#acacac] animate-spin" />
      </div>
    );
  }

  if (!token) {
    return <LoginPage />;
  }

  return (
    /* ── Cinematic wallpaper ── */
    <div className="cinematic-bg h-screen w-screen overflow-hidden flex items-center justify-center">

      {/* Floating glass window */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className="glass-window w-full h-full flex overflow-hidden relative"
        style={{ borderRadius: 0 }}
      >
        <Sidebar
          conversations={conversations}
          activeConvId={activeConvId}
          onSelect={handleSelect}
          onNewChat={handleNewChat}
          onDelete={handleDelete}
          onSearch={handleSearch}
          onRename={handleRename}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(p => !p)}
          dbSource={dbSource}
          dbOptions={dbOptions}
          onDbChange={handleDbChange}
          user={user!}
          onLogout={logout}
          view={view}
          onViewChange={v => setView(v)}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {view === 'dashboard' ? (
            <Dashboard />
          ) : (
            <ChatPanel
              messages={messages}
              isStreaming={isStreaming}
              streamingText={streamingText}
              onSend={handleSend}
              onStop={handleStop}
              onRegenerate={handleRegenerate}
              userName={user?.name}
              token={token ?? ''}
              hasActiveConversation={!!activeConvId}
              onSuggestedPrompt={handleSend}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default App;
