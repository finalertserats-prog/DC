import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import clsx from 'clsx';

// ============================================================================
// Stat Card
// ============================================================================

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: ReactNode;
  gradient?: string;
}

export function StatCard({
  title,
  value,
  change,
  changeType = 'neutral',
  icon,
  gradient = 'from-brand-500/20 to-purple-500/20',
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6 hover:bg-white/10 transition-all duration-300 group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-400">{title}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
          {change && (
            <p
              className={clsx('mt-1 text-sm font-medium', {
                'text-emerald-400': changeType === 'positive',
                'text-red-400': changeType === 'negative',
                'text-gray-400': changeType === 'neutral',
              })}
            >
              {change}
            </p>
          )}
        </div>
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white group-hover:scale-110 transition-transform`}
        >
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Section Header
// ============================================================================

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ============================================================================
// Status Badge
// ============================================================================

interface StatusBadgeProps {
  status: 'success' | 'failed' | 'partial' | 'running' | 'pending';
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = {
    success: { classes: 'badge-success', text: label || 'Success' },
    failed: { classes: 'badge-danger', text: label || 'Failed' },
    partial: { classes: 'badge-warning', text: label || 'Partial' },
    running: { classes: 'badge-info', text: label || 'Running' },
    pending: { classes: 'badge bg-gray-500/20 text-gray-400 border border-gray-500/30', text: label || 'Pending' },
  };

  const { classes, text } = config[status];

  return (
    <span className={classes}>
      {status === 'running' && (
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      )}
      {text}
    </span>
  );
}

// ============================================================================
// Empty State
// ============================================================================

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-gray-500 mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-gray-500">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-white/5 ${className}`}
    />
  );
}

// ============================================================================
// Progress Bar
// ============================================================================

interface ProgressBarProps {
  progress: number;
  color?: string;
  striped?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ProgressBar({
  progress,
  color = 'bg-brand-500',
  striped = false,
  size = 'md',
}: ProgressBarProps) {
  const heights = { sm: 'h-1', md: 'h-2', lg: 'h-3' };

  return (
    <div className={`w-full rounded-full bg-white/10 overflow-hidden ${heights[size]}`}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className={`h-full rounded-full ${color} ${striped ? 'progress-striped' : ''}`}
      />
    </div>
  );
}

// ============================================================================
// Card
// ============================================================================

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: boolean;
  hover?: boolean;
}

export function Card({
  children,
  className = '',
  padding = true,
  hover = false,
}: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm',
        padding && 'p-6',
        hover && 'hover:bg-white/10 hover:border-white/20 transition-all duration-300',
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Modal
// ============================================================================

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`relative w-full ${sizes[size]} rounded-2xl border border-white/10 bg-surface-800 shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="btn-ghost p-1">
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </motion.div>
    </div>
  );
}

// ============================================================================
// Tooltip
// ============================================================================

interface TooltipProps {
  content: string;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  return (
    <div className="has-tooltip relative inline-flex">
      {children}
      <span className="tooltip absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-surface-900 px-2.5 py-1 text-xs text-white shadow-lg border border-white/10">
        {content}
      </span>
    </div>
  );
}

// ============================================================================
// Stepper
// ============================================================================

interface StepperProps {
  steps: { id: number; name: string; status: string }[];
  currentStep: number;
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className="flex items-center justify-between">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center flex-1 last:flex-initial">
          <div className="flex flex-col items-center">
            <div
              className={clsx(
                'flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-300',
                {
                  'border-emerald-500 bg-emerald-500/20 text-emerald-400':
                    step.status === 'success',
                  'border-brand-500 bg-brand-500/20 text-brand-400 animate-pulse-glow':
                    step.status === 'running',
                  'border-red-500 bg-red-500/20 text-red-400':
                    step.status === 'error',
                  'border-white/20 bg-white/5 text-gray-500':
                    step.status === 'pending',
                }
              )}
            >
              {step.status === 'success' ? '✓' : step.id}
            </div>
            <p
              className={clsx('mt-2 text-xs font-medium', {
                'text-emerald-400': step.status === 'success',
                'text-brand-400': step.status === 'running',
                'text-red-400': step.status === 'error',
                'text-gray-500': step.status === 'pending',
              })}
            >
              {step.name}
            </p>
          </div>
          {index < steps.length - 1 && (
            <div
              className={clsx('h-0.5 flex-1 mx-3 rounded-full transition-all duration-500', {
                'bg-emerald-500': index < currentStep,
                'bg-brand-500 animate-pulse': index === currentStep,
                'bg-white/10': index > currentStep,
              })}
            />
          )}
        </div>
      ))}
    </div>
  );
}
