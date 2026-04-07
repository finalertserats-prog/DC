import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  HomeIcon,
  CogIcon,
  RocketLaunchIcon,
  ClockIcon,
  ChartBarIcon,
  ServerStackIcon,
  ArrowRightStartOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore, useServerStatusStore } from '@/stores';

const navItems = [
  { to: '/', label: 'Dashboard', icon: HomeIcon },
  { to: '/pipeline', label: 'New Pipeline', icon: RocketLaunchIcon },
  { to: '/deployments', label: 'Deployments', icon: ClockIcon },
  { to: '/monitoring', label: 'Monitoring', icon: ChartBarIcon },
  { to: '/settings', label: 'Settings', icon: CogIcon },
];

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { airflow, staging } = useServerStatusStore();

  return (
    <aside className="flex w-72 flex-col border-r border-white/5 bg-surface-900">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-brand shadow-glow">
          <RocketLaunchIcon className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">SDP Pipeline</h1>
          <p className="text-xs text-gray-500 font-medium">Studio v2.0</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="px-4 pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-600">
          Main Menu
        </p>
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive =
            to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

          return (
            <NavLink key={to} to={to} className="block relative">
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-brand-500/15 border border-brand-500/20"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
              <div
                className={`relative flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-brand-400' : ''}`} />
                {label}
              </div>
            </NavLink>
          );
        })}
      </nav>

      {/* Server Status */}
      <div className="mx-3 mb-3 rounded-xl bg-white/5 p-4 border border-white/5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
          Infrastructure
        </p>
        <div className="space-y-2.5">
          <ServerStatusIndicator
            name="Airflow"
            host="sdpplyafw01"
            status={airflow.status}
          />
          <ServerStatusIndicator
            name="Staging"
            host="sdpplydn01"
            status={staging.status}
          />
        </div>
      </div>

      {/* User */}
      <div className="border-t border-white/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full gradient-brand text-white text-sm font-bold">
            {user?.name?.charAt(0) || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.name || 'Admin'}
            </p>
            <p className="text-xs text-gray-500 truncate">{user?.role || 'admin'}</p>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
            title="Logout"
          >
            <ArrowRightStartOnRectangleIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function ServerStatusIndicator({
  name,
  host,
  status,
}: {
  name: string;
  host: string;
  status: string;
}) {
  const colors = {
    online: 'bg-emerald-500',
    offline: 'bg-red-500',
    checking: 'bg-amber-500 animate-pulse',
  };

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative">
        <ServerStackIcon className="h-4 w-4 text-gray-500" />
        <div
          className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-surface-900 ${
            colors[status as keyof typeof colors] || colors.offline
          }`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-300">{name}</p>
        <p className="text-[10px] text-gray-600 truncate">{host}</p>
      </div>
    </div>
  );
}
