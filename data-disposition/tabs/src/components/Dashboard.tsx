import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from './ui/GlassCard';
import { GradientButton } from './ui/GradientButton';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: 'easeOut' as const },
});

const GRADIENT_CARDS = [
  { title: 'Serene Current',  gradient: 'from-teal-400 via-cyan-400 to-blue-500',          text: 'Explore your data calmly' },
  { title: 'Tranquil Rise',   gradient: 'from-orange-400 via-red-300 to-rose-500',          text: 'Rising insights at a glance' },
  { title: 'Silent Pulse',    gradient: 'from-violet-500 via-fuchsia-400 to-pink-400',      text: 'Deep pattern recognition' },
  { title: 'Deep Trance',     gradient: 'from-indigo-900 via-purple-900 to-blue-900',       text: 'Advanced query analysis' },
];

const LANGUAGES = [
  { flag: '🇺🇸', name: 'English',           selected: true },
  { flag: '🇫🇷', name: 'Français' },
  { flag: '🇸🇦', name: 'Arabic' },
  { flag: '🇧🇩', name: 'Bengali' },
  { flag: '🇪🇸', name: 'Español' },
  { flag: '🇮🇩', name: 'Bahasa Indonesia' },
  { flag: '🇷🇺', name: 'Russian' },
  { flag: '🇮🇷', name: 'Farsi' },
  { flag: '🇺🇿', name: 'Uzbek' },
];

const FEATURES = [
  { label: 'Web Search',            ok: true },
  { label: 'Unlimited Daily Chats', ok: true },
  { label: 'Chat History',          ok: true },
  { label: 'Favourite Chats',       ok: true },
  { label: 'Unlimited File Upload', ok: true },
];

const MINI_CHAT = [
  { role: 'bot',  text: 'Hello, How can I help you?' },
  { role: 'user', text: 'How can I create a fixed deposit?' },
  { role: 'bot',  text: 'To create a Fixed Deposit (FD), choose a bank with the best interest rates.' },
  { role: 'user', text: 'Thank you so much for this type of valuable information' },
];

