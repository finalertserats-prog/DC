// Server configurations - matches Python config/server_config.py
export const AIRFLOW_SERVER = {
  host: 'sdpplyafw01.techsophy.com',
  ip: '65.21.48.174',
  username: 'hadoop',
  port: 22,
  description: 'Airflow Scheduler and Web Server',
};

export const STAGING_SERVER = {
  host: 'sdpplydn01.techsophy.com',
  ip: '65.21.1.173',
  username: 'tsloader',
  port: 22,
  description: 'Staging Server for Spark Jobs',
};

// AWS Configuration
export const AWS_CONFIG = {
  SOURCE_REGION_NAME: 'ap-south-2',
  SOURCE_BUCKET_NAME: 'gayatri2datalake',
  STAGING_REGION_NAME: 'ap-south-2',
  STAGING_BUCKET_NAME: 'gayatri2datalake',
};

// HDFS Configuration
export const HDFS_CONFIG = {
  URI: 'hdfs://sdpplynn01.techsophy.com:9820',
  URL: 'https://sdpplynn01.techsophy.com:9871',
  USER: 'hadoop',
  NAMENODE_URL: 'hdfs://sdpplynn01.techsophy.com:9820',
  YARN_HOSTNAME: 'sdpplynn01.techsophy.com',
};

// Hive Configuration
export const HIVE_CONFIG = {
  JDBC_URL: 'jdbc:postgresql://sdpplystg01.techsophy.com:5432/metastore',
  USERNAME: 'hadoop',
};

// Database types
export const DB_TYPES = {
  mongodb: 'MongoDB',
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  oracle: 'Oracle',
  mssql: 'MS SQL Server',
} as const;

// Git Configuration
export const GIT_CONFIG = {
  BASE_URL: 'https://git.techsophy.com/datalake',
  TOKEN_PREFIX: 'glpat-',
};

// Deployment steps definition
export const DEPLOYMENT_STEPS = [
  { id: 1, name: 'Clone Repository', icon: 'git', description: 'Fetching source code from Git' },
  { id: 2, name: 'Connect Server', icon: 'server', description: 'Establishing SSH connection' },
  { id: 3, name: 'Create Directories', icon: 'folder', description: 'Setting up directory structure' },
  { id: 4, name: 'Deploy TaskScripts', icon: 'code', description: 'Uploading pipeline scripts' },
  { id: 5, name: 'Deploy DAGs', icon: 'workflow', description: 'Deploying Airflow DAGs' },
  { id: 6, name: 'Deploy Spark Jobs', icon: 'spark', description: 'Deploying to staging server' },
  { id: 7, name: 'Run Master DAG', icon: 'play', description: 'Triggering Airflow master DAG' },
  { id: 8, name: 'Data Validation', icon: 'shield', description: 'Validating source-to-target row counts' },
] as const;
