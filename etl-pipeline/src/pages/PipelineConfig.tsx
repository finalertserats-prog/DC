import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  RocketLaunchIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ServerStackIcon,
  CircleStackIcon,
  CloudIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  CpuChipIcon,
  FolderOpenIcon,
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
  InformationCircleIcon,
  ShieldCheckIcon,
  XCircleIcon,
  ExclamationCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline';
import { Card, SectionHeader, Stepper, ProgressBar, StatusBadge } from '@/components/ui';
import { usePipelineStore, useDeploymentStore, useNotificationStore } from '@/stores';
import { DEPLOYMENT_STEPS, DB_TYPES } from '@/config/constants';
import type { MongoDBConfig, RDBMSConfig, S3Config, DeploymentStep, DeploymentResult, LogEntry, DatabaseType } from '@/types';

type WizardStep = 'config' | 'review' | 'deploy';

export default function PipelineConfig() {
  const { config, updateConfig, resetConfig } = usePipelineStore();
  const { isDeploying, steps, startDeployment, updateStep, completeDeployment, resetDeployment } = useDeploymentStore();
  const { addNotification } = useNotificationStore();
  const [wizardStep, setWizardStep] = useState<WizardStep>('config');
  const [showPasswords, setShowPasswords] = useState(false);
  const [gitUsername, setGitUsername] = useState('');
  const [gitToken, setGitToken] = useState('');
  const [useGitAuth, setUseGitAuth] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [testingConnection, setTestingConnection] = useState(false);

  // ============================================================================
  // Validation
  // ============================================================================

  const validate = (): string[] => {
    const errors: string[] = [];
    if (!config.organization.trim()) errors.push('Organization name is required');
    if (!config.application.trim()) errors.push('Application name is required');
    if (!config.databaseType && config.sourceType === 'database') errors.push('Database type is required');

    if (config.sourceType === 'database' && config.dbConfig) {
      if (config.dbConfig.type === 'mongodb') {
        const mc = config.dbConfig as MongoDBConfig;
        if (!mc.connectionString) errors.push('MongoDB connection string is required');
        if (!mc.dbName) errors.push('Database name is required');
        if (!mc.collectionName) errors.push('Collection name is required');
      } else if (config.dbConfig.type === 'rdbms') {
        const rc = config.dbConfig as RDBMSConfig;
        if (!rc.username) errors.push('Database username is required');
        if (!rc.password) errors.push('Database password is required');
        if (!rc.host) errors.push('Database host is required');
        if (!rc.port) errors.push('Database port is required');
        if (!rc.dbName) errors.push('Database name is required');
      }
    } else if (config.sourceType === 's3' && config.dbConfig) {
      const sc = config.dbConfig as S3Config;
      if (!sc.s3Bucket) errors.push('S3 bucket name is required');
    }

    if (useGitAuth) {
      if (!gitUsername) errors.push('Git username is required');
      if (!gitToken) errors.push('Git token is required');
      if (gitToken && !gitToken.startsWith('glpat-')) errors.push('Git token should start with glpat-');
    }

    return errors;
  };

  const handleValidate = () => {
    const errors = validate();
    setValidationErrors(errors);
    if (errors.length === 0) {
      toast.success('Configuration validated successfully!');
      setWizardStep('review');
    } else {
      toast.error(`${errors.length} validation error(s) found`);
    }
  };

  // ============================================================================
  // Test Source Connection
  // ============================================================================

  const handleTestConnection = async () => {
    if (!config.dbConfig) {
      toast.error('Please fill in connection details first');
      return;
    }

    setTestingConnection(true);
    try {
      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dbType: config.databaseType || (config.sourceType === 's3' ? 's3' : ''),
          dbConfig: config.dbConfig,
        }),
      });

      const result = await response.json();
      if (result.success) {
        toast.success(result.message, { duration: 4000 });
      } else {
        toast.error(result.message, { duration: 5000 });
      }
    } catch (err: any) {
      toast.error(`Connection test failed: ${err.message}`);
    } finally {
      setTestingConnection(false);
    }
  };

  // ============================================================================
  // Real Deployment (via backend SSE)
  // ============================================================================

  const handleDeploy = async () => {
    const errors = validate();
    if (errors.length > 0) {
      setValidationErrors(errors);
      toast.error('Fix validation errors before deploying');
      return;
    }

    setWizardStep('deploy');

    const deploySteps: DeploymentStep[] = DEPLOYMENT_STEPS.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      status: 'pending' as const,
      progress: 0,
      logs: [],
    }));

    startDeployment(deploySteps);

    try {
      // 1. Send deployment request to backend
      const deployPayload = {
        organization: config.organization,
        application: config.application,
        sourceType: config.sourceType,
        databaseType: config.databaseType,
        dbConfig: config.dbConfig,
        gitUsername: useGitAuth ? gitUsername : undefined,
        gitToken: useGitAuth ? gitToken : undefined,
      };

      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deployPayload),
      });

      const { deploymentId } = await response.json();

      if (!deploymentId) {
        toast.error('Failed to start deployment');
        return;
      }

      // 2. Listen to SSE stream for real-time progress
      const eventSource = new EventSource(`/api/deploy/${deploymentId}/stream`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'step') {
          const stepId = data.step;
          const logs: LogEntry[] = (data.logs || []).map((msg: string) => ({
            timestamp: new Date().toISOString(),
            level: data.status === 'error' ? 'error' : data.status === 'success' ? 'success' : 'info',
            message: msg,
          }));

          if (data.status === 'running') {
            updateStep(stepId, {
              status: 'running',
              startedAt: new Date().toISOString(),
              progress: data.progress ?? 50,
              logs: [{ timestamp: new Date().toISOString(), level: 'info', message: data.message }],
            });
          } else if (data.status === 'success') {
            updateStep(stepId, {
              status: 'success',
              progress: 100,
              completedAt: new Date().toISOString(),
              logs: [{ timestamp: new Date().toISOString(), level: 'success', message: data.message }, ...logs],
              metrics: data.metrics,
            });
          } else if (data.status === 'error') {
            updateStep(stepId, {
              status: 'error',
              progress: 100,
              completedAt: new Date().toISOString(),
              logs: [{ timestamp: new Date().toISOString(), level: 'error', message: data.message }, ...logs],
              metrics: data.metrics,
            });
          }
        }

        if (data.type === 'complete') {
          eventSource.close();

          const finalStatus = data.status === 'success' ? 'success' : 'failed';

          const result: DeploymentResult = {
            id: deploymentId,
            organization: config.organization,
            application: config.application,
            databaseType: config.databaseType || 's3',
            status: finalStatus as 'success' | 'failed',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            gitUrl: `https://git.techsophy.com/datalake/source_${config.organization}/${config.application}_ingest`,
            branch: 'dev',
            steps: deploySteps,
            metrics: data.metrics || {
              totalFiles: 0, successFiles: 0, failedFiles: 0,
              taskScripts: 0, dagFiles: 0, sparkJobs: 0, directories: 0, duration: 0,
            },
            deployedBy: 'Admin User',
          };

          completeDeployment(result);

          if (finalStatus === 'success') {
            addNotification({
              type: 'success',
              title: 'Deployment Complete',
              message: data.message || `${config.organization}/${config.application} deployed successfully`,
            });
            toast.success(data.message || 'Pipeline deployed successfully!');
          } else {
            addNotification({
              type: 'error',
              title: 'Deployment Failed',
              message: data.error || data.message || 'Deployment failed',
            });
            toast.error(data.error || data.message || 'Deployment failed');
          }
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        toast.error('Lost connection to deployment server');
      };

    } catch (err: any) {
      toast.error(err.message || 'Deployment request failed');
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Wizard Steps Indicator */}
      <div className="flex items-center justify-center gap-8 mb-8">
        {(['config', 'review', 'deploy'] as const).map((step, i) => (
          <div key={step} className="flex items-center gap-3">
            <button
              onClick={() => !isDeploying && setWizardStep(step)}
              disabled={isDeploying}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                wizardStep === step
                  ? 'gradient-brand text-white shadow-glow'
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
                {i + 1}
              </span>
              {step === 'config' ? 'Configure' : step === 'review' ? 'Review' : 'Deploy'}
            </button>
            {i < 2 && <div className="w-12 h-px bg-white/10" />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {wizardStep === 'config' && (
          <motion.div
            key="config"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <ConfigStep
              config={config}
              updateConfig={updateConfig}
              useGitAuth={useGitAuth}
              setUseGitAuth={setUseGitAuth}
              gitUsername={gitUsername}
              setGitUsername={setGitUsername}
              gitToken={gitToken}
              setGitToken={setGitToken}
              showPasswords={showPasswords}
              setShowPasswords={setShowPasswords}
              validationErrors={validationErrors}
              onValidate={handleValidate}
              onReset={resetConfig}
              testingConnection={testingConnection}
              onTestConnection={handleTestConnection}
            />
          </motion.div>
        )}

        {wizardStep === 'review' && (
          <motion.div
            key="review"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <ReviewStep
              config={config}
              onBack={() => setWizardStep('config')}
              onDeploy={handleDeploy}
            />
          </motion.div>
        )}

        {wizardStep === 'deploy' && (
          <motion.div
            key="deploy"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <DeployStep
              steps={steps}
              isDeploying={isDeploying}
              config={config}
              onNewDeployment={() => {
                resetConfig();
                resetDeployment();
                setWizardStep('config');
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// Config Step
// ============================================================================

function ConfigStep({
  config,
  updateConfig,
  useGitAuth,
  setUseGitAuth,
  gitUsername,
  setGitUsername,
  gitToken,
  setGitToken,
  showPasswords,
  setShowPasswords,
  validationErrors,
  onValidate,
  onReset,
  testingConnection,
  onTestConnection,
}: any) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Left Column - Basic Info */}
      <Card>
        <SectionHeader title="Basic Information" subtitle="Organization and application details" />

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Organization Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g., techsophy, awgment"
              value={config.organization}
              onChange={(e) => updateConfig({ organization: e.target.value.toLowerCase().replace(/\s/g, '_') })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Application Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g., codeiq, biometric"
              value={config.application}
              onChange={(e) => updateConfig({ application: e.target.value.toLowerCase().replace(/\s/g, '_') })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Source Type <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => updateConfig({ sourceType: 'database', dbConfig: null, databaseType: null })}
                className={`flex items-center gap-3 rounded-xl p-4 border transition-all ${
                  config.sourceType === 'database'
                    ? 'border-brand-500 bg-brand-500/10 text-white'
                    : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                }`}
              >
                <CircleStackIcon className="h-5 w-5" />
                <div className="text-left">
                  <p className="text-sm font-medium">Database</p>
                  <p className="text-xs opacity-60">MongoDB, PostgreSQL, MySQL</p>
                </div>
              </button>
              <button
                onClick={() =>
                  updateConfig({
                    sourceType: 's3',
                    databaseType: null,
                    dbConfig: { type: 's3', s3Bucket: 'gayatri2datalake', s3Path: '' } as S3Config,
                  })
                }
                className={`flex items-center gap-3 rounded-xl p-4 border transition-all ${
                  config.sourceType === 's3'
                    ? 'border-brand-500 bg-brand-500/10 text-white'
                    : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                }`}
              >
                <CloudIcon className="h-5 w-5" />
                <div className="text-left">
                  <p className="text-sm font-medium">S3</p>
                  <p className="text-xs opacity-60">Amazon S3 bucket</p>
                </div>
              </button>
            </div>
          </div>

          {config.sourceType === 'database' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Database Type <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(DB_TYPES).slice(0, 3).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      const dbType = key as DatabaseType;
                      updateConfig({
                        databaseType: dbType,
                        dbConfig:
                          dbType === 'mongodb'
                            ? ({ type: 'mongodb', connectionString: '', dbName: '', collectionName: '' } as MongoDBConfig)
                            : ({ type: 'rdbms', rdbmsType: dbType, username: '', password: '', host: '', port: dbType === 'postgres' ? '5432' : '3306', dbName: '', tableNames: '' } as RDBMSConfig),
                      });
                    }}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                      config.databaseType === key
                        ? 'border-brand-500 bg-brand-500/10 text-white'
                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Git Authentication */}
          <div className="border-t border-white/5 pt-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-300">Git Authentication</label>
              <button
                onClick={() => setUseGitAuth(!useGitAuth)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  useGitAuth ? 'bg-brand-500' : 'bg-white/20'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    useGitAuth ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            {useGitAuth && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="space-y-3"
              >
                <input
                  type="text"
                  className="input-field"
                  placeholder="GitLab Username"
                  value={gitUsername}
                  onChange={(e) => setGitUsername(e.target.value)}
                />
                <div className="relative">
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    className="input-field pr-10"
                    placeholder="Personal Access Token (glpat-...)"
                    value={gitToken}
                    onChange={(e) => setGitToken(e.target.value)}
                  />
                  <button
                    onClick={() => setShowPasswords(!showPasswords)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                  >
                    {showPasswords ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </Card>

      {/* Right Column - Connection Details */}
      <div className="space-y-6">
        <Card>
          <SectionHeader title="Source Connection" subtitle="Configure your data source" />

          {config.sourceType === 's3' && config.dbConfig?.type === 's3' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <CloudIcon className="h-5 w-5 text-blue-400" />
                <p className="text-sm text-blue-300">S3 source — Database extraction steps will be skipped</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">S3 Bucket Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={(config.dbConfig as S3Config).s3Bucket}
                  onChange={(e) => updateConfig({ dbConfig: { ...config.dbConfig, s3Bucket: e.target.value } as S3Config })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">S3 Path</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g., raw/data/files/"
                  value={(config.dbConfig as S3Config).s3Path}
                  onChange={(e) => updateConfig({ dbConfig: { ...config.dbConfig, s3Path: e.target.value } as S3Config })}
                />
              </div>
            </div>
          )}

          {config.databaseType === 'mongodb' && config.dbConfig?.type === 'mongodb' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CircleStackIcon className="h-5 w-5 text-emerald-400" />
                <p className="text-sm text-emerald-300">MongoDB Configuration</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Connection String</label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  className="input-field"
                  placeholder="mongodb://username:password@host:port"
                  value={(config.dbConfig as MongoDBConfig).connectionString}
                  onChange={(e) => updateConfig({ dbConfig: { ...config.dbConfig, connectionString: e.target.value } as MongoDBConfig })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Database Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={(config.dbConfig as MongoDBConfig).dbName}
                  onChange={(e) => updateConfig({ dbConfig: { ...config.dbConfig, dbName: e.target.value } as MongoDBConfig })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Collection Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={(config.dbConfig as MongoDBConfig).collectionName}
                  onChange={(e) => updateConfig({ dbConfig: { ...config.dbConfig, collectionName: e.target.value } as MongoDBConfig })}
                />
              </div>
              <button
                onClick={onTestConnection}
                disabled={testingConnection}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 hover:border-emerald-500/50 transition-all duration-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testingConnection ? (
                  <>
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    Testing Connection...
                  </>
                ) : (
                  <>
                    <ServerStackIcon className="h-4 w-4" />
                    Test Connection
                  </>
                )}
              </button>
            </div>
          )}

          {config.dbConfig?.type === 'rdbms' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <CircleStackIcon className="h-5 w-5 text-amber-400" />
                <p className="text-sm text-amber-300">{(config.databaseType || '').toUpperCase()} Configuration</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
                  <input type="text" className="input-field" value={(config.dbConfig as RDBMSConfig).username} onChange={(e) => updateConfig({ dbConfig: { ...config.dbConfig, username: e.target.value } as RDBMSConfig })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
                  <input type={showPasswords ? 'text' : 'password'} className="input-field" value={(config.dbConfig as RDBMSConfig).password} onChange={(e) => updateConfig({ dbConfig: { ...config.dbConfig, password: e.target.value } as RDBMSConfig })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Host</label>
                  <input type="text" className="input-field" value={(config.dbConfig as RDBMSConfig).host} onChange={(e) => updateConfig({ dbConfig: { ...config.dbConfig, host: e.target.value } as RDBMSConfig })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Port</label>
                  <input type="text" className="input-field" value={(config.dbConfig as RDBMSConfig).port} onChange={(e) => updateConfig({ dbConfig: { ...config.dbConfig, port: e.target.value } as RDBMSConfig })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Database Name</label>
                <input type="text" className="input-field" value={(config.dbConfig as RDBMSConfig).dbName} onChange={(e) => updateConfig({ dbConfig: { ...config.dbConfig, dbName: e.target.value } as RDBMSConfig })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Table Names</label>
                <textarea className="input-field min-h-[80px]" placeholder="One table per line or comma-separated" value={(config.dbConfig as RDBMSConfig).tableNames} onChange={(e) => updateConfig({ dbConfig: { ...config.dbConfig, tableNames: e.target.value } as RDBMSConfig })} />
              </div>
              <button
                onClick={onTestConnection}
                disabled={testingConnection}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600/20 border border-amber-500/30 text-amber-400 hover:bg-amber-600/30 hover:border-amber-500/50 transition-all duration-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testingConnection ? (
                  <>
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    Testing Connection...
                  </>
                ) : (
                  <>
                    <ServerStackIcon className="h-4 w-4" />
                    Test Connection
                  </>
                )}
              </button>
            </div>
          )}

          {!config.dbConfig && config.sourceType === 'database' && (
            <div className="flex flex-col items-center py-8 text-center">
              <InformationCircleIcon className="h-10 w-10 text-gray-600 mb-3" />
              <p className="text-sm text-gray-500">Select a database type to configure connection</p>
            </div>
          )}
        </Card>

        {/* Validation Errors */}
        <AnimatePresence>
          {validationErrors.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Card className="border-red-500/30 bg-red-500/5">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-red-400">Validation Errors</p>
                    <ul className="mt-2 space-y-1">
                      {validationErrors.map((err: string, i: number) => (
                        <li key={i} className="text-sm text-red-300/80">• {err}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button onClick={onReset} className="btn-secondary flex-1">
            <ArrowPathIcon className="mr-2 inline h-4 w-4" />
            Reset
          </button>
          <button onClick={onValidate} className="btn-primary flex-1">
            <CheckCircleIcon className="mr-2 inline h-4 w-4" />
            Validate & Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Review Step
// ============================================================================

function ReviewStep({ config, onBack, onDeploy }: any) {
  const dbType = config.databaseType || 's3';

  const paths = [
    { label: 'DAG Files', path: `/mnt/dags_root/${config.organization}/` },
    { label: 'Task Scripts', path: `/mnt/task_scripts_root/${config.organization}/${config.application}/${dbType}/` },
    { label: 'Source CSVs (S3)', path: `s3://gayatri2datalake/pms/dl_source/${config.organization}/${config.application}/${dbType}/csvs/` },
    { label: 'HDFS Dumpzone', path: `/dumpzone/${config.organization}/${config.application}/${dbType}/csvs/` },
    { label: 'Spark Jobs', path: `/home/tsloader/spark_jobs/${config.organization}/raw/general/csvtohudi/${config.application}/` },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeader title="Deployment Review" subtitle="Verify configuration before deploying" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Configuration Summary */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Configuration</h4>
            <div className="space-y-3">
              <ReviewItem label="Organization" value={config.organization} />
              <ReviewItem label="Application" value={config.application} />
              <ReviewItem label="Source Type" value={config.sourceType} />
              <ReviewItem label="Database Type" value={dbType} />
              {config.dbConfig?.type === 'mongodb' && (
                <>
                  <ReviewItem label="Database" value={(config.dbConfig as MongoDBConfig).dbName} />
                  <ReviewItem label="Collection" value={(config.dbConfig as MongoDBConfig).collectionName} />
                </>
              )}
              {config.dbConfig?.type === 'rdbms' && (
                <>
                  <ReviewItem label="Host" value={`${(config.dbConfig as RDBMSConfig).host}:${(config.dbConfig as RDBMSConfig).port}`} />
                  <ReviewItem label="Database" value={(config.dbConfig as RDBMSConfig).dbName} />
                </>
              )}
            </div>
          </div>

          {/* Target Paths */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Deployment Targets</h4>
            <div className="space-y-2">
              {paths.map((p) => (
                <div key={p.label} className="rounded-lg bg-white/5 p-3">
                  <p className="text-xs font-medium text-gray-400">{p.label}</p>
                  <p className="text-sm font-mono text-brand-400 mt-0.5 break-all">{p.path}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Expected Files */}
        <div className="mt-6 border-t border-white/5 pt-6">
          <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Expected Deployment</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricPreview icon={<FolderOpenIcon className="h-4 w-4" />} label="Directories" value="11" />
            <MetricPreview icon={<CodeBracketIcon className="h-4 w-4" />} label="TaskScripts" value="~12" />
            <MetricPreview icon={<DocumentTextIcon className="h-4 w-4" />} label="DAG Files" value="~4" />
            <MetricPreview icon={<CpuChipIcon className="h-4 w-4" />} label="Spark Jobs" value="~2" />
          </div>
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button onClick={onBack} className="btn-secondary flex-1">
          ← Back to Configure
        </button>
        <button onClick={onDeploy} className="btn-primary flex-1">
          <RocketLaunchIcon className="mr-2 inline h-4 w-4" />
          Deploy Pipeline
        </button>
      </div>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-medium text-white">{value || '—'}</span>
    </div>
  );
}

function MetricPreview({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
      <div className="text-brand-400">{icon}</div>
      <div>
        <p className="text-lg font-bold text-white">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Deploy Step
// ============================================================================

function DeployStep({ steps, isDeploying, config, onNewDeployment }: any) {
  const [showValidationDetails, setShowValidationDetails] = useState(false);

  const successCount = useMemo(() => steps.filter((s: DeploymentStep) => s.status === 'success').length, [steps]);
  const errorCount = useMemo(() => steps.filter((s: DeploymentStep) => s.status === 'error').length, [steps]);
  const total = steps.length;

  const overallProgress = useMemo(() => {
    return Math.round((successCount / total) * 100);
  }, [successCount, total]);

  const allDone = steps.every((s: DeploymentStep) => s.status === 'success' || s.status === 'error');
  const allSuccess = allDone && errorCount === 0;
  const allFailed = allDone && successCount === 0;

  const heading = !allDone
    ? ' Deploying Pipeline...'
    : allSuccess
    ? ' Deployment Complete!'
    : allFailed
    ? ' Deployment Failed'
    : ` Deployment Partial (${successCount}/${total} succeeded)`;

  // Extract validation report from Step 8
  const validationStep = steps.find((s: DeploymentStep) => s.id === 8);
  const validationReport = validationStep?.metrics?.validationReport;
  const hasValidation = validationReport && validationReport.tables && validationReport.tables.length > 0;

  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">
              {heading}
            </h3>
            <p className="text-sm text-gray-500">
              {config.organization}/{config.application} ({config.databaseType || 's3'})
            </p>
          </div>
          <span className={`text-2xl font-bold ${allFailed ? 'text-red-400' : allDone && !allSuccess ? 'text-amber-400' : 'text-brand-400'}`}>{overallProgress}%</span>
        </div>
        <ProgressBar progress={overallProgress} striped={isDeploying} />
      </Card>

      {/* Steps */}
      <Card>
        <SectionHeader title="Deployment Steps" />
        <Stepper
          steps={steps.map((s: DeploymentStep) => ({ id: s.id, name: s.name, status: s.status }))}
          currentStep={steps.findIndex((s: DeploymentStep) => s.status === 'running')}
        />

        <div className="mt-6 space-y-3">
          {steps.map((step: DeploymentStep) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-lg border p-4 transition-all ${
                step.status === 'running'
                  ? 'border-brand-500/30 bg-brand-500/5'
                  : step.status === 'success'
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : step.status === 'error'
                  ? 'border-red-500/20 bg-red-500/5'
                  : 'border-white/5 bg-white/[2%]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusBadge status={step.status === 'running' ? 'running' : step.status === 'success' ? 'success' : step.status === 'error' ? 'failed' : 'pending'} />
                  <div>
                    <p className="text-sm font-medium text-white">{step.name}</p>
                    <p className="text-xs text-gray-500">{step.description}</p>
                  </div>
                </div>
                {step.metrics && (
                  <div className="text-right">
                    {step.metrics.filesDeployed !== undefined && (
                      <p className="text-xs text-gray-400">{step.metrics.filesDeployed} files</p>
                    )}
                    {step.metrics.dirsCreated !== undefined && (
                      <p className="text-xs text-gray-400">{step.metrics.dirsCreated} dirs</p>
                    )}
                    {step.metrics.validationReport && step.metrics.validationReport.totalTables > 0 && (
                      <p className="text-xs text-gray-400">
                        {step.metrics.validationReport.passed}/{step.metrics.validationReport.totalTables} tables match
                      </p>
                    )}
                  </div>
                )}
              </div>
              {step.status === 'running' && (
                <div className="mt-3">
                  <ProgressBar progress={step.progress} size="sm" striped />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </Card>

      {/* Data Validation Report */}
      {allDone && hasValidation && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <SectionHeader title="Data Validation Report" subtitle="Source-to-target row & column count verification" />

            {/* Integrity Score + Summary */}
            <div className="flex items-center gap-8 mb-6">
              {/* Score Gauge */}
              <div className="relative flex items-center justify-center">
                <svg className="w-28 h-28 -rotate-90">
                  <circle cx="56" cy="56" r="48" stroke="currentColor" strokeWidth="8" fill="none" className="text-white/5" />
                  <circle
                    cx="56" cy="56" r="48"
                    stroke="currentColor" strokeWidth="8" fill="none"
                    strokeDasharray={2 * Math.PI * 48}
                    strokeDashoffset={2 * Math.PI * 48 * (1 - validationReport.integrityScore / 100)}
                    strokeLinecap="round"
                    className={`transition-all duration-1000 ${
                      validationReport.integrityScore === 100 ? 'text-emerald-400' : validationReport.integrityScore >= 50 ? 'text-amber-400' : 'text-red-400'
                    }`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-2xl font-bold ${
                    validationReport.integrityScore === 100 ? 'text-emerald-400' : validationReport.integrityScore >= 50 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {validationReport.integrityScore}%
                  </span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">Match</span>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="flex-1 grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
                  <CheckCircleIcon className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
                  <p className="text-xl font-bold text-emerald-400">{validationReport.passed}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Passed</p>
                </div>
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-center">
                  <XCircleIcon className="h-5 w-5 text-red-400 mx-auto mb-1" />
                  <p className="text-xl font-bold text-red-400">{validationReport.failed}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Failed</p>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
                  <TableCellsIcon className="h-5 w-5 text-brand-400 mx-auto mb-1" />
                  <p className="text-xl font-bold text-white">{validationReport.totalTables}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Tables</p>
                </div>
              </div>
            </div>

            {/* Toggle Details */}
            <button
              onClick={() => setShowValidationDetails(!showValidationDetails)}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-400 hover:text-white transition-colors border border-white/5 rounded-lg hover:bg-white/5"
            >
              {showValidationDetails ? (
                <><ChevronUpIcon className="h-4 w-4" /> Hide Table Details</>
              ) : (
                <><ChevronDownIcon className="h-4 w-4" /> Show Table-by-Table Details ({validationReport.totalTables} tables)</>
              )}
            </button>

            {/* Detailed Table */}
            <AnimatePresence>
              {showValidationDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 rounded-lg border border-white/5 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-white/5 text-gray-400 uppercase tracking-wider">
                          <th className="px-3 py-2.5">Status</th>
                          <th className="px-3 py-2.5">Table</th>
                          <th className="px-3 py-2.5 text-right">Source Rows</th>
                          <th className="px-3 py-2.5 text-right">Target Rows</th>
                          <th className="px-3 py-2.5 text-center">Row Match</th>
                          <th className="px-3 py-2.5 text-right">Source Cols</th>
                          <th className="px-3 py-2.5 text-right">Target Cols</th>
                          <th className="px-3 py-2.5 text-center">Col Match</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {validationReport.tables.map((t: any, idx: number) => (
                          <tr key={idx} className={`${
                            t.status === 'passed' ? 'bg-emerald-500/[3%]' : t.status === 'error' ? 'bg-amber-500/[3%]' : 'bg-red-500/[3%]'
                          }`}>
                            <td className="px-3 py-2.5">
                              {t.status === 'passed' ? (
                                <CheckCircleIcon className="h-4 w-4 text-emerald-400" />
                              ) : t.status === 'error' ? (
                                <ExclamationCircleIcon className="h-4 w-4 text-amber-400" />
                              ) : (
                                <XCircleIcon className="h-4 w-4 text-red-400" />
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <div>
                                <p className="text-gray-200 font-medium">{t.tableName}</p>
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                  {t.sourceTable} → {t.targetTable}
                                </p>
                                {t.error && (
                                  <p className="text-[10px] text-amber-400 mt-0.5">{t.error}</p>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-300 font-mono">
                              {t.sourceRowCount >= 0 ? t.sourceRowCount.toLocaleString() : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono">
                              <span className={!t.rowCountMatch && t.targetRowCount >= 0 ? 'text-red-400' : 'text-gray-300'}>
                                {t.targetRowCount >= 0 ? t.targetRowCount.toLocaleString() : '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {t.status === 'error' ? (
                                <span className="text-amber-400 text-[10px]">ERROR</span>
                              ) : t.rowCountMatch ? (
                                <span className="text-emerald-400 font-bold">✓</span>
                              ) : (
                                <span className="text-red-400 font-bold">✗</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-300 font-mono">
                              {t.sourceColumnCount >= 0 ? t.sourceColumnCount : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono">
                              <span className={!t.columnCountMatch && t.targetColumnCount >= 0 ? 'text-amber-400' : 'text-gray-300'}>
                                {t.targetColumnCount >= 0 ? t.targetColumnCount : '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {t.status === 'error' ? (
                                <span className="text-amber-400 text-[10px]">ERROR</span>
                              ) : t.columnCountMatch ? (
                                <span className="text-emerald-400 font-bold">✓</span>
                              ) : (
                                <span className="text-amber-400 font-bold">≠</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Legend */}
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px] text-gray-500">
                    <span className="flex items-center gap-1">
                      <CheckCircleIcon className="h-3 w-3 text-emerald-400" /> Row counts match
                    </span>
                    <span className="flex items-center gap-1">
                      <XCircleIcon className="h-3 w-3 text-red-400" /> Row count mismatch
                    </span>
                    <span className="flex items-center gap-1">
                      <ExclamationCircleIcon className="h-3 w-3 text-amber-400" /> Error / table not found
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-amber-400 font-bold">≠</span> Column count differs (expected for flattened data)
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>
      )}

      {/* Post-Deployment Summary */}
      {allDone && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <SectionHeader title="Deployment Summary" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {steps.filter((step: DeploymentStep) => step.id !== 7 && step.id !== 8).map((step: DeploymentStep) => (
                <div key={step.id} className="rounded-lg bg-white/5 p-4 text-center">
                  <p className="text-2xl font-bold text-white">
                    {step.metrics?.filesDeployed ?? step.metrics?.dirsCreated ?? '✓'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{step.name}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={onNewDeployment} className="btn-primary flex-1">
                <RocketLaunchIcon className="mr-2 inline h-4 w-4" />
                New Deployment
              </button>
              <button className="btn-secondary flex-1">
                <DocumentTextIcon className="mr-2 inline h-4 w-4" />
                View Logs
              </button>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
