import axios from 'axios';
import type {
  Stats,
  Job,
  JobSummary,
  JobsPageResponse,
  JobProgress,
  Task,
  GranularTask,
  Agent,
  WorkspaceFile,
  HealthCheck,
  BackendOption,
  Refinement,
  SkillInfo,
  SkillSearchResult,
  PlanReviewData,
  ValidationReport,
} from '../types';
import { activeToken } from '../auth/OAuthProvider';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (activeToken) {
    config.headers.Authorization = `Bearer ${activeToken}`;
  }
  return config;
});

// ── Stats ───────────────────────────────────────────────────────────────────
export async function getStats(): Promise<Stats> {
  const { data } = await api.get<Stats>('/api/stats');
  return data;
}

// ── Backends ────────────────────────────────────────────────────────────────
export async function getBackends(): Promise<BackendOption[]> {
  const { data } = await api.get<{ backends: BackendOption[] }>('/api/backends');
  return data.backends;
}

// ── Jobs ────────────────────────────────────────────────────────────────────
export async function getJobs(
  page = 1,
  pageSize = 10,
  visionContains?: string,
  opts?: { status?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; teamId?: string },
): Promise<JobsPageResponse> {
  const params: Record<string, string | number> = { page, page_size: pageSize };
  if (visionContains) params.vision_contains = visionContains;
  if (opts?.status) params.status = opts.status;
  if (opts?.sortBy) params.sort_by = opts.sortBy;
  if (opts?.sortOrder) params.sort_order = opts.sortOrder;
  if (opts?.teamId) params.team_id = opts.teamId;
  const { data } = await api.get<JobsPageResponse>('/api/jobs', { params });
  return data;
}

export async function getJob(jobId: string): Promise<Job> {
  const { data } = await api.get<Job>(`/api/jobs/${jobId}`);
  return data;
}

/** Solutioning path chosen at create time (Adaptive Stack Contract). */
export type SolutioningPath = 'full' | 'adaptive' | 'fast';

export interface CapabilityProfileOverride {
  solutioning_path: SolutioningPath;
  source: 'user';
}

/** Heuristic capability profile from POST /api/jobs/preview-capabilities. */
export interface CapabilityProfilePreview {
  delivery_surface?: string;
  complexity?: string;
  needs_server_runtime?: boolean;
  needs_api?: boolean;
  needs_persistence?: boolean;
  needs_auth?: boolean;
  explicit_technologies?: string[];
  suggested_path?: 'fast' | 'full';
  evidence?: string[];
}

export async function previewCapabilities(vision: string): Promise<CapabilityProfilePreview> {
  const { data } = await api.post<CapabilityProfilePreview>(
    '/api/jobs/preview-capabilities',
    { vision },
  );
  return data;
}

