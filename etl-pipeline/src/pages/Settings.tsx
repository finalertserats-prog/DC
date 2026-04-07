import { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  UserIcon,
  ServerStackIcon,
  KeyIcon,
  PaintBrushIcon,
  BellIcon,
  ShieldCheckIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { Card, SectionHeader } from '@/components/ui';
import { useAuthStore, useThemeStore, useDeploymentStore, useNotificationStore } from '@/stores';
import { AIRFLOW_SERVER, STAGING_SERVER } from '@/config/constants';

type SettingsTab = 'profile' | 'servers' | 'appearance' | 'notifications' | 'security' | 'data';

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: 'Profile', icon: <UserIcon className="h-4 w-4" /> },
  { id: 'servers', label: 'Servers', icon: <ServerStackIcon className="h-4 w-4" /> },
  { id: 'appearance', label: 'Appearance', icon: <PaintBrushIcon className="h-4 w-4" /> },
  { id: 'notifications', label: 'Notifications', icon: <BellIcon className="h-4 w-4" /> },
  { id: 'security', label: 'Security', icon: <ShieldCheckIcon className="h-4 w-4" /> },
  { id: 'data', label: 'Data', icon: <TrashIcon className="h-4 w-4" /> },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-56 flex-shrink-0">
          <Card padding={false}>
            <nav className="p-2 space-y-0.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'text-white bg-brand-500/15 border border-brand-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>
          </Card>
        </div>

        {/* Content */}
        <div className="flex-1">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'profile' && <ProfileSettings />}
            {activeTab === 'servers' && <ServerSettings />}
            {activeTab === 'appearance' && <AppearanceSettings />}
            {activeTab === 'notifications' && <NotificationSettings />}
            {activeTab === 'security' && <SecuritySettings />}
            {activeTab === 'data' && <DataSettings />}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function ProfileSettings() {
  const { user } = useAuthStore();

  return (
    <Card>
      <SectionHeader title="Profile" subtitle="Manage your account information" />
      <div className="space-y-4">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl gradient-brand text-white text-2xl font-bold">
            {user?.name?.charAt(0) || 'A'}
          </div>
          <div>
            <p className="text-lg font-semibold text-white">{user?.name || 'Admin User'}</p>
            <p className="text-sm text-gray-500">{user?.email || 'admin@techsophy.com'}</p>
            <span className="badge-brand mt-1">{user?.role || 'admin'}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Full Name</label>
            <input type="text" className="input-field" defaultValue={user?.name || ''} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
            <input type="email" className="input-field" defaultValue={user?.email || ''} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Role</label>
          <select className="input-field" defaultValue={user?.role || 'admin'}>
            <option value="admin">Administrator</option>
            <option value="deployer">Deployer</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>

        <button className="btn-primary mt-4" onClick={() => toast.success('Profile updated!')}>
          <CheckIcon className="mr-2 inline h-4 w-4" />
          Save Changes
        </button>
      </div>
    </Card>
  );
}

function ServerSettings() {
  return (
    <Card>
      <SectionHeader title="Server Configuration" subtitle="Manage server connection settings" />
      <div className="space-y-6">
        <ServerForm label="Airflow Server" server={AIRFLOW_SERVER} />
        <div className="border-t border-white/5" />
        <ServerForm label="Staging Server" server={STAGING_SERVER} />
      </div>
    </Card>
  );
}

function ServerForm({ label, server }: { label: string; server: typeof AIRFLOW_SERVER }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-white mb-3">{label}</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Hostname</label>
          <input type="text" className="input-field text-sm py-2" defaultValue={server.host} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">IP Address</label>
          <input type="text" className="input-field text-sm py-2" defaultValue={server.ip} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Username</label>
          <input type="text" className="input-field text-sm py-2" defaultValue={server.username} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Port</label>
          <input type="text" className="input-field text-sm py-2" defaultValue={String(server.port)} />
        </div>
      </div>
      <button className="btn-secondary text-sm mt-3" onClick={() => toast.success('Connection tested!')}>
        Test Connection
      </button>
    </div>
  );
}