export const Dashboard: React.FC = () => {
  const [selectedLang, setSelectedLang] = useState('English');
  const [projectName, setProjectName] = useState('');

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <motion.h2 {...fadeUp(0)} className="text-2xl font-bold text-gray-800 mb-6">
        Explore Nova
      </motion.h2>

      {/* Row 1: gradient cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {GRADIENT_CARDS.map((card, i) => (
          <motion.div key={card.title} {...fadeUp(i * 0.08)}
            whileHover={{ scale: 1.03, transition: { duration: 0.18 } }}
            className="cursor-pointer"
          >
            <div className={`bg-gradient-to-br ${card.gradient} rounded-3xl p-5 h-36 flex flex-col justify-end relative overflow-hidden shadow-xl`}>
              {/* shine */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
              <div className="relative">
                <p className="text-white/70 text-xs mb-1">{card.text}</p>
                <h3 className="text-white font-bold text-base leading-tight">{card.title}</h3>
              </div>
              <button className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/30 backdrop-blur flex items-center justify-center">
                <ArrowIcon />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Row 2: 3 columns */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Premium plan */}
        <GlassCard delay={0.2} className="p-5 col-span-1">
          <div className="flex items-start justify-between mb-1">
            <h3 className="text-lg font-bold text-gray-800">Premium Plan</h3>
            <div className="w-6 h-6 rounded-full border-2 border-indigo-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">Access our most powerful model and advanced features</p>
          <div className="flex items-baseline gap-1.5 mb-4">
            <span className="text-sm text-gray-400 line-through">$21.99/Month</span>
            <span className="text-base font-bold text-gray-800">$99.00/Yearly</span>
          </div>
          <ul className="space-y-2 mb-5">
            {FEATURES.map(f => (
              <li key={f.label} className="flex items-center gap-2 text-sm text-gray-700">
                <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2 6 5 9 10 3" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
                </span>
                {f.label}
              </li>
            ))}
          </ul>
          <GradientButton className="w-full justify-center mb-2">Get Premium Now</GradientButton>
          <button className="w-full py-2 text-sm font-semibold text-gray-600 rounded-2xl border border-gray-200 hover:bg-white/60 transition-colors">
            Get Annual Plan
          </button>
        </GlassCard>

        {/* Language selector */}
        <GlassCard delay={0.28} className="p-5 col-span-1 flex flex-col">
          <h3 className="text-base font-bold text-gray-800 mb-3">Language</h3>
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {LANGUAGES.map(lang => (
              <button
                key={lang.name}
                onClick={() => setSelectedLang(lang.name)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/60 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{lang.flag}</span>
                  <span className="text-sm text-gray-700">{lang.name}</span>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  selectedLang === lang.name ? 'border-indigo-500' : 'border-gray-300'
                }`}>
                  {selectedLang === lang.name && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                </div>
              </button>
            ))}
          </div>
        </GlassCard>

        {/* Mini chat preview */}
        <GlassCard delay={0.36} className="flex flex-col overflow-hidden col-span-1">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/40">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <BotSvg />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Nova Digital</p>
              <p className="text-xs text-gray-400">Digital chatbot interface.</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
            {MINI_CHAT.map((m, i) => (
              <div key={i} className={`flex ${m.role==='user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] text-xs px-3 py-2 rounded-2xl leading-relaxed ${
                  m.role==='user'
                    ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-tr-sm'
                    : 'bg-white/80 border border-white/60 text-gray-700 rounded-tl-sm'
                }`}>{m.text}</div>
              </div>
            ))}
          </div>
          <div className="px-3 pb-3">
            <div className="flex items-center gap-2 bg-white/60 backdrop-blur rounded-2xl px-3 py-2 border border-white/60">
              <button className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-medium">+</button>
              <span className="flex-1 text-xs text-gray-400">Chat here...</span>
              <button className="text-gray-400"><MicIcon /></button>
              <button className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white"><SendIcon /></button>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Row 3: 2 columns */}
      <div className="grid grid-cols-2 gap-4">
        {/* Project card */}
        <GlassCard delay={0.44} className="p-5">
          <h3 className="text-base font-bold text-gray-800 mb-3">Project Name</h3>
          <div className="relative mb-3">
            <input
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="Enter project name..."
              className="w-full bg-white/60 border border-white/70 rounded-2xl px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-indigo-300 transition-colors"
            />
          </div>
          <div className="flex gap-2 flex-wrap mb-4">
            {[
              { icon: '💰', label: 'Finance & Budget' },
              { icon: '💳', label: 'Payment' },
            ].map(chip => (
              <span key={chip.label} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/60 border border-white/70 rounded-full text-xs font-medium text-gray-600">
                <span>{chip.icon}</span>{chip.label}
              </span>
            ))}
          </div>
          <GradientButton className="w-full justify-center">Create Project</GradientButton>
        </GlassCard>

        {/* Unlock AI card */}
        <GlassCard delay={0.52} className="p-5 flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/40 via-violet-50/30 to-pink-50/40" />
          <div className="relative">
            <div className="flex justify-center gap-1 mb-4">
              <AIMascot color="#6366f1" />
              <AIMascot color="#8b5cf6" size="large" />
              <AIMascot color="#a78bfa" />
              <AIMascot color="#34d399" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-1">Unlock AI Potential</h3>
            <p className="text-sm text-gray-500 mb-4">Enjoy preferred treatment and premium</p>
            <GradientButton>Get Started</GradientButton>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

/* ── Inline icons / SVGs ── */
const ArrowIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
    <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
  </svg>
);
const MicIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>
  </svg>
);
const SendIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
);
const BotSvg = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" opacity="0.9"/>
    <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.7"/>
  </svg>
);

interface AIMascotProps { color: string; size?: 'normal'|'large'; }
const AIMascot: React.FC<AIMascotProps> = ({ color, size = 'normal' }) => {
  const s = size === 'large' ? 52 : 40;
  return (
    <svg width={s} height={s+10} viewBox="0 0 52 62" fill="none">
      {/* body */}
      <ellipse cx="26" cy="38" rx="14" ry="18" fill={color}/>
      {/* head */}
      <circle cx="26" cy="18" r="13" fill={color}/>
      {/* ears */}
      <path d="M13 10 L8 3 L16 8 Z" fill={color}/>
      <path d="M39 10 L44 3 L36 8 Z" fill={color}/>
      {/* inner ear */}
      <path d="M13.5 10 L10 5 L16 8.5 Z" fill="rgba(255,255,255,0.3)"/>
      <path d="M38.5 10 L42 5 L36 8.5 Z" fill="rgba(255,255,255,0.3)"/>
      {/* eyes */}
      <circle cx="20" cy="17" r="4" fill="white"/>
      <circle cx="32" cy="17" r="4" fill="white"/>
      <circle cx="21" cy="18" r="2" fill="#1e1b4b"/>
      <circle cx="33" cy="18" r="2" fill="#1e1b4b"/>
      <circle cx="21.8" cy="17" r="0.8" fill="white"/>
      <circle cx="33.8" cy="17" r="0.8" fill="white"/>
      {/* smile */}
      <path d="M20 24 Q26 29 32 24" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      {/* body shine */}
      <ellipse cx="20" cy="32" rx="4" ry="6" fill="rgba(255,255,255,0.2)" transform="rotate(-15 20 32)"/>
      {/* scarf/collar */}
      <path d="M14 32 Q26 38 38 32" stroke="rgba(255,255,255,0.5)" strokeWidth="3" fill="none" strokeLinecap="round"/>
    </svg>
  );
};

export default Dashboard;