export async function createJob(
  vision: string,
  documents?: File[],
  githubUrls?: string[],
  backend?: string,
  teamId?: string,
  autoApprovePlan?: boolean,
  jiraIssue?: JiraIssue,
  targetRepoName?: string,
  capabilityProfile?: CapabilityProfileOverride,
): Promise<{ job_id: string; status: string; documents: number; github_repos: number }> {
  const hasFiles = documents && documents.length > 0;
  const hasGithub = githubUrls && githubUrls.length > 0;

  if (hasFiles || hasGithub) {
    const formData = new FormData();
    formData.append('vision', vision);
    if (backend) formData.append('backend', backend);
    if (teamId) formData.append('team_id', teamId);
    if (autoApprovePlan) formData.append('auto_approve_plan', 'true');
    if (targetRepoName) formData.append('target_repo_name', targetRepoName);
    if (capabilityProfile) {
      formData.append('capability_profile', JSON.stringify(capabilityProfile));
    }
    if (jiraIssue) {
      formData.append('jira_issue_key', jiraIssue.key);
      formData.append('jira_issue_url', jiraIssue.url);
      formData.append('jira_issue_summary', jiraIssue.summary);
    }
    if (hasFiles) {
      documents!.forEach((file) => formData.append('documents', file));
    }
    if (hasGithub) {
      githubUrls!.forEach((url) => formData.append('github_urls', url));
    }
    const { data } = await api.post<{
      job_id: string; status: string; documents: number; github_repos: number;
    }>(
      '/api/jobs',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;
  }
  const { data } = await api.post<{
    job_id: string; status: string; documents: number; github_repos: number;
  }>(
    '/api/jobs',
    {
      vision,
      backend,
      team_id: teamId,
      auto_approve_plan: autoApprovePlan ?? false,
      ...(capabilityProfile && { capability_profile: capabilityProfile }),
      ...(targetRepoName && { target_repo_name: targetRepoName }),
      ...(jiraIssue && {
        jira_issue_key: jiraIssue.key,
        jira_issue_url: jiraIssue.url,
        jira_issue_summary: jiraIssue.summary,
      }),
    }
  );
  return data;
}

/**
 * Create a migration job with a source code archive and MTA report files.
 *
 * - source_archive → extracted into workspace root (preserves directory tree)
 * - documents      → placed in workspace/docs/ (MTA reports)
 * - mode=migration → tells backend to skip the build pipeline
 */
export async function createMigrationJob(
  vision: string,
  sourceArchive: File | null,
  reportFiles: File[],
  githubUrls?: string[],
  backend?: string,
  teamId?: string,
): Promise<{ job_id: string; status: string; documents: number; source_files: number; github_repos: number }> {
  const formData = new FormData();
  formData.append('vision', vision);
  formData.append('mode', 'migration');
  if (backend) formData.append('backend', backend);
  if (teamId) formData.append('team_id', teamId);
  if (sourceArchive) {
    formData.append('source_archive', sourceArchive);
  }
  reportFiles.forEach((file) => formData.append('documents', file));
  if (githubUrls) {
    githubUrls.forEach((url) => formData.append('github_urls', url));
  }
  const { data } = await api.post<{
    job_id: string; status: string; documents: number; source_files: number; github_repos: number;
  }>(
    '/api/jobs',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

/**
 * Create a refactor job with source code.
 */
export async function createRefactorJob(
  vision: string,
  sourceArchive: File | null,
  githubUrls?: string[],
  backend?: string,
  teamId?: string,
): Promise<{ job_id: string; status: string; documents: number; source_files: number; github_repos: number }> {
  const formData = new FormData();
  formData.append('vision', vision);
  formData.append('mode', 'refactor');
  if (backend) formData.append('backend', backend);
  if (teamId) formData.append('team_id', teamId);
  if (sourceArchive) {
    formData.append('source_archive', sourceArchive);
  }
  if (githubUrls) {
    githubUrls.forEach((url) => formData.append('github_urls', url));
  }
  const { data } = await api.post<{
    job_id: string; status: string; documents: number; source_files: number; github_repos: number;
  }>(
    '/api/jobs',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

/**
 * Create an import job with source code.
 */
export async function createImportJob(
  vision: string,
  sourceArchive: File | null,
  githubUrls?: string[],
  backend?: string,
  teamId?: string,
): Promise<{ job_id: string; status: string; documents: number; source_files: number; github_repos: number }> {
  const formData = new FormData();
  formData.append('vision', vision);
  formData.append('mode', 'import');
  if (backend) formData.append('backend', backend);
  if (teamId) formData.append('team_id', teamId);
  if (sourceArchive) {
    formData.append('source_archive', sourceArchive);
  }
  if (githubUrls) {
    githubUrls.forEach((url) => formData.append('github_urls', url));
  }
  const { data } = await api.post<{
    job_id: string; status: string; documents: number; source_files: number; github_repos: number;
  }>(
    '/api/jobs',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

export async function startImportAnalysis(jobId: string): Promise<{ status: string; message?: string }> {
  const { data } = await api.post<{ status: string; message?: string }>(`/api/jobs/${jobId}/analyze`);
  return data;
}

/**
 * Fix existing repo: import + auto fix refine (JIRA bug path or manual fix intake).
 */
export async function createFixJob(
  vision: string,
  githubUrls: string[],
  metadata?: Record<string, unknown>,
  backend?: string,
): Promise<{ job_id: string; status: string; source_files?: number; github_repos?: number }> {
  const formData = new FormData();
  formData.append('vision', vision);
  formData.append('mode', 'fix');
  if (backend) formData.append('backend', backend);
  if (metadata) formData.append('metadata', JSON.stringify(metadata));
  githubUrls.forEach((url) => formData.append('github_urls', url));
  const { data } = await api.post<{
    job_id: string; status: string; source_files?: number; github_repos?: number;
  }>(
    '/api/jobs',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

export interface JobDocument {
  id: string;
  job_id: string;
  filename: string;
  original_name: string;
  file_type: string;
  file_size: number;
  stored_path: string;
  uploaded_at: string;
}

export async function getJobDocuments(jobId: string): Promise<JobDocument[]> {
  const { data } = await api.get<{ documents: JobDocument[] }>(`/api/jobs/${jobId}/documents`);
  return data.documents;
}

export async function uploadJobDocuments(
  jobId: string,
  files: File[]
): Promise<{ uploaded: number; documents: JobDocument[] }> {
  const formData = new FormData();
  files.forEach((file) => formData.append('documents', file));
  const { data } = await api.post<{ uploaded: number; documents: JobDocument[] }>(
    `/api/jobs/${jobId}/documents`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data;
}

export async function deleteJobDocument(
  jobId: string,
  docId: string
): Promise<{ status: string }> {
  const { data } = await api.delete<{ status: string }>(
    `/api/jobs/${jobId}/documents/${docId}`
  );
  return data;
}

export async function cancelJob(jobId: string): Promise<{ status: string }> {
  const { data } = await api.post<{ status: string }>(`/api/jobs/${jobId}/cancel`);
  return data;
}

export type RestartJobOptions = {
  /** Resume from the last checkpoint phase */
  resume?: boolean;
  /** Retry only failed/skipped file tasks and failed feature tasks */
  mode?: 'retry_failed';
};

export async function restartJob(
  jobId: string,
  options?: RestartJobOptions
): Promise<{ status: string; job_type: string; job_id: string; mode?: string }> {
  const body: Record<string, unknown> = {};
  if (options?.resume) body.resume = true;
  if (options?.mode === 'retry_failed') body.mode = 'retry_failed';
  const { data } = await api.post<{ status: string; job_type: string; job_id: string; mode?: string }>(
    `/api/jobs/${jobId}/restart`,
    Object.keys(body).length ? body : undefined
  );
  return data;
}

// ── Job Progress ────────────────────────────────────────────────────────────
export async function getJobProgress(jobId: string): Promise<JobProgress> {
  const { data } = await api.get<JobProgress>(`/api/jobs/${jobId}/progress`);
  return data;
}

// ── Job Tasks ───────────────────────────────────────────────────────────────
export async function getJobTasks(
  jobId: string
): Promise<{ total_tasks: number; tasks: Task[] }> {
  const { data } = await api.get<{ total_tasks: number; tasks: Task[] }>(
    `/api/jobs/${jobId}/tasks`
  );
  return data;
}

// ── Job Granular Tasks ───────────────────────────────────────────────────────
export async function getGranularTasks(
  jobId: string
): Promise<{ total_tasks: number; tasks: GranularTask[] }> {
  const { data } = await api.get<{ total_tasks: number; tasks: GranularTask[] }>(
    `/api/jobs/${jobId}/tasks/granular`
  );
  return data;
}

// ── Job Agents ──────────────────────────────────────────────────────────────
export async function getJobAgents(jobId: string): Promise<Agent[]> {
  const { data } = await api.get<{ agents: Agent[] }>(`/api/jobs/${jobId}/agents`);
  return data.agents;
}

// ── Job Files ───────────────────────────────────────────────────────────────
export async function getJobFiles(jobId: string): Promise<WorkspaceFile[]> {
  const { data } = await api.get<{ files: WorkspaceFile[] }>(`/api/jobs/${jobId}/files`);
  return data.files;
}

// ── Job Budget ──────────────────────────────────────────────────────────────
export async function getJobBudget(jobId: string): Promise<Record<string, unknown>> {
  const { data } = await api.get<Record<string, unknown>>(`/api/jobs/${jobId}/budget`);
  return data;
}

// ── Job Tool Stats ───────────────────────────────────────────────────────────
export interface ToolStat {
  name: string;
  count: number;
  avg_ms: number;
}
export interface AgentStat {
  agent_name: string;
  count: number;
}
export interface JobToolStats {
  total: number;
  by_tool: ToolStat[];
  by_agent: AgentStat[];
}
export async function getJobToolStats(jobId: string): Promise<JobToolStats> {
  const { data } = await api.get<JobToolStats>(`/api/jobs/${jobId}/tool-stats`);
  return data;
}

// ── Refinement ──────────────────────────────────────────────────────────────
export type RefineScope = 'impact' | 'file' | 'project';

export async function refineJob(
  jobId: string,
  prompt: string,
  filePath?: string,
  opts?: { scope?: RefineScope; refinementKind?: 'fix' | 'feature' | 'edit' },
): Promise<{ status: string; message?: string; refinement_id?: string }> {
  const body: Record<string, string> = { prompt };
  if (filePath) body.file_path = filePath;
  if (opts?.scope) body.scope = opts.scope;
  if (opts?.refinementKind) body.refinement_kind = opts.refinementKind;
  const { data } = await api.post<{ status: string; message?: string; refinement_id?: string }>(
    `/api/jobs/${jobId}/refine`,
    body,
  );
  return data;
}

export async function getRefinementHistory(jobId: string): Promise<Refinement[]> {
  const { data } = await api.get<{ refinements: Refinement[] }>(
    `/api/jobs/${jobId}/refinements`
  );
  return data.refinements;
}

export async function getJobValidation(jobId: string): Promise<ValidationReport | null> {
  try {
    const { data } = await api.get<ValidationReport>(`/api/jobs/${jobId}/validation`);
    return data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

// ── Plan Review ─────────────────────────────────────────────────────────────
export async function getJobPlan(jobId: string): Promise<PlanReviewData> {
  const { data } = await api.get<PlanReviewData>(`/api/jobs/${jobId}/plan`);
  return data;
}

export async function approveJob(jobId: string): Promise<{ job_id: string; status: string }> {
  const { data } = await api.post<{ job_id: string; status: string }>(`/api/jobs/${jobId}/approve`);
  return data;
}

export async function refinePlan(
  jobId: string,
  feedback: string
): Promise<{ status: string; message?: string }> {
  const { data } = await api.post<{ status: string; message?: string }>(
    `/api/jobs/${jobId}/refine-plan`,
    { feedback }
  );
  return data;
}

export async function getJobSolution(jobId: string): Promise<{
  artifacts: Record<string, string>;
  solution_candidates: unknown[];
  critique_history: unknown[];
  solution_feedback_history: { feedback: string }[];
}> {
  const { data } = await api.get<{
    artifacts: Record<string, string>;
    solution_candidates: unknown[];
    critique_history: unknown[];
    solution_feedback_history: { feedback: string }[];
  }>(`/api/jobs/${jobId}/solution`);
  return data;
}

export async function refineSolution(
  jobId: string,
  feedback: string
): Promise<{ status: string; message?: string }> {
  const { data } = await api.post<{ status: string; message?: string }>(
    `/api/jobs/${jobId}/refine-solution`,
    { feedback }
  );
  return data;
}

/** Base URL for job preview (append file path). Use in iframe src with sandbox. */
export function getPreviewUrl(jobId: string, filePath: string): string {
  const base = import.meta.env.VITE_API_URL || '';
  const encoded = filePath.split('/').map(encodeURIComponent).join('/');
  return `${base}/api/jobs/${jobId}/preview/${encoded}`;
}

/** URL to download the job workspace as a ZIP file (for direct links). */
export function getJobDownloadUrl(jobId: string): string {
  const base = import.meta.env.VITE_API_URL || '';
  return `${base}/api/jobs/${jobId}/download`;
}

/** Fetch job workspace as ZIP and trigger browser download. Uses same origin/proxy as other API calls. */
export async function downloadJobWorkspace(jobId: string): Promise<void> {
  const { data } = await api.get<Blob>(`/api/jobs/${jobId}/download`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `project-${jobId.slice(0, 8)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Push the job workspace to GitHub on demand. Returns the GitHub repo URL on success. */
export async function pushJobToGit(jobId: string, repoName?: string): Promise<{ repo_url: string }> {
  const { data } = await api.post<{ status: string; repo_url: string }>(
    `/api/jobs/${jobId}/push`,
    repoName ? { repo_name: repoName } : {},
  );
  return data;
}

// ── Workspace Files ─────────────────────────────────────────────────────────
export async function getWorkspaceFiles(jobId?: string): Promise<WorkspaceFile[]> {
  const params = jobId ? { job_id: jobId } : {};
  const { data } = await api.get<{ files: WorkspaceFile[]; workspace: string }>(
    '/api/workspace/files',
    { params }
  );
  return data.files;
}

export async function getFileContent(
  filePath: string,
  jobId?: string
): Promise<{ path: string; content: string }> {
  const params = jobId ? { job_id: jobId } : {};
  const { data } = await api.get<{ path: string; content: string }>(
    `/api/workspace/files/${filePath}`,
    { params }
  );
  return data;
}

// ── Migration ────────────────────────────────────────────────────────────────

export interface MigrationIssue {
  id: string;
  job_id: string;
  migration_id: string;
  title: string;
  severity: string;
  effort: string;
  files: string;
  description: string;
  migration_hint: string;
  status: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface MigrationSummary {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  skipped: number;
}

export interface MigrationStatus {
  job_id: string;
  summary: MigrationSummary;
  issues: MigrationIssue[];
}

export async function startMigration(
  jobId: string,
  migrationGoal: string,
  migrationNotes?: string
): Promise<{ status: string; migration_id: string; message: string }> {
  const { data } = await api.post(`/api/jobs/${jobId}/migrate`, {
    migration_goal: migrationGoal,
    migration_notes: migrationNotes || undefined,
  });
  return data;
}

export async function startRefactor(
  jobId: string,
  targetStack: string,
  techPreferences: string
): Promise<{ status: string; message: string }> {
  const { data } = await api.post(`/api/jobs/${jobId}/refactor`, {
    target_stack: targetStack,
    tech_preferences: techPreferences
  });
  return data;
}

export async function getMigrationStatus(jobId: string): Promise<MigrationStatus> {
  const { data } = await api.get<MigrationStatus>(`/api/jobs/${jobId}/migration`);
  return data;
}

export async function getMigrationPlan(jobId: string): Promise<Record<string, unknown>> {
  const { data } = await api.get(`/api/jobs/${jobId}/migration/plan`);
  return data;
}

export interface MigrationFileChange {
  path: string;
  change_type: string;  // A=added, M=modified, D=deleted, R=renamed
  insertions: number;
  deletions: number;
}

export interface MigrationChanges {
  job_id: string;
  baseline_commit: string;
  head_commit: string;
  total_files: number;
  total_insertions: number;
  total_deletions: number;
  files: MigrationFileChange[];
}

export async function getMigrationChanges(jobId: string): Promise<MigrationChanges> {
  const { data } = await api.get<MigrationChanges>(`/api/jobs/${jobId}/migration/changes`);
  return data;
}

/** Same JSON shape as migration/changes — git root snapshot vs HEAD after Refine runs. */
export async function getRefinementChanges(jobId: string): Promise<MigrationChanges> {
  const { data } = await api.get<MigrationChanges>(`/api/jobs/${jobId}/refinement/changes`);
  return data;
}

export interface RefinementCompareResponse {
  job_id?: string;
  path: string;
  original: string;
  modified: string;
  baseline_commit?: string;
  head_commit?: string;
  error?: string;
}

export async function getRefinementCompare(
  jobId: string,
  path: string
): Promise<RefinementCompareResponse> {
  const { data } = await api.get<RefinementCompareResponse>(`/api/jobs/${jobId}/refinement/compare`, {
    params: { path },
  });
  return data;
}

// ── Refactor ─────────────────────────────────────────────────────────────────

export interface RefactorTask {
  id: string;
  job_id: string;
  file_path: string;
  action: string;
  instruction: string;
  status: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface RefactorSummary {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  skipped: number;
}

export interface RefactorStatus {
  job_id: string;
  summary: RefactorSummary;
  tasks: RefactorTask[];
}

export async function getRefactorStatus(jobId: string): Promise<RefactorStatus> {
  const { data } = await api.get<RefactorStatus>(`/api/jobs/${jobId}/refactor`);
  return data;
}

// ── Skills ───────────────────────────────────────────────────────────────────
export async function getSkills(): Promise<{ skills: SkillInfo[]; available: boolean }> {
  const { data } = await api.get<{ skills: SkillInfo[]; available: boolean }>('/api/skills');
  return data;
}

export async function querySkills(
  query: string,
  topK = 5,
  tags?: string[],
): Promise<{ results: SkillSearchResult[]; available: boolean }> {
  const payload: { query: string; top_k: number; tags?: string[] } = { query, top_k: topK };
  if (tags && tags.length > 0) payload.tags = tags;
  const { data } = await api.post<{ results: SkillSearchResult[]; available: boolean }>(
    '/api/skills/query',
    payload,
  );
  return data;
}

export async function reloadSkills(): Promise<{ status: string }> {
  const { data } = await api.post<{ status: string }>('/api/skills/reload');
  return data;
}

// ── Jira configuration ───────────────────────────────────────────────────────

export interface JiraConfig {
  configured: boolean;
  jira_base_url?: string;
  jira_email?: string;
  api_token_masked?: string;
  updated_at?: string;
}

export interface JiraConfigInput {
  jira_base_url: string;
  jira_email: string;
  api_token: string;
}

export interface JiraTestResult {
  ok: boolean;
  display_name?: string;
  account_id?: string;
  error?: string;
}

export async function getJiraConfig(): Promise<JiraConfig> {
  const { data } = await api.get<JiraConfig>('/api/jira/config');
  return data;
}

export async function saveJiraConfig(cfg: JiraConfigInput): Promise<{ saved: boolean }> {
  const { data } = await api.post<{ saved: boolean }>('/api/jira/config', cfg);
  return data;
}

export async function deleteJiraConfig(): Promise<{ deleted: boolean }> {
  const { data } = await api.delete<{ deleted: boolean }>('/api/jira/config');
  return data;
}

export async function testJiraConnection(cfg: JiraConfigInput): Promise<JiraTestResult> {
  const { data } = await api.post<JiraTestResult>('/api/jira/test-connection', cfg);
  return data;
}

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  issue_type: string;
  priority: string;
  project: string;
  url: string;
}

export interface JiraSearchResult {
  issues: JiraIssue[];
  total: number;
}

export async function searchJiraIssues(q: string, project?: string): Promise<JiraSearchResult> {
  const params: Record<string, string> = { q };
  if (project) params.project = project;
  const { data } = await api.get<JiraSearchResult>('/api/jira/search', { params });
  return data;
}

// ── Health ───────────────────────────────────────────────────────────────────
export async function getHealth(): Promise<HealthCheck> {
  const { data } = await api.get<HealthCheck>('/health');
  return data;
}

export async function getHealthReady(): Promise<HealthCheck> {
  const { data } = await api.get<HealthCheck>('/health/ready');
  return data;
}

// ── LLM Configuration ────────────────────────────────────────────────────────

export interface LlmConfig {
  configured: boolean;
  api_base_url?: string;
  api_token_masked?: string;
  model_manager?: string;
  model_worker?: string;
  model_reviewer?: string;
  updated_at?: string;
}

export interface LlmSaveRequest {
  api_base_url: string;
  api_key: string;
  model_manager?: string;
  model_worker?: string;
  model_reviewer?: string;
}

export async function getLlmConfig(): Promise<LlmConfig> {
  const { data } = await api.get<LlmConfig>('/api/llm/config');
  return data;
}

/** Whether the current user can create LLM jobs (BYOK or server fallback). */
export interface LlmStatus {
  configured: boolean;
  source: 'byok' | 'server' | 'none' | string;
  hint?: string;
}

export async function getLlmStatus(): Promise<LlmStatus> {
  const { data } = await api.get<LlmStatus>('/api/llm/status');
  return data;
}

/** Extract a user-facing message from a create-job / API error (incl. llm_not_configured). */
export function formatJobCreateError(err: unknown, fallback = 'Failed to create project. Please try again.'): string {
  if (!err || typeof err !== 'object') return fallback;
  const ax = err as { response?: { data?: { detail?: unknown; error?: string; hint?: string } }; message?: string };
  const detail = ax.response?.data?.detail;
  if (detail && typeof detail === 'object' && detail !== null) {
    const d = detail as { code?: string; message?: string; hint?: string };
    if (d.code === 'llm_not_configured') {
      return d.message
        ? `${d.message}${d.hint ? ` ${d.hint}` : ''}`
        : 'No LLM API key configured. Go to Settings → API Configuration.';
    }
    if (typeof d.message === 'string') return d.message;
  }
  if (typeof detail === 'string') return detail;
  if (typeof ax.response?.data?.error === 'string') {
    const hint = ax.response.data.hint;
    return hint ? `${ax.response.data.error} ${hint}` : ax.response.data.error;
  }
  if (typeof ax.message === 'string' && ax.message) return ax.message;
  return fallback;
}

export async function getLlmModels(): Promise<{ models: string[] }> {
  const { data } = await api.get<{ models: string[] }>('/api/llm/models');
  return data;
}

export async function saveLlmConfig(config: LlmSaveRequest): Promise<{ saved: boolean }> {
  const { data } = await api.post<{ saved: boolean }>('/api/llm/config', config);
  return data;
}

export async function deleteLlmConfig(): Promise<{ deleted: boolean }> {
  const { data } = await api.delete<{ deleted: boolean }>('/api/llm/config');
  return data;
}

export async function testLlmConnection(config: LlmSaveRequest): Promise<{ ok: boolean; message?: string; error?: string }> {
  const { data } = await api.post<{ ok: boolean; message?: string; error?: string }>('/api/llm/test-connection', config);
  return data;
}

// ── GitHub configuration ─────────────────────────────────────────────────────

export interface GitHubConfig {
  configured: boolean;
  github_username?: string;
  api_token_masked?: string;
  updated_at?: string;
}

export interface GitHubConfigInput {
  api_token: string;
}

export interface GitHubTestResult {
  ok: boolean;
  login?: string;
  name?: string;
  error?: string;
}

export async function getGithubConfig(): Promise<GitHubConfig> {
  const { data } = await api.get<GitHubConfig>('/api/github/config');
  return data;
}

export async function saveGithubConfig(cfg: GitHubConfigInput): Promise<{ saved: boolean; configured?: boolean; github_username?: string }> {
  const { data } = await api.post<{ saved: boolean; configured?: boolean; github_username?: string }>('/api/github/config', cfg);
  return data;
}

export async function deleteGithubConfig(): Promise<{ deleted: boolean }> {
  const { data } = await api.delete<{ deleted: boolean }>('/api/github/config');
  return data;
}

export async function testGithubConnection(cfg: GitHubConfigInput): Promise<GitHubTestResult> {
  const { data } = await api.post<GitHubTestResult>('/api/github/test-connection', cfg);
  return data;
}

// ── Workflow configuration ───────────────────────────────────────────────────

export interface WorkflowConfig {
  configured: boolean;
  plan_review_enabled: boolean;
  solutioning_enabled: boolean;
  solutioning_max_passes: number;
  solutioning_max_github_searches: number;
  auto_approve_plan: boolean;
  tldr_enabled: boolean;
  tldr_max_chars: number;
  tldr_include_structure: boolean;
  tldr_min_completed_files: number;
  parallel_file_workers: number;
  updated_at?: string | null;
}

export type WorkflowConfigInput = Omit<WorkflowConfig, 'configured' | 'updated_at'>;

export async function getWorkflowConfig(): Promise<WorkflowConfig> {
  const { data } = await api.get<WorkflowConfig>('/api/workflow/config');
  return data;
}

export async function saveWorkflowConfig(cfg: WorkflowConfigInput): Promise<{ saved: boolean } & WorkflowConfigInput> {
  const { data } = await api.post<{ saved: boolean } & WorkflowConfigInput>('/api/workflow/config', cfg);
  return data;
}

export async function deleteWorkflowConfig(): Promise<{ deleted: boolean }> {
  const { data } = await api.delete<{ deleted: boolean }>('/api/workflow/config');
  return data;
}

// ── MCP configuration ────────────────────────────────────────────────────────

export interface McpConfig {
  server_name: string;
  target_agent: string;
  transport_type: string;
  command?: string | null;
  args: string[];
  url?: string | null;
  env: Record<string, string>;
  tools: string[];
  updated_at: string;
}

export type McpConfigInput = Omit<McpConfig, 'updated_at'>;

export async function getMcpConfigs(): Promise<McpConfig[]> {
  const { data } = await api.get<McpConfig[]>('/api/mcp/configs');
  return data;
}

export async function saveMcpConfig(cfg: McpConfigInput): Promise<{ saved: boolean }> {
  const { data } = await api.post<{ saved: boolean }>('/api/mcp/configs', cfg);
  return data;
}

export async function deleteMcpConfig(serverName: string): Promise<{ deleted: boolean }> {
  const { data } = await api.delete<{ deleted: boolean }>(`/api/mcp/configs/${encodeURIComponent(serverName)}`);
  return data;
}

