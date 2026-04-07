import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ServerStackIcon,
  SignalIcon,
  CpuChipIcon,
  CircleStackIcon,
  CloudIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { Card, SectionHeader, StatusBadge, ProgressBar } from '@/components/ui';
import { useServerStatusStore } from '@/stores';
import { AIRFLOW_SERVER, STAGING_SERVER, HDFS_CONFIG, AWS_CONFIG, HIVE_CONFIG } from '@/config/constants';

interface ServiceHealth {
  name: string;
  host: string;
  status: 'online' | 'offline' | 'degraded';
  latency: number;
  uptime: string;
  lastChecked: string;
  icon: React.ReactNode;
  color: string;
}

export default function Monitoring() {
  const { airflow, staging, setAirflowStatus, setStagingStatus } = useServerStatusStore();
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadServiceHealth();
  }, []);

  const loadServiceHealth = () => {
    setIsRefreshing(true);

    // Simulate service health checks
    setTimeout(() => {
      setServices([
        {
          name: 'Airflow Server',
          host: AIRFLOW_SERVER.host,
          status: 'online',
          latency: 45,
          uptime: '99.9%',
          lastChecked: new Date().toISOString(),
          icon: <ServerStackIcon className="h-5 w-5" />,
          color: 'emerald',
        },
        {
          name: 'Staging Server',
          host: STAGING_SERVER.host,
          status: 'online',
          latency: 62,
          uptime: '99.7%',
          lastChecked: new Date().toISOString(),
          icon: <CpuChipIcon className="h-5 w-5" />,
          color: 'blue',
        },
        {
          name: 'HDFS Cluster',
          host: 'sdpplynn01.techsophy.com',
          status: 'online',
          latency: 120,
          uptime: '99.5%',
          lastChecked: new Date().toISOString(),
          icon: <CircleStackIcon className="h-5 w-5" />,
          color: 'purple',
        },
        {
          name: 'AWS S3',
          host: `${AWS_CONFIG.SOURCE_REGION_NAME}`,
          status: 'online',
          latency: 35,
          uptime: '99.99%',
          lastChecked: new Date().toISOString(),
          icon: <CloudIcon className="h-5 w-5" />,
          color: 'amber',
        },
        {
          name: 'Hive Metastore',
          host: 'sdpplystg01.techsophy.com',
          status: 'online',
          latency: 88,
          uptime: '99.3%',
          lastChecked: new Date().toISOString(),
          icon: <CircleStackIcon className="h-5 w-5" />,
          color: 'cyan',
        },
        {
          name: 'Git Server',
          host: 'git.techsophy.com',
          status: 'online',
          latency: 52,
          uptime: '99.8%',
          lastChecked: new Date().toISOString(),
          icon: <SignalIcon className="h-5 w-5" />,
          color: 'orange',
        },
      ]);

      setAirflowStatus('online');
      setStagingStatus('online');
      setIsRefreshing(false);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Infrastructure Health</h2>
          <p className="text-sm text-gray-500">Real-time monitoring of all connected services</p>
        </div>
        <button
          onClick={loadServiceHealth}
          disabled={isRefreshing}
          className="btn-secondary text-sm"
        >
          <ArrowPathIcon className={`mr-2 inline h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      {/* Overall Status */}
      <Card className="gradient-brand-subtle border-brand-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20">
              <CheckCircleIcon className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">All Systems Operational</p>
              <p className="text-sm text-gray-400">
                {services.filter((s) => s.status === 'online').length}/{services.length} services healthy
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-emerald-400">99.7%</p>
            <p className="text-xs text-gray-500">Overall Uptime</p>
          </div>
        </div>
      </Card>

      {/* Service Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service, index) => (
          <motion.div
            key={service.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <ServiceCard service={service} />
          </motion.div>
        ))}
      </div>

      {/* Connection Details */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeader title="Server Configuration" subtitle="SSH connection details" />
          <div className="space-y-4">
            <ConnectionInfo
              label="Airflow Server"
              details={[
                { key: 'Host', value: AIRFLOW_SERVER.host },
                { key: 'IP', value: AIRFLOW_SERVER.ip },
                { key: 'User', value: AIRFLOW_SERVER.username },
                { key: 'Port', value: String(AIRFLOW_SERVER.port) },
              ]}
            />
            <ConnectionInfo
              label="Staging Server"
              details={[
                { key: 'Host', value: STAGING_SERVER.host },
                { key: 'IP', value: STAGING_SERVER.ip },
                { key: 'User', value: STAGING_SERVER.username },
                { key: 'Port', value: String(STAGING_SERVER.port) },
              ]}
            />
          </div>
        </Card>

        <Card>
          <SectionHeader title="Data Infrastructure" subtitle="HDFS & Hive configuration" />
          <div className="space-y-4">
            <ConnectionInfo
              label="HDFS Cluster"
              details={[
                { key: 'URI', value: HDFS_CONFIG.URI },
                { key: 'Web URL', value: HDFS_CONFIG.URL },
                { key: 'User', value: HDFS_CONFIG.USER },
                { key: 'Namenode', value: HDFS_CONFIG.NAMENODE_URL },
              ]}
            />
            <ConnectionInfo
              label="Hive Metastore"
              details={[
                { key: 'JDBC URL', value: HIVE_CONFIG.JDBC_URL },
                { key: 'Username', value: HIVE_CONFIG.USERNAME },
              ]}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function ServiceCard({ service }: { service: ServiceHealth }) {
  const statusColors = {
    online: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-500' },
    offline: { bg: 'bg-red-500/20', text: 'text-red-400', dot: 'bg-red-500' },
    degraded: { bg: 'bg-amber-500/20', text: 'text-amber-400', dot: 'bg-amber-500' },
  };

  const colors = statusColors[service.status];

  return (
    <Card hover>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors.bg} ${colors.text}`}>
            {service.icon}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{service.name}</p>
            <p className="text-xs text-gray-500">{service.host}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${colors.dot} ${service.status === 'online' ? '' : 'animate-pulse'}`} />
          <span className={`text-xs font-medium ${colors.text}`}>
            {service.status.charAt(0).toUpperCase() + service.status.slice(1)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-white/5 p-2.5">
          <p className="text-xs text-gray-500">Latency</p>
          <p className="text-sm font-semibold text-white">{service.latency}ms</p>
        </div>
        <div className="rounded-lg bg-white/5 p-2.5">
          <p className="text-xs text-gray-500">Uptime</p>
          <p className="text-sm font-semibold text-white">{service.uptime}</p>
        </div>
      </div>
    </Card>
  );
}

function ConnectionInfo({ label, details }: { label: string; details: { key: string; value: string }[] }) {
  return (
    <div className="rounded-lg bg-white/5 p-4 border border-white/5">
      <p className="text-sm font-semibold text-white mb-3">{label}</p>
      <div className="space-y-2">
        {details.map((d) => (
          <div key={d.key} className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{d.key}</span>
            <span className="text-xs font-mono text-gray-300 text-right break-all max-w-[60%]">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
