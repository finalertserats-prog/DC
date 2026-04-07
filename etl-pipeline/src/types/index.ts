// ============================================================================
// Core Domain Types
// ============================================================================

export type SourceType = 'database' | 's3';
export type DatabaseType = 'mongodb' | 'postgres' | 'mysql' | 'oracle' | 'mssql';
export type DeploymentStatus = 'idle' | 'validating' | 'cloning' | 'connecting' | 'creating-dirs' | 'deploying-scripts' | 'deploying-dags' | 'deploying-spark' | 'completed' | 'failed';
export type ServerStatus = 'online' | 'offline' | 'checking';
export type UserRole = 'admin' | 'deployer' | 'viewer';

// ============================================================================
// Pipeline Configuration
// ============================================================================

export interface PipelineConfig {
  organization: string;
  application: string;
  sourceType: SourceType;
  databaseType: DatabaseType | null;
  dbConfig: MongoDBConfig | RDBMSConfig | S3Config | null;
  gitAuth: GitAuthConfig | null;
}

export interface MongoDBConfig {
  type: 'mongodb';
  connectionString: string;
  dbName: string;
  collectionName: string;
}

export interface RDBMSConfig {
  type: 'rdbms';
  rdbmsType: DatabaseType;
  username: string;
  password: string;
  host: string;
  port: string;
  dbName: string;
  tableNames: string;
}

export interface S3Config {
  type: 's3';
  s3Bucket: string;
  s3Path: string;
}

export interface GitAuthConfig {
  username: string;
  token: string;
}

// ============================================================================
// Deployment
// ============================================================================

export interface DeploymentStep {
  id: number;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  progress: number;
  logs: LogEntry[];
  startedAt?: string;
  completedAt?: string;
  metrics?: {
    filesDeployed?: number;
    filesFailed?: number;
    dirsCreated?: number;
    validationReport?: DataValidationReport;
  };
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  details?: string;
}

// ============================================================================
// Data Validation
// ============================================================================

export interface RowCountValidation {
  tableName: string;
  sourceTable: string;
  targetTable: string;
  sourceRowCount: number;
  targetRowCount: number;
  sourceColumnCount: number;
  targetColumnCount: number;
  rowCountMatch: boolean;
  columnCountMatch: boolean;
  status: 'passed' | 'failed' | 'error';
  error?: string;
}

export interface DataValidationReport {
  totalTables: number;
  passed: number;
  failed: number;
  errors: number;
  overallStatus: 'passed' | 'failed' | 'partial' | 'skipped';
  integrityScore: number;
  tables: RowCountValidation[];
}

export interface DeploymentResult {
  id: string;
  organization: string;
  application: string;
  databaseType: string;
  status: 'success' | 'partial' | 'failed';
  startedAt: string;
  completedAt: string;
  gitUrl: string;
  branch: string;
  steps: DeploymentStep[];
  metrics: DeploymentMetrics;
  deployedBy: string;
}

export interface DeploymentMetrics {
  totalFiles: number;
  successFiles: number;
  failedFiles: number;
  taskScripts: number;
  dagFiles: number;
  sparkJobs: number;
  directories: number;
  duration: number;
}

// ============================================================================
// Server Configuration
// ============================================================================

export interface ServerConfig {
  host: string;
  ip: string;
  username: string;
  port: number;
  description: string;
  status: ServerStatus;
}

export interface EnvironmentVariable {
  key: string;
  value: string;
  category: string;
  sensitive: boolean;
}

// ============================================================================
// User & Auth
// ============================================================================

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  lastLogin: string;
}

// ============================================================================
// Dashboard & Analytics
// ============================================================================

export interface DashboardStats {
  totalDeployments: number;
  successRate: number;
  activeOrgs: number;
  totalPipelines: number;
  recentDeployments: DeploymentResult[];
  deploymentTrend: TrendDataPoint[];
  topOrganizations: OrgStat[];
}

export interface TrendDataPoint {
  date: string;
  deployments: number;
  success: number;
  failed: number;
}

export interface OrgStat {
  name: string;
  deployments: number;
  successRate: number;
}

// ============================================================================
// Notifications
// ============================================================================

export interface Notification {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
}
