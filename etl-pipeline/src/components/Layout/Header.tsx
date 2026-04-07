import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BellIcon,
  MagnifyingGlassIcon,
  SunIcon,
  MoonIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useThemeStore, useNotificationStore } from '@/stores';

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Pipeline overview and analytics' },
  '/pipeline': { title: 'New Pipeline', subtitle: 'Configure and deploy ETL pipelines' },
  '/deployments': { title: 'Deployments', subtitle: 'Deployment history and logs' },
  '/monitoring': { title: 'Monitoring', subtitle: 'Real-time infrastructure status' },
  '/settings': { title: 'Settings', subtitle: 'Application configuration' },
};

export default function Header() {
  const location = useLocation();
  const { isDark, toggleTheme } = useThemeStore();
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotificationStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const currentPage = pageTitles[location.pathname] || pageTitles['/'];

  return (
    <header className="relative z-40 flex items-center justify-between border-b border-white/5 bg-surface-900/50 backdrop-blur-xl px-6 py-4">
      {/* Page Title */}
      <div>
        <h2 className="text-xl font-bold text-white">{currentPage.title}</h2>
        <p className="text-sm text-gray-500">{currentPage.subtitle}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <input
                type="text"
                placeholder="Search pipelines, deployments..."
                className="input-field text-sm py-2"
                autoFocus
                onBlur={() => setShowSearch(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setShowSearch(!showSearch)}
          className="btn-ghost p-2"
          title="Search"
        >
          <MagnifyingGlassIcon className="h-5 w-5" />
        </button>

        {/* Theme Toggle */}
        <button onClick={toggleTheme} className="btn-ghost p-2" title="Toggle theme">
          {isDark ? (
            <SunIcon className="h-5 w-5" />
          ) : (
            <MoonIcon className="h-5 w-5" />
          )}
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="btn-ghost p-2 relative"
            title="Notifications"
          >
            <BellIcon className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="absolute right-0 top-12 z-50 w-96 rounded-xl border border-white/10 bg-surface-800 shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                  <h3 className="text-sm font-semibold text-white">
                    Notifications
                  </h3>
                  <div className="flex gap-2">
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-xs text-brand-400 hover:text-brand-300"
                      >
                        Mark all read
                      </button>
                    )}
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="text-gray-500 hover:text-white"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center">
                      <BellIcon className="mx-auto h-8 w-8 text-gray-600" />
                      <p className="mt-2 text-sm text-gray-500">
                        No notifications yet
                      </p>
                    </div>
                  ) : (
                    notifications.slice(0, 10).map((n) => (
                      <div
                        key={n.id}
                        onClick={() => markAsRead(n.id)}
                        className={`flex gap-3 px-4 py-3 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${
                          !n.read ? 'bg-brand-500/5' : ''
                        }`}
                      >
                        <div
                          className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${
                            n.type === 'success'
                              ? 'bg-emerald-500'
                              : n.type === 'error'
                              ? 'bg-red-500'
                              : n.type === 'warning'
                              ? 'bg-amber-500'
                              : 'bg-blue-500'
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {n.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                            {n.message}
                          </p>
                          <p className="text-[10px] text-gray-600 mt-1">
                            {new Date(n.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
