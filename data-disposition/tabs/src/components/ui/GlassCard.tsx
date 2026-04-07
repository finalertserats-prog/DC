import React from 'react';
import { motion } from 'framer-motion';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  delay?: number;
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children, className = '', hover = false, delay = 0, onClick,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 18 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.45, delay, ease: 'easeOut' }}
    whileHover={hover ? { scale: 1.02, transition: { duration: 0.18 } } : undefined}
    whileTap={hover ? { scale: 0.98 } : undefined}
    onClick={onClick}
    className={`
      bg-white/25 backdrop-blur-xl border border-white/40
      rounded-3xl shadow-xl
      ${hover ? 'cursor-pointer' : ''}
      ${className}
    `}
  >
    {children}
  </motion.div>
);
