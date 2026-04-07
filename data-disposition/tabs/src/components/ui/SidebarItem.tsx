import React from 'react';
import { motion } from 'framer-motion';

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  arrow?: boolean;
  className?: string;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  icon, label, active, onClick, arrow = false, className = '',
}) => (
  <motion.button
    whileHover={{ x: 2, backgroundColor: 'rgba(255,255,255,0.6)' }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`
      w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium
      transition-colors duration-150 text-left
      ${active
        ? 'bg-white/70 text-indigo-700 shadow-sm border border-white/60'
        : 'text-gray-600 hover:text-gray-900'
      }
      ${className}
    `}
  >
    <span className={`w-5 h-5 flex items-center justify-center flex-shrink-0 ${active ? 'text-indigo-600' : 'text-gray-400'}`}>
      {icon}
    </span>
    <span className="flex-1 truncate">{label}</span>
    {arrow && (
      <span className={`opacity-40 ${active ? 'opacity-70' : ''}`}>
        <ArrowIcon />
      </span>
    )}
  </motion.button>
);

const ArrowIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
  </svg>
);