function AppearanceSettings() {
  const { isDark, toggleTheme } = useThemeStore();

  return (
    <Card>
      <SectionHeader title="Appearance" subtitle="Customize the application look and feel" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Dark Mode</p>
            <p className="text-xs text-gray-500">Toggle between light and dark themes</p>
          </div>
          <button
            onClick={toggleTheme}
            className={`relative w-12 h-6 rounded-full transition-colors ${isDark ? 'bg-brand-500' : 'bg-white/20'}`}
          >
            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${isDark ? 'translate-x-6' : ''}`} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Compact Mode</p>
            <p className="text-xs text-gray-500">Reduce spacing for denser UI</p>
          </div>
          <button className="relative w-12 h-6 rounded-full bg-white/20">
            <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white" />
          </button>
        </div>

        <div>
          <p className="text-sm font-medium text-white mb-3">Accent Color</p>
          <div className="flex gap-2">
            {['#667eea', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'].map((color) => (
              <button
                key={color}
                className="h-8 w-8 rounded-full border-2 border-transparent hover:border-white/50 transition-colors"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function NotificationSettings() {
  return (
    <Card>
      <SectionHeader title="Notifications" subtitle="Configure notification preferences" />
      <div className="space-y-4">
        {[
          { label: 'Deployment Success', desc: 'Notify when deployment completes successfully', enabled: true },
          { label: 'Deployment Failed', desc: 'Notify when deployment fails', enabled: true },
          { label: 'Server Offline', desc: 'Alert when a server goes offline', enabled: true },
          { label: 'Email Notifications', desc: 'Send email for critical events', enabled: false },
          { label: 'Slack Integration', desc: 'Post deployment status to Slack', enabled: false },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-white">{item.label}</p>
              <p className="text-xs text-gray-500">{item.desc}</p>
            </div>
            <button
              className={`relative w-12 h-6 rounded-full transition-colors ${item.enabled ? 'bg-brand-500' : 'bg-white/20'}`}
            >
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${item.enabled ? 'translate-x-6' : ''}`} />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SecuritySettings() {
  return (
    <Card>
      <SectionHeader title="Security" subtitle="Security and access settings" />
      <div className="space-y-6">
        <div>
          <h4 className="text-sm font-semibold text-white mb-3">Change Password</h4>
          <div className="space-y-3 max-w-md">
            <input type="password" className="input-field" placeholder="Current password" />
            <input type="password" className="input-field" placeholder="New password" />
            <input type="password" className="input-field" placeholder="Confirm new password" />
            <button className="btn-primary text-sm" onClick={() => toast.success('Password updated!')}>
              Update Password
            </button>
          </div>
        </div>

        <div className="border-t border-white/5 pt-6">
          <h4 className="text-sm font-semibold text-white mb-3">API Keys</h4>
          <div className="rounded-lg bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white font-mono">sdp_key_****...****7f3a</p>
                <p className="text-xs text-gray-500 mt-0.5">Created Dec 15, 2025</p>
              </div>
              <button className="btn-ghost text-red-400 text-sm">Revoke</button>
            </div>
          </div>
          <button className="btn-secondary text-sm mt-3">
            <KeyIcon className="mr-2 inline h-4 w-4" />
            Generate New Key
          </button>
        </div>

        <div className="border-t border-white/5 pt-6">
          <h4 className="text-sm font-semibold text-white mb-3">Two-Factor Authentication</h4>
          <p className="text-sm text-gray-500 mb-3">Add an extra layer of security to your account</p>
          <button className="btn-secondary text-sm">
            <ShieldCheckIcon className="mr-2 inline h-4 w-4" />
            Enable 2FA
          </button>
        </div>
      </div>
    </Card>
  );
}

function DataSettings() {
  const { history } = useDeploymentStore();
  const { clearAll } = useNotificationStore();

  return (
    <Card>
      <SectionHeader title="Data Management" subtitle="Manage application data" />
      <div className="space-y-6">
        <div className="rounded-lg bg-white/5 p-4 border border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Deployment History</p>
              <p className="text-xs text-gray-500">{history.length} records stored locally</p>
            </div>
            <button
              className="btn-ghost text-red-400 text-sm"
              onClick={() => {
                localStorage.removeItem('sdp-deployments');
                toast.success('Deployment history cleared. Refresh to apply.');
              }}
            >
              <TrashIcon className="mr-1 inline h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        </div>

        <div className="rounded-lg bg-white/5 p-4 border border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Notifications</p>
              <p className="text-xs text-gray-500">Clear all notification history</p>
            </div>
            <button
              className="btn-ghost text-red-400 text-sm"
              onClick={() => { clearAll(); toast.success('Notifications cleared!'); }}
            >
              <TrashIcon className="mr-1 inline h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        </div>

        <div className="rounded-lg bg-white/5 p-4 border border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Export All Data</p>
              <p className="text-xs text-gray-500">Download all deployment data as JSON</p>
            </div>
            <button
              className="btn-secondary text-sm"
              onClick={() => {
                const data = { history, exportedAt: new Date().toISOString() };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `sdp-data-export-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success('Data exported!');
              }}
            >
              Export JSON
            </button>
          </div>
        </div>

        <div className="border-t border-white/5 pt-6">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <InformationCircleIcon className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-400">Danger Zone</p>
              <p className="text-xs text-gray-400 mt-1">Resetting will clear all local data including history, preferences, and cached configurations.</p>
              <button
                className="mt-3 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium border border-red-500/30 hover:bg-red-500/30 transition-colors"
                onClick={() => {
                  localStorage.clear();
                  toast.success('All data cleared. Refreshing...');
                  setTimeout(() => window.location.reload(), 1000);
                }}
              >
                Reset All Data
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
