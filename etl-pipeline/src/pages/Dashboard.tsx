import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  RocketLaunchIcon,
  CheckCircleIcon,
  BuildingOfficeIcon,
  CircleStackIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { StatCard, Card, SectionHeader, StatusBadge, EmptyState, Skeleton } from '@/components/ui';
import { useDashboardStore, useDeploymentStore } from '@/stores';
import { getDashboardStats } from '@/services/api';

export default function Dashboard() {
  const { stats, isLoading, setStats, setLoading } = useDashboardStore();
  const { history } = useDeploymentStore();

  useEffect(() => {
    setLoading(true);
    getDashboardStats().then((data) => {
      setStats({
        ...data,
        totalDeployments: data.totalDeployments + history.length,
        recentDeployments: history.slice(0, 5) as any,
      });
    });
  }, []);

  if (isLoading && !stats) {
    return <DashboardSkeleton />;
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Welcome Banner */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl gradient-brand p-8"
      >
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white">
            Welcome to SDP Pipeline Studio
          </h1>
          <p className="mt-2 max-w-xl text-white/80">
            Deploy and manage ETL pipelines across your infrastructure with automated
            Git integration, Airflow DAG deployment, and real-time monitoring.
          </p>
          <Link
            to="/pipeline"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/20 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/30 transition-colors"
          >
            <RocketLaunchIcon className="h-4 w-4" />
            Deploy New Pipeline
          </Link>
        </div>
        {/* Decorative elements */}
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -right-4 bottom-0 h-24 w-24 rounded-full bg-white/5" />
        <div className="absolute right-32 top-4 h-16 w-16 rounded-full bg-white/5" />
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Deployments"
          value={stats?.totalDeployments || 0}
          change="+12 this week"
          changeType="positive"
          icon={<RocketLaunchIcon className="h-6 w-6" />}
          gradient="from-brand-500/20 to-purple-500/20"
        />
        <StatCard
          title="Success Rate"
          value={`${stats?.successRate || 0}%`}
          change="+2.1% improvement"
          changeType="positive"
          icon={<CheckCircleIcon className="h-6 w-6" />}
          gradient="from-emerald-500/20 to-teal-500/20"
        />
        <StatCard
          title="Active Organizations"
          value={stats?.activeOrgs || 0}
          change="3 new this month"
          changeType="positive"
          icon={<BuildingOfficeIcon className="h-6 w-6" />}
          gradient="from-amber-500/20 to-orange-500/20"
        />
        <StatCard
          title="Total Pipelines"
          value={stats?.totalPipelines || 0}
          change="5 active"
          changeType="neutral"
          icon={<CircleStackIcon className="h-6 w-6" />}
          gradient="from-cyan-500/20 to-blue-500/20"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Deployment Trend */}
        <Card className="lg:col-span-2">
          <SectionHeader
            title="Deployment Trend"
            subtitle="Last 30 days"
            action={
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Total
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Success
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Failed
                </span>
              </div>
            }
          />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.deploymentTrend || []}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#667eea" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#667eea" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  tickFormatter={(d) => new Date(d).getDate().toString()}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <ReTooltip
                  contentStyle={{
                    backgroundColor: '#1e1e1e',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="deployments"
                  stroke="#667eea"
                  fill="url(#colorTotal)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="success"
                  stroke="#10b981"
                  fill="url(#colorSuccess)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Top Organizations */}
        <Card>
          <SectionHeader title="Top Organizations" subtitle="By deployment count" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stats?.topOrganizations || []}
                layout="vertical"
                margin={{ left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fill: '#e5e7eb', fontSize: 11 }}
                  width={90}
                  axisLine={false}
                  tickLine={false}
                />
                <ReTooltip
                  contentStyle={{
                    backgroundColor: '#1e1e1e',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="deployments" fill="#667eea" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Recent Deployments */}
      <Card>
        <SectionHeader
          title="Recent Deployments"
          subtitle="Latest pipeline deployments"
          action={
            <Link to="/deployments" className="text-sm text-brand-400 hover:text-brand-300 font-medium">
              View All →
            </Link>
          }
        />
        {history.length === 0 ? (
          <EmptyState
            icon={<ClockIcon className="h-8 w-8" />}
            title="No deployments yet"
            description="Deploy your first pipeline to see the history here."
            action={
              <Link to="/pipeline" className="btn-primary text-sm">
                <RocketLaunchIcon className="mr-2 inline h-4 w-4" />
                Deploy Pipeline
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Pipeline
                  </th>
                  <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Database
                  </th>
                  <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Files
                  </th>
                  <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.slice(0, 8).map((dep, i) => (
                  <motion.tr
                    key={dep.id || i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="py-3 pr-4">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {dep.organization}/{dep.application}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {dep.gitUrl ? new URL(dep.gitUrl).pathname.split('/').pop() : 'N/A'}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="badge-brand">{dep.databaseType}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={dep.status} />
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-sm text-gray-300">
                        {dep.metrics?.totalFiles || 0} files
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="text-xs text-gray-500">
                        {new Date(dep.completedAt).toLocaleString()}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <QuickActionCard
          title="Deploy Pipeline"
          description="Configure and deploy a new ETL pipeline"
          icon={<RocketLaunchIcon className="h-6 w-6" />}
          to="/pipeline"
          gradient="from-brand-500 to-purple-600"
        />
        <QuickActionCard
          title="View Deployments"
          description="Browse deployment history and logs"
          icon={<ClockIcon className="h-6 w-6" />}
          to="/deployments"
          gradient="from-emerald-500 to-teal-600"
        />
        <QuickActionCard
          title="Infrastructure"
          description="Monitor server health and resources"
          icon={<ArrowTrendingUpIcon className="h-6 w-6" />}
          to="/monitoring"
          gradient="from-amber-500 to-orange-600"
        />
      </div>
    </motion.div>
  );
}

// ============================================================================
// Quick Action Card
// ============================================================================

function QuickActionCard({
  title,
  description,
  icon,
  to,
  gradient,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  to: string;
  gradient: string;
}) {
  return (
    <Link to={to}>
      <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        className="glass-card p-6 cursor-pointer group"
      >
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white mb-4 group-hover:scale-110 transition-transform`}
        >
          {icon}
        </div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </motion.div>
    </Link>
  );
}

// ============================================================================
// Dashboard Skeleton
// ============================================================================

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <Skeleton className="h-40 w-full" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <Skeleton className="col-span-2 h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
