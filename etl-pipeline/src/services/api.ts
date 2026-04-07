import axios from 'axios';
import type {
  PipelineConfig,
  DeploymentResult,
  DashboardStats,
  ServerStatus,
} from '@/types';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor for auth
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sdp-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ============================================================================
// Server Health
// ============================================================================

export async function checkServerHealth(
  server: 'airflow' | 'staging'
): Promise<{ status: ServerStatus; user?: string }> {
  try {
    const { data } = await api.get(`/servers/${server}/health`);
    return data;
  } catch {
    return { status: 'offline' };
  }
}

// ============================================================================
// Pipeline Validation
// ============================================================================

export async function validatePipelineConfig(
  config: PipelineConfig
): Promise<{ valid: boolean; errors: string[] }> {
  try {
    const { data } = await api.post('/pipelines/validate', config);
    return data;
  } catch (err: any) {
    return {
      valid: false,
      errors: [err.response?.data?.message || 'Validation failed'],
    };
  }
}

// ============================================================================
// Git Operations
// ============================================================================

export async function validateGitCredentials(
  username: string,
  token: string,
  org: string
): Promise<{ valid: boolean; message: string }> {
  try {
    const { data } = await api.post('/git/validate', { username, token, org });
    return data;
  } catch {
    return { valid: false, message: 'Connection failed' };
  }
}

// ============================================================================
// Deployment
// ============================================================================

export async function startDeployment(
  config: PipelineConfig,
  onProgress?: (step: number, message: string) => void
): Promise<DeploymentResult> {
  const { data } = await api.post('/deploy', config);

  // For real-time progress, use EventSource (SSE)
  if (onProgress && data.deploymentId) {
    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(
        `/api/deploy/${data.deploymentId}/stream`
      );

      eventSource.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === 'progress') {
          onProgress(payload.step, payload.message);
        } else if (payload.type === 'complete') {
          eventSource.close();
          resolve(payload.result);
        } else if (payload.type === 'error') {
          eventSource.close();
          reject(new Error(payload.message));
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        reject(new Error('Connection lost during deployment'));
      };
    });
  }

  return data;
}

// ============================================================================
// Deployment History
// ============================================================================

export async function getDeploymentHistory(): Promise<DeploymentResult[]> {
  try {
    const { data } = await api.get('/deployments');
    return data;
  } catch {
    return [];
  }
}

export async function getDeploymentById(
  id: string
): Promise<DeploymentResult | null> {
  try {
    const { data } = await api.get(`/deployments/${id}`);
    return data;
  } catch {
    return null;
  }
}

// ============================================================================
// Dashboard
// ============================================================================

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const { data } = await api.get('/dashboard/stats');
    return data;
  } catch {
    // Return mock data for demo
    return generateMockDashboardStats();
  }
}

// ============================================================================
// Environment Variables
// ============================================================================

export async function generateEnvVariables(
  config: PipelineConfig
): Promise<Record<string, string>> {
  try {
    const { data } = await api.post('/pipelines/env-vars', config);
    return data;
  } catch {
    return {};
  }
}

// ============================================================================
// Mock Data Generator (for demo mode)
// ============================================================================

function generateMockDashboardStats(): DashboardStats {
  const days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    const deployments = Math.floor(Math.random() * 8) + 1;
    const success = Math.floor(deployments * (0.7 + Math.random() * 0.3));
    return {
      date: date.toISOString().split('T')[0],
      deployments,
      success,
      failed: deployments - success,
    };
  });

  return {
    totalDeployments: 247,
    successRate: 94.3,
    activeOrgs: 12,
    totalPipelines: 38,
    recentDeployments: [],
    deploymentTrend: days,
    topOrganizations: [
      { name: 'techsophy', deployments: 89, successRate: 96.2 },
      { name: 'awgment', deployments: 54, successRate: 92.1 },
      { name: 'codeiq', deployments: 41, successRate: 95.8 },
      { name: 'biometric', deployments: 33, successRate: 91.5 },
      { name: 'openproject', deployments: 30, successRate: 97.0 },
    ],
  };
}

export default api;
