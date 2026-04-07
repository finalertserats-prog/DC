import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  PipelineConfig,
  DeploymentStep,
  DeploymentResult,
  Notification,
  User,
  ServerStatus,
  DashboardStats,
} from '@/types';

// ============================================================================
// Auth Store
// ============================================================================

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: {
        id: '1',
        name: 'Admin User',
        email: 'admin@techsophy.com',
        role: 'admin',
        lastLogin: new Date().toISOString(),
      },
      isAuthenticated: true,
      login: (user) => set({ user, isAuthenticated: true }),
      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    { name: 'sdp-auth' }
  )
);

// ============================================================================
// Theme Store
// ============================================================================

interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDark: true,
      toggleTheme: () =>
        set((state) => {
          const next = !state.isDark;
          document.documentElement.classList.toggle('dark', next);
          return { isDark: next };
        }),
    }),
    { name: 'sdp-theme' }
  )
);

// ============================================================================
// Pipeline Store
// ============================================================================

interface PipelineState {
  config: PipelineConfig;
  updateConfig: (partial: Partial<PipelineConfig>) => void;
  resetConfig: () => void;
}

const defaultConfig: PipelineConfig = {
  organization: '',
  application: '',
  sourceType: 'database',
  databaseType: null,
  dbConfig: null,
  gitAuth: null,
};

export const usePipelineStore = create<PipelineState>()((set) => ({
  config: defaultConfig,
  updateConfig: (partial) =>
    set((state) => ({ config: { ...state.config, ...partial } })),
  resetConfig: () => set({ config: defaultConfig }),
}));

// ============================================================================
// Deployment Store
// ============================================================================

interface DeploymentState {
  isDeploying: boolean;
  currentStep: number;
  steps: DeploymentStep[];
  history: DeploymentResult[];
  startDeployment: (steps: DeploymentStep[]) => void;
  updateStep: (stepId: number, updates: Partial<DeploymentStep>) => void;
  advanceStep: () => void;
  completeDeployment: (result: DeploymentResult) => void;
  failDeployment: (error: string) => void;
  resetDeployment: () => void;
  addToHistory: (result: DeploymentResult) => void;
}

const defaultSteps: DeploymentStep[] = [
  { id: 1, name: 'Clone Repository', description: 'Cloning Git repository...', status: 'pending', progress: 0, logs: [] },
  { id: 2, name: 'Connect Server', description: 'Connecting to Airflow server...', status: 'pending', progress: 0, logs: [] },
  { id: 3, name: 'Create Directories', description: 'Creating remote directories...', status: 'pending', progress: 0, logs: [] },
  { id: 4, name: 'Deploy TaskScripts', description: 'Deploying task scripts...', status: 'pending', progress: 0, logs: [] },
  { id: 5, name: 'Deploy DAGs', description: 'Deploying Airflow DAGs...', status: 'pending', progress: 0, logs: [] },
  { id: 6, name: 'Deploy Spark Jobs', description: 'Deploying to staging server...', status: 'pending', progress: 0, logs: [] },
  { id: 7, name: 'Run Master DAG', description: 'Triggering Airflow master DAG...', status: 'pending', progress: 0, logs: [] },
  { id: 8, name: 'Data Validation', description: 'Validating source-to-target row counts...', status: 'pending', progress: 0, logs: [] },
];

export const useDeploymentStore = create<DeploymentState>()(
  persist(
    (set) => ({
      isDeploying: false,
      currentStep: 0,
      steps: defaultSteps,
      history: [],
      startDeployment: (steps) =>
        set({ isDeploying: true, currentStep: 0, steps }),
      updateStep: (stepId, updates) =>
        set((state) => ({
          steps: state.steps.map((s) =>
            s.id === stepId ? { ...s, ...updates } : s
          ),
        })),
      advanceStep: () =>
        set((state) => ({ currentStep: state.currentStep + 1 })),
      completeDeployment: (result) =>
        set((state) => {
          const finalStepStatus = result.status === 'success' ? 'success' : 'error';
          return {
            isDeploying: false,
            // Finalize any steps still stuck in 'pending' or 'running' (race condition fix)
            steps: state.steps.map((s) =>
              s.status === 'pending' || s.status === 'running'
                ? { ...s, status: finalStepStatus as 'success' | 'error', progress: 100, completedAt: new Date().toISOString() }
                : s
            ),
            history: [result, ...state.history].slice(0, 50),
          };
        }),
      failDeployment: (_error) => set({ isDeploying: false }),
      resetDeployment: () =>
        set({
          isDeploying: false,
          currentStep: 0,
          steps: defaultSteps.map((s) => ({ ...s, status: 'pending' as const, progress: 0, logs: [] })),
        }),
      addToHistory: (result) =>
        set((state) => ({
          history: [result, ...state.history].slice(0, 50),
        })),
    }),
    { name: 'sdp-deployments' }
  )
);

// ============================================================================
// Notification Store
// ============================================================================

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],
  unreadCount: 0,
  addNotification: (notification) =>
    set((state) => {
      const newNotification: Notification = {
        ...notification,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        read: false,
      };
      return {
        notifications: [newNotification, ...state.notifications].slice(0, 100),
        unreadCount: state.unreadCount + 1,
      };
    }),
  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}));

// ============================================================================
// Server Status Store
// ============================================================================

interface ServerStatusState {
  airflow: { status: ServerStatus; lastChecked: string | null };
  staging: { status: ServerStatus; lastChecked: string | null };
  setAirflowStatus: (status: ServerStatus) => void;
  setStagingStatus: (status: ServerStatus) => void;
}

export const useServerStatusStore = create<ServerStatusState>()((set) => ({
  airflow: { status: 'offline', lastChecked: null },
  staging: { status: 'offline', lastChecked: null },
  setAirflowStatus: (status) =>
    set({ airflow: { status, lastChecked: new Date().toISOString() } }),
  setStagingStatus: (status) =>
    set({ staging: { status, lastChecked: new Date().toISOString() } }),
}));

// ============================================================================
// Dashboard Store
// ============================================================================

interface DashboardState {
  stats: DashboardStats | null;
  isLoading: boolean;
  setStats: (stats: DashboardStats) => void;
  setLoading: (loading: boolean) => void;
}

export const useDashboardStore = create<DashboardState>()((set) => ({
  stats: null,
  isLoading: false,
  setStats: (stats) => set({ stats, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
}));
