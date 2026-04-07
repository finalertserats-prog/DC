import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  FolderOpenIcon,
  CodeBracketIcon,
  CpuChipIcon,
  GlobeAltIcon,
  UserIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';
import { Card, SectionHeader, StatusBadge, Stepper, EmptyState } from '@/components/ui';
import { useDeploymentStore } from '@/stores';

export default function DeploymentDetail() {
  const { id } = useParams();
  const { history } = useDeploymentStore();

  const deployment = history.find((d) => d.id === id);

  if (!deployment) {
    return (
      <div className="space-y-6">
        <Link to="/deployments" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
          <ArrowLeftIcon className="h-4 w-4" /> Back to Deployments
        </Link>
        <Card>
          <EmptyState
            icon={<DocumentTextIcon className="h-8 w-8" />}
            title="Deployment not found"
            description="This deployment may have been removed or the ID is invalid."
            action={<Link to="/deployments" className="btn-primary text-sm">View All Deployments</Link>}
          />
        </Card>
      </div>
    );
  }

  const dep = deployment;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back Link */}
      <Link to="/deployments" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
        <ArrowLeftIcon className="h-4 w-4" /> Back to Deployments
      </Link>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-xl font-bold text-white">
                  {dep.organization}/{dep.application}
                </h1>
                <StatusBadge status={dep.status} />
                <span className="badge-brand">{dep.databaseType}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <UserIcon className="h-3.5 w-3.5" /> {dep.deployedBy}
                </span>
                <span className="flex items-center gap-1">
                  <CalendarIcon className="h-3.5 w-3.5" /> {new Date(dep.completedAt).toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                  <ClockIcon className="h-3.5 w-3.5" /> {dep.metrics.duration}s
                </span>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard icon={<FolderOpenIcon className="h-5 w-5" />} label="Directories" value={dep.metrics.directories} color="text-purple-400" />
        <MetricCard icon={<CodeBracketIcon className="h-5 w-5" />} label="TaskScripts" value={dep.metrics.taskScripts} color="text-brand-400" />
        <MetricCard icon={<DocumentTextIcon className="h-5 w-5" />} label="DAG Files" value={dep.metrics.dagFiles} color="text-emerald-400" />
        <MetricCard icon={<CpuChipIcon className="h-5 w-5" />} label="Spark Jobs" value={dep.metrics.sparkJobs} color="text-amber-400" />
      </div>

      {/* Steps Timeline */}
      <Card>
        <SectionHeader title="Deployment Steps" />
        {dep.steps && dep.steps.length > 0 ? (
          <div className="space-y-4">
            {dep.steps.map((step, i) => (
              <div
                key={step.id}
                className={`flex items-start gap-4 p-4 rounded-lg border ${
                  step.status === 'success' ? 'border-emerald-500/20 bg-emerald-500/5' :
                  step.status === 'error' ? 'border-red-500/20 bg-red-500/5' :
                  'border-white/5 bg-white/[2%]'
                }`}
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${
                  step.status === 'success' ? 'bg-emerald-500/20' :
                  step.status === 'error' ? 'bg-red-500/20' : 'bg-white/10'
                }`}>
                  {step.status === 'success' ? (
                    <CheckCircleIcon className="h-4 w-4 text-emerald-400" />
                  ) : step.status === 'error' ? (
                    <XCircleIcon className="h-4 w-4 text-red-400" />
                  ) : (
                    <span className="text-xs font-bold text-gray-500">{step.id}</span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">{step.name}</p>
                    {step.metrics && (
                      <span className="text-xs text-gray-500">
                        {step.metrics.filesDeployed !== undefined && `${step.metrics.filesDeployed} files`}
                        {step.metrics.dirsCreated !== undefined && `${step.metrics.dirsCreated} directories`}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
                  {step.logs && step.logs.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {step.logs.map((log, j) => (
                        <p key={j} className={`text-xs font-mono ${
                          log.level === 'success' ? 'text-emerald-400' :
                          log.level === 'error' ? 'text-red-400' :
                          log.level === 'warning' ? 'text-amber-400' : 'text-gray-400'
                        }`}>
                          [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No step details available</p>
        )}
      </Card>

      {/* Deployment Paths */}
      <Card>
        <SectionHeader title="Deployment Locations" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PathCard label="Airflow DAGs" path={`/mnt/dags_root/${dep.organization}/`} icon={<DocumentTextIcon className="h-4 w-4" />} />
          <PathCard label="Task Scripts" path={`/mnt/task_scripts_root/${dep.organization}/${dep.application}/${dep.databaseType}/`} icon={<CodeBracketIcon className="h-4 w-4" />} />
          <PathCard label="Spark Jobs" path={`/home/tsloader/spark_jobs/${dep.organization}/raw/general/csvtohudi/${dep.application}/`} icon={<CpuChipIcon className="h-4 w-4" />} />
          <PathCard label="Git Repository" path={dep.gitUrl || 'N/A'} icon={<GlobeAltIcon className="h-4 w-4" />} />
        </div>
      </Card>
    </div>
  );
}

function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <Card className="text-center">
      <div className={`mx-auto mb-2 ${color}`}>{icon}</div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </Card>
  );
}

function PathCard({ label, path, icon }: { label: string; path: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white/5 p-3 border border-white/5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-brand-400">{icon}</span>
        <p className="text-xs font-medium text-gray-400">{label}</p>
      </div>
      <p className="text-sm font-mono text-white break-all">{path}</p>
    </div>
  );
}
