import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  ClockIcon,
  RocketLaunchIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { Card, SectionHeader, StatusBadge, EmptyState } from '@/components/ui';
import { useDeploymentStore } from '@/stores';
import type { DeploymentResult } from '@/types';

export default function Deployments() {
  const { history } = useDeploymentStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dbFilter, setDbFilter] = useState<string>('all');

  const filtered = history.filter((dep) => {
    const matchesSearch =
      !search ||
      dep.organization.toLowerCase().includes(search.toLowerCase()) ||
      dep.application.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || dep.status === statusFilter;
    const matchesDb = dbFilter === 'all' || dep.databaseType === dbFilter;
    return matchesSearch && matchesStatus && matchesDb;
  });

  const dbTypes = [...new Set(history.map((d) => d.databaseType))];

  const exportCSV = () => {
    const headers = ['Organization', 'Application', 'Database', 'Status', 'Files', 'Date', 'Deployed By'];
    const rows = filtered.map((d) => [
      d.organization,
      d.application,
      d.databaseType,
      d.status,
      d.metrics?.totalFiles || 0,
      new Date(d.completedAt).toLocaleString(),
      d.deployedBy,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deployments-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Search by org or app name..."
                className="input-field pl-10 py-2.5"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="input-field w-auto py-2.5"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="success">Success</option>
              <option value="partial">Partial</option>
              <option value="failed">Failed</option>
            </select>
            <select
              className="input-field w-auto py-2.5"
              value={dbFilter}
              onChange={(e) => setDbFilter(e.target.value)}
            >
              <option value="all">All Types</option>
              {dbTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <button onClick={exportCSV} className="btn-secondary text-sm">
            <ArrowDownTrayIcon className="mr-2 inline h-4 w-4" />
            Export CSV
          </button>
        </div>
      </Card>

      {/* Results */}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClockIcon className="h-8 w-8" />}
            title={history.length === 0 ? 'No deployments yet' : 'No matching deployments'}
            description={
              history.length === 0
                ? 'Deploy your first pipeline to see history here.'
                : 'Try adjusting your search or filters.'
            }
            action={
              history.length === 0 ? (
                <Link to="/pipeline" className="btn-primary text-sm">
                  <RocketLaunchIcon className="mr-2 inline h-4 w-4" />
                  Deploy Pipeline
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((dep, index) => (
            <DeploymentCard key={dep.id || index} deployment={dep} index={index} />
          ))}
        </div>
      )}

      {/* Stats Footer */}
      {history.length > 0 && (
        <Card>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Showing {filtered.length} of {history.length} deployments
            </span>
            <div className="flex gap-4">
              <span className="text-emerald-400">
                {history.filter((d) => d.status === 'success').length} successful
              </span>
              <span className="text-amber-400">
                {history.filter((d) => d.status === 'partial').length} partial
              </span>
              <span className="text-red-400">
                {history.filter((d) => d.status === 'failed').length} failed
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function DeploymentCard({ deployment: dep, index }: { deployment: DeploymentResult; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      <Link to={`/deployments/${dep.id}`}>
        <Card hover className="cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                dep.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                dep.status === 'partial' ? 'bg-amber-500/20 text-amber-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                <RocketLaunchIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {dep.organization}/{dep.application}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {dep.gitUrl ? `Branch: ${dep.branch}` : 'Local deploy'} • {dep.deployedBy || 'Admin'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right hidden sm:block">
                <div className="flex gap-3 text-xs text-gray-400">
                  <span>{dep.metrics?.taskScripts || 0} scripts</span>
                  <span>{dep.metrics?.dagFiles || 0} DAGs</span>
                  <span>{dep.metrics?.sparkJobs || 0} spark</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={dep.status} />
                <span className="badge-brand">{dep.databaseType}</span>
              </div>
              <span className="text-xs text-gray-500 min-w-[120px] text-right">
                {new Date(dep.completedAt).toLocaleString()}
              </span>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
