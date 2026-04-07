import React from 'react';
import { motion } from 'framer-motion';

interface GradientButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: 'primary' | 'outline' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit';
}

export const GradientButton: React.FC<GradientButtonProps> = ({
  children, onClick, className = '', variant = 'primary', disabled, type = 'button',
}) => {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-2xl px-5 py-2.5 text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed';

  const variants = {
    primary: `
      bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg
      shadow-indigo-200/60
      bg-size-200 hover:shadow-indigo-300/70 hover:shadow-xl
      [background-size:200%] hover:[background-position:right_center]
    `,
    outline: 'bg-white/50 backdrop-blur border border-white/60 text-indigo-700 hover:bg-white/80',
    ghost: 'bg-transparent text-gray-600 hover:bg-white/40',
  };

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.03 } : undefined}
      whileTap={!disabled ? { scale: 0.97 } : undefined}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </motion.button>
  );
};
