import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  TextArea,
  TextInput,
  Alert,
  Spinner,
  Label,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  FormSelect,
  FormSelectOption,
} from '@patternfly/react-core';
import {
  RocketIcon,
  CodeIcon,
  CubesIcon,
  LightbulbIcon,
  ArrowRightIcon,
  UploadIcon,
  TimesIcon,
  FileIcon,
  FileCodeIcon,
  FileAltIcon,
  GithubIcon,
  PlusCircleIcon,
} from '@patternfly/react-icons';
import {
  createJob,
  createMigrationJob,
  createRefactorJob,
  createImportJob,
  getBackends,
  startMigration,
  startRefactor,
  startImportAnalysis,
  getMigrationStatus,
  searchJiraIssues,
  getJiraConfig,
  getGithubConfig,
  previewCapabilities,
} from '../api/client';
import type { BackendOption } from '../types';
import type { JiraIssue, SolutioningPath } from '../api/client';
import BuildProgress from '../components/BuildProgress';
import { useWorkflowPrefs } from '../hooks/useWorkflowPrefs';
import { useAuth } from '../auth/OAuthProvider';

type ProjectMode = 'build' | 'migration' | 'refactor' | 'import';

/* ── Constants ────────────────────────────────────────────────────────────── */
const ALLOWED_EXT = new Set([
  'txt', 'md', 'pdf', 'json', 'yaml', 'yml', 'csv', 'xml',
  'py', 'js', 'ts', 'java', 'go', 'rs', 'rb', 'sh',
  'html', 'css', 'sql', 'proto', 'graphql',
  'png', 'jpg', 'jpeg', 'svg',
  'doc', 'docx', 'pptx', 'xlsx',
]);

const MTA_REPORT_EXT = new Set(['json', 'csv', 'html', 'xml', 'yaml', 'yml', 'txt']);

const GITHUB_URL_RE = /^https?:\/\/github\.com\/[\w.\-]+\/[\w.\-]+(\/.*)?$/;

const CAPABILITY_HELPERS: Record<SolutioningPath, string> = {
  full: 'Full: research stack options, critique the approach, then plan & build. Best for apps, APIs, and multi-tier systems.',
  adaptive: 'Auto: backend infers Fast or Full from your vision (e.g. simple client page → Fast; named framework / API → Full).',
  fast: 'Fast: skip stack research. Lock constraints from your vision, then plan & build as usual (including tech_stack.md). Best for simple pages, widgets, and single-file deliverables.',
};

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['py', 'js', 'ts', 'java', 'go', 'rs', 'rb', 'sh', 'sql', 'html', 'css'].includes(ext))
    return <FileCodeIcon style={{ color: '#4A90E2' }} />;
  if (['md', 'txt', 'pdf', 'doc', 'docx', 'pptx', 'xlsx'].includes(ext))
    return <FileAltIcon style={{ color: '#7B68EE' }} />;
  return <FileIcon style={{ color: '#6A6E73' }} />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Component ────────────────────────────────────────────────────────────── */
const Landing: React.FC = () => {
  const navigate = useNavigate();

  // Project mode
  const [projectMode, setProjectMode] = useState<ProjectMode>('build');

  // Form state (shared)
  const [vision, setVision] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [githubUrls, setGithubUrls] = useState<string[]>([]);
  const [githubInput, setGithubInput] = useState('');
  const [githubError, setGithubError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Migration-specific state
  const [migrationNotes, setMigrationNotes] = useState('');
  const [mtaReportFiles, setMtaReportFiles] = useState<File[]>([]);
  const mtaReportRef = useRef<HTMLInputElement>(null);
  const [targetStack, setTargetStack] = useState('');
  const [techPreferences, setTechPreferences] = useState('');
  /** Optional context for Import & Iterate jobs (stored in job vision / tech_stack LLM). */
  const [importDescription, setImportDescription] = useState('');
  const [sourceArchive, setSourceArchive] = useState<File | null>(null);
  const sourceArchiveRef = useRef<HTMLInputElement>(null);
  const [mtaDragActive, setMtaDragActive] = useState(false);
  const [srcDragActive, setSrcDragActive] = useState(false);

  // Team scoping — populated from the JWT by useAuth
  const { teams, loading: authLoading } = useAuth();
  const [selectedTeam, setSelectedTeam] = useState<string | undefined>(undefined);
  const [teamSelectOpen, setTeamSelectOpen] = useState(false);

  // Backend selection
  const [backends, setBackends] = useState<BackendOption[]>([]);
  const [selectedBackend, setSelectedBackend] = useState('opl-ai-team');
  const [backendSelectOpen, setBackendSelectOpen] = useState(false);

  // Adaptive stack contract — Capability path (default Auto / adaptive infer)
  const [solutioningPath, setSolutioningPath] = useState<SolutioningPath>('adaptive');
  const [suggestedPath, setSuggestedPath] = useState<'fast' | 'full' | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Workflow prefs — controls per-job auto-approve override
  const { prefs } = useWorkflowPrefs();
  // per-job: true means skip review even if server plan_review is enabled
  const [reviewPlanOverride, setReviewPlanOverride] = useState<boolean | null>(null);
  const [reviewPlanSelectOpen, setReviewPlanSelectOpen] = useState(false);
  // resolved: null → follow global pref; true/false → explicit per-job choice
  const effectiveAutoApprove = reviewPlanOverride !== null
    ? reviewPlanOverride
    : prefs.autoApprovePlan;

  // Jira issue linking
  const [jiraConnected, setJiraConnected] = useState(false);
  const [inputMode, setInputMode] = useState<'vision' | 'jira'>('vision');
  const [jiraQuery, setJiraQuery] = useState('');
  const [jiraResults, setJiraResults] = useState<JiraIssue[]>([]);
  const [jiraSearching, setJiraSearching] = useState(false);
  const [jiraSearchError, setJiraSearchError] = useState<string | null>(null);
  const [selectedJiraIssue, setSelectedJiraIssue] = useState<JiraIssue | null>(null);
  const [jiraPickerOpen, setJiraPickerOpen] = useState(false);
  const jiraSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jiraInputRef = useRef<HTMLInputElement>(null);

  // GitHub connection status + optional target repo name for auto-push on build completion
  const [githubConnected, setGithubConnected] = useState(false);
  const [targetRepoName, setTargetRepoName] = useState('');

  // Build state — when set, we switch to split view
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [submittedVision, setSubmittedVision] = useState('');

  // Load available backends on mount
  useEffect(() => {
    getBackends()
      .then(setBackends)
      .catch((err) => {
        console.error('Failed to load backends:', err);
        setBackends([{ name: 'opl-ai-team', display_name: 'OPL AI Team', available: true }]);
      });
  }, []);

  // Optional: debounce preview-capabilities while typing a vision
  useEffect(() => {
    if (projectMode !== 'build' || inputMode !== 'vision') {
      setSuggestedPath(null);
      return;
    }
    const trimmed = vision.trim();
    if (trimmed.length < 20) {
      setSuggestedPath(null);
      return;
    }
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      previewCapabilities(trimmed)
        .then((profile) => {
          if (profile.suggested_path === 'fast' || profile.suggested_path === 'full') {
            setSuggestedPath(profile.suggested_path);
          }
        })
        .catch(() => {
          /* preview is best-effort; ignore failures */
        });
    }, 600);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [vision, projectMode, inputMode]);

  // Check whether the user has Jira configured — wait for auth to finish loading
  useEffect(() => {
    if (authLoading) return;
    getJiraConfig()
      .then((cfg) => setJiraConnected(cfg.configured))
      .catch(() => setJiraConnected(false));
  }, [authLoading]);

  // Check whether the user has GitHub configured — controls "push to GitHub" field on Build
  useEffect(() => {
    if (authLoading) return;
    getGithubConfig()
      .then((cfg) => setGithubConnected(cfg.configured))
      .catch(() => setGithubConnected(false));
  }, [authLoading]);

  /* ── Jira issue search ───────────────────────────────────────────────────── */
  const handleJiraQueryChange = (q: string) => {
    setJiraQuery(q);
    setJiraPickerOpen(true);
    if (jiraSearchTimer.current) clearTimeout(jiraSearchTimer.current);
    if (!q.trim()) { setJiraResults([]); return; }
    jiraSearchTimer.current = setTimeout(async () => {
      setJiraSearching(true);
      setJiraSearchError(null);
      try {
        const res = await searchJiraIssues(q.trim());
        setJiraResults(res.issues);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const isNotConfigured = msg.includes('424') || msg.includes('not configured') || msg.includes('credentials');
        setJiraSearchError(isNotConfigured ? 'Jira not connected — go to Settings → Jira to connect.' : 'Search failed.');
        setJiraResults([]);
      } finally {
        setJiraSearching(false);
      }
    }, 350);
  };

  const handleSelectJiraIssue = (issue: JiraIssue) => {
    setSelectedJiraIssue(issue);
    setVision(`${issue.key}: ${issue.summary}`);
    setJiraPickerOpen(false);
    setJiraQuery('');
    setJiraResults([]);
  };

  const handleClearJiraIssue = () => {
    setSelectedJiraIssue(null);
    setVision('');
    setJiraQuery('');
    setJiraResults([]);
    setJiraPickerOpen(false);
    setTimeout(() => jiraInputRef.current?.focus(), 50);
  };

  const switchInputMode = (mode: 'vision' | 'jira') => {
    setInputMode(mode);
    if (mode === 'vision') {
      // If vision was auto-filled from Jira, clear it so user gets a blank slate
      if (selectedJiraIssue) {
        setVision('');
        setSelectedJiraIssue(null);
      }
    }
  };

  /* ── File handling ──────────────────────────────────────────────────────── */
  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      return ALLOWED_EXT.has(ext) && f.size <= 10 * 1024 * 1024;
    });
    setFiles((prev) => {
      const names = new Set(prev.map((p) => p.name));
      const deduped = arr.filter((f) => !names.has(f.name));
      return [...prev, ...deduped].slice(0, 20);
    });
  }, []);

  const removeFile = (name: string) => setFiles((prev) => prev.filter((f) => f.name !== name));

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  /* ── GitHub URL handling ────────────────────────────────────────────────── */
  const addGithubUrl = () => {
    const url = githubInput.trim();
    if (!url) return;
    if (!GITHUB_URL_RE.test(url)) { setGithubError('Enter a valid GitHub URL'); return; }
    if (githubUrls.includes(url)) { setGithubError('Already added'); return; }
    if (githubUrls.length >= 5) { setGithubError('Max 5 repos'); return; }
    setGithubUrls((prev) => [...prev, url]);
    setGithubInput('');
    setGithubError(null);
  };

  const removeGithubUrl = (url: string) => setGithubUrls((prev) => prev.filter((u) => u !== url));

  const extractRepoName = (url: string) => {
    const parts = url.replace(/\/+$/, '').split('/');
    return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1].split('/')[0]}` : url;
  };

  /* ── MTA report file handling ──────────────────────────────────────────── */
  const addMtaReport = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const valid: File[] = [];
    const rejected: string[] = [];
    for (const f of arr) {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (!MTA_REPORT_EXT.has(ext)) {
        rejected.push(f.name);
      } else if (f.size > 50 * 1024 * 1024) {
        rejected.push(`${f.name} (>50 MB)`);
      } else {
        valid.push(f);
      }
    }
    if (rejected.length > 0) {
      setError(`Unsupported file(s) skipped: ${rejected.join(', ')}. Allowed: JSON, CSV, HTML, XML, YAML, TXT.`);
    }
    setMtaReportFiles((prev) => {
      const names = new Set(prev.map((p) => p.name));
      const deduped = valid.filter((f) => !names.has(f.name));
      return [...prev, ...deduped].slice(0, 10);
    });
  }, []);

  const removeMtaReport = (name: string) =>
    setMtaReportFiles((prev) => prev.filter((f) => f.name !== name));

  const handleMtaReportDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMtaDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleMtaReportDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMtaDragActive(false);
    if (e.dataTransfer.files?.length) addMtaReport(e.dataTransfer.files);
  }, [addMtaReport]);

  /* ── Source archive handling (migration mode — ZIP only) ───────────────── */
  const handleSourceArchive = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext !== 'zip') {
      setError('Source code must be a .zip file. Please zip your project folder and upload it.');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError('ZIP file must be under 100 MB');
      return;
    }
    setSourceArchive(file);
    setError(null);
  }, []);

  const handleSourceArchiveDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSrcDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleSourceArchiveDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSrcDragActive(false);
    handleSourceArchive(e.dataTransfer.files);
  }, [handleSourceArchive]);

  /* ── Submit ─────────────────────────────────────────────────────────────── */
  const handleCreateProject = async () => {
    if (!vision.trim()) { setError('Please describe your project vision'); return; }
    setCreating(true);
    setError(null);
    try {
      const result = await createJob(
        vision,
        files.length > 0 ? files : undefined,
        githubUrls.length > 0 ? githubUrls : undefined,
        selectedBackend,
        selectedTeam,
        effectiveAutoApprove,
        selectedJiraIssue ?? undefined,
        githubConnected ? (targetRepoName.trim() || undefined) : undefined,
        // Always send an explicit profile so Auto vs Fast vs Full is visible in job metadata.
        { solutioning_path: solutioningPath, source: 'user' },
      );
      setSubmittedVision(vision);
      setActiveJobId(result.job_id);
    } catch (err) {
      setError('Failed to create project. Please try again.');
      console.error('Error creating job:', err);
    } finally {
      setCreating(false);
    }
  };

  // Pre-submit readiness checks for migration mode
  const migrationReady = {
    hasReport: mtaReportFiles.length > 0,
    hasSource: sourceArchive !== null || githubUrls.length > 0,
  };
  const canSubmitMigration = migrationReady.hasReport && migrationReady.hasSource && !creating;

  const handleCreateMigrationProject = async () => {
    // Double-check readiness — belt and suspenders
    if (!migrationReady.hasReport) {
      setError('Step 1 incomplete: Please upload at least one MTA report file (JSON, CSV, HTML, XML, YAML, or TXT).');
      return;
    }
    if (!migrationReady.hasSource) {
      setError('Step 2 incomplete: Please upload a ZIP of your legacy source code or add a GitHub repo URL.');
      return;
    }

    // Verify source archive is still a valid File object (guards against stale state)
    if (sourceArchive && !(sourceArchive instanceof File)) {
      setError('Source file reference is invalid. Please re-select the ZIP file.');
      setSourceArchive(null);
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const reportNames = mtaReportFiles.map((f) => f.name).join(', ');
      const srcName = sourceArchive ? sourceArchive.name : (githubUrls.length > 0 ? githubUrls.map(u => u.replace(/\/+$/, '').split('/').pop()).join(', ') : '');
      const goalSnippet = migrationNotes ? ` — ${migrationNotes.slice(0, 80)}` : '';
      const jobLabel = `[MTA] ${srcName}${goalSnippet}`;

      // Log what we're sending for debugging
      console.log('[Migration] Submitting:', {
        reports: mtaReportFiles.map(f => `${f.name} (${f.size}b)`),
        sourceArchive: sourceArchive ? `${sourceArchive.name} (${sourceArchive.size}b)` : 'none',
        githubUrls,
      });

      // 1. Create migration job:
      //    - source_archive → extracted into workspace root (preserves dir structure)
      //    - documents (MTA reports) → workspace/docs/
      //    - mode=migration → backend skips the build pipeline
      const result = await createMigrationJob(
        jobLabel,
        sourceArchive,
        mtaReportFiles,
        githubUrls.length > 0 ? githubUrls : undefined,
        selectedBackend,
      );

      console.log('[Migration] Job created:', result);

      // Verify server actually processed the source code
      if (sourceArchive && result.source_files === 0) {
        setError(
          `Warning: Source ZIP "${sourceArchive.name}" was uploaded but the server extracted 0 files. ` +
          'Please verify the ZIP contains your source code (e.g. pom.xml, src/ directory). ' +
          `Job ${result.job_id} was created — you can upload source code manually.`
        );
        // Don't return — let the user decide. The job is already created.
      }

      // Verify MTA reports were saved
      if (result.documents === 0 && mtaReportFiles.length > 0) {
        setError(
          `Warning: ${mtaReportFiles.length} MTA report(s) were sent but the server saved 0. ` +
          'The migration may not work correctly without the report.'
        );
      }

      setSubmittedVision(`Migrate using ${reportNames}`);
      setActiveJobId(result.job_id);

      // 2. Auto-trigger migration — the analysis agent reads the report and infers the goal
      setTimeout(async () => {
        try {
          await startMigration(
            result.job_id,
            'Analyse the uploaded MTA report and apply all migration changes',
            migrationNotes || undefined,
          );
        } catch (migErr) {
          console.error('Auto-trigger migration failed:', migErr);
        }
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to create migration project: ${msg}. Please try again.`);
      console.error('Error creating migration:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleCreateRefactorProject = async () => {
    if (!targetStack.trim()) { setError('Please specify the target stack'); return; }
    if (!sourceArchive && githubUrls.length === 0) {
      setError('Please upload source code or add a GitHub repo');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const srcName = sourceArchive ? sourceArchive.name : (githubUrls.length > 0 ? githubUrls.map(u => u.replace(/\/+$/, '').split('/').pop()).join(', ') : '');
      const jobLabel = `[Refactor] ${srcName} -> ${targetStack}`;

      // 1. Create job
      const result = await createRefactorJob(
        jobLabel,
        sourceArchive,
        githubUrls.length > 0 ? githubUrls : undefined,
        selectedBackend
      );

      console.log('[Refactor] Job created:', result);
      setSubmittedVision(`Refactor to ${targetStack}`);
      setActiveJobId(result.job_id);

      // 2. Auto-trigger
      setTimeout(async () => {
        try {
          await startRefactor(result.job_id, targetStack, techPreferences || '');
        } catch (err) {
          console.error('Auto-trigger refactor failed:', err);
        }
      }, 1500);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to create refactor project: ${msg}`);
    } finally {
      setCreating(false);
    }
  };

  const handleCreateImportProject = async () => {
    if (!sourceArchive && githubUrls.length === 0) {
      setError('Please upload a ZIP of your project or add a GitHub repo');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const srcName = sourceArchive
        ? sourceArchive.name
        : (githubUrls.length > 0
          ? githubUrls.map((u) => u.replace(/\/+$/, '').split('/').pop()).join(', ')
          : '');
      const desc = importDescription.trim();
      const jobLabel = desc
        ? `[Import] ${srcName} — ${desc}`
        : `[Import] ${srcName}`;

      const result = await createImportJob(
        jobLabel,
        sourceArchive,
        githubUrls.length > 0 ? githubUrls : undefined,
        selectedBackend,
      );
      setSubmittedVision(desc || `Imported: ${srcName}`);
      setActiveJobId(result.job_id);

      setTimeout(async () => {
        try {
          await startImportAnalysis(result.job_id);
        } catch (err) {
          console.error('Auto-trigger import analysis failed:', err);
        }
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to create import project: ${msg}`);
    } finally {
      setCreating(false);
    }
  };

  const handleNewProject = () => {
    setActiveJobId(null);
    setSubmittedVision('');
    setVision('');
    setFiles([]);
    setGithubUrls([]);
    setMigrationNotes('');
    setMtaReportFiles([]);
    setSourceArchive(null);
    setTargetStack('');
    setTechPreferences('');
    setImportDescription('');
  };

  const examplePrompts = [
    'Build a REST API for a task management system',
    'Create a React dashboard with real-time charts',
    'Develop a CLI tool for data processing',
    'Build a microservice with WebSocket support',
  ];

  const contextCount = files.length + githubUrls.length;
  const isBuildMode = activeJobId !== null;

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* BUILD MODE: split panel — chat left, progress right                   */
  /* ═══════════════════════════════════════════════════════════════════════ */
  if (isBuildMode) {
    return (
      <div style={{
        minHeight: '100vh', background: '#F5F5F5',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.75rem 1.5rem', background: 'white',
          borderBottom: '1px solid #E0E0E0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img src="/redhat-logo.svg" alt="Red Hat" style={{ height: '18px' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <span style={{
              fontSize: '0.875rem', fontWeight: 600, color: '#151515',
              fontFamily: '"Red Hat Display", sans-serif',
            }}>
              AI Development Studio
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button variant="link" size="sm" onClick={handleNewProject}
              style={{ fontSize: '0.8125rem' }}>
              + New Project
            </Button>
            <Button variant="link" size="sm" onClick={() => navigate('/dashboard')}
              icon={<ArrowRightIcon />} iconPosition="end"
              style={{ fontSize: '0.8125rem', color: '#6A6E73' }}>
              Dashboard
            </Button>
          </div>
        </div>

        {/* Split panels */}
        <div style={{
          flex: 1, display: 'flex', overflow: 'hidden',
        }}>
          {/* ── LEFT PANEL: Chat / prompt ────────────────────────────────── */}
          <div style={{
            width: '420px', minWidth: '360px',
            display: 'flex', flexDirection: 'column',
            background: 'white', borderRight: '1px solid #E0E0E0',
          }}>
            {/* Submitted prompt */}
            <div style={{
              flex: 1, overflowY: 'auto', padding: '1.5rem',
            }}>
              {/* User message */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, #4A90E2 0%, #357ABD 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: '0.75rem', fontWeight: 700,
                  }}>
                    U
                  </div>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#151515' }}>You</span>
                </div>
                <div style={{
                  background: '#F0F7FF', borderRadius: '12px',
                  padding: '1rem', fontSize: '0.875rem',
                  color: '#151515', lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  borderTopLeftRadius: '4px',
                }}>
                  {submittedVision}
                </div>

                {/* Context attachments */}
                {(files.length > 0 || githubUrls.length > 0) && (
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: '0.375rem',
                    marginTop: '0.5rem',
                  }}>
                    {githubUrls.map((url) => (
                      <span key={url} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                        background: '#F0F7FF', border: '1px solid #BEE1F4',
                        borderRadius: '6px', padding: '0.2rem 0.5rem',
                        fontSize: '0.6875rem', color: '#0066CC',
                      }}>
                        <GithubIcon style={{ fontSize: '10px' }} /> {extractRepoName(url)}
                      </span>
                    ))}
                    {files.map((f) => (
                      <span key={f.name} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                        background: '#F0F0F0', borderRadius: '6px',
                        padding: '0.2rem 0.5rem', fontSize: '0.6875rem', color: '#151515',
                      }}>
                        <FileIcon style={{ fontSize: '10px' }} /> {f.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* AI response */}
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, #EE0000 0%, #B00 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: '0.65rem', fontWeight: 700,
                  }}>
                    AI
                  </div>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#151515' }}>AI Crew</span>
                </div>
                <div style={{
                  background: '#FAFAFA', borderRadius: '12px',
                  padding: '1rem', fontSize: '0.875rem',
                  color: '#151515', lineHeight: 1.6,
                  borderTopLeftRadius: '4px',
                }}>
                  {projectMode === 'migration' ? (
                    <>
                      Got it! I'm analysing your MTA report and will apply migration changes file by file.
                      Track progress on the right panel.
                      <div style={{
                        marginTop: '0.75rem', padding: '0.75rem',
                        background: 'white', borderRadius: '8px',
                        border: '1px solid #BEE1F4', fontSize: '0.8125rem',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <ArrowRightIcon style={{ color: '#0066CC' }} />
                          <span style={{ fontWeight: 600 }}>MTA Migration</span>
                          <span style={{ color: '#6A6E73' }}>— analysing report &amp; applying changes</span>
                        </div>
                      </div>
                      {activeJobId && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <Button variant="link" size="sm"
                            onClick={() => navigate(`/migration/${activeJobId}`)}
                            style={{ fontSize: '0.8125rem', color: '#0066CC', padding: 0 }}>
                            View migration details →
                          </Button>
                        </div>
                      )}
                    </>
                  ) : projectMode === 'import' ? (
                    <>
                      Import started. We're detecting languages and frameworks, generating tech_stack.md, and indexing sources.
                      When analysis finishes, open <strong>Files</strong> and use <strong>Refine</strong> for natural-language edits (tests &amp; git tools enabled).
                      <div style={{
                        marginTop: '0.75rem', padding: '0.75rem',
                        background: 'white', borderRadius: '8px',
                        border: '1px solid #C3E6CB', fontSize: '0.8125rem',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <FileCodeIcon style={{ color: '#3E8635' }} />
                          <span style={{ fontWeight: 600 }}>Import &amp; Iterate</span>
                          <span style={{ color: '#6A6E73' }}>— analysis, then prompt-based coding</span>
                        </div>
                      </div>
                      {activeJobId && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <Button variant="link" size="sm"
                            onClick={() => navigate(`/files?job=${activeJobId}`)}
                            style={{ fontSize: '0.8125rem', color: '#3E8635', padding: 0 }}>
                            Open Files →
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      Got it! I'm assembling the crew and starting to build your project.
                      You can see the real-time progress on the right panel.
                      <div style={{
                        marginTop: '0.75rem', padding: '0.75rem',
                        background: 'white', borderRadius: '8px',
                        border: '1px solid #E0E0E0', fontSize: '0.8125rem',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <CubesIcon style={{ color: '#4A90E2' }} />
                          <span style={{ fontWeight: 600 }}>6 AI Agents</span>
                          <span style={{ color: '#6A6E73' }}>are working on your project</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom: new prompt input (future follow-up) */}
            <div style={{
              padding: '1rem 1.5rem', borderTop: '1px solid #F0F0F0',
              background: '#FAFAFA',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: 'white', border: '1px solid #D2D2D2',
                borderRadius: '10px', padding: '0.5rem 0.75rem',
                opacity: 0.5, cursor: 'not-allowed',
              }}>
                <input
                  disabled
                  placeholder="Follow-up messages coming soon..."
                  style={{
                    flex: 1, border: 'none', background: 'transparent',
                    fontSize: '0.8125rem', outline: 'none', cursor: 'not-allowed',
                    fontFamily: '"Red Hat Text", sans-serif',
                  }}
                />
              </div>
            </div>
          </div>

          {/* ── RIGHT PANEL: Build Progress ──────────────────────────────── */}
          <div style={{
            flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', padding: '1.5rem 2rem',
          }}>
            <BuildProgress jobId={activeJobId!} vision={submittedVision} />
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* IDLE MODE: side-by-side — left: prompt input, right: features (100vh) */
  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{
      height: '100vh', overflow: 'hidden',
      display: 'flex',
    }}>
      {/* Animations for right pane */}
      <style>{`
        @keyframes landingFadeInRight {
          from { opacity: 0; transform: translateX(16px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes landingFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes landingIconPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .landing-right-panel { animation: landingFadeInRight 0.5s ease-out forwards; }
        .landing-right-row { opacity: 0; animation: landingFadeInRight 0.4s ease-out forwards; }
        .landing-left-hero { animation: landingFadeIn 0.4s ease-out; }
        .landing-right-icon:hover { transform: scale(1.08); }
      `}</style>

      {/* ── LEFT: white panel — prompt input ───────────────────────────────── */}
      <div style={{
        flex: '1 1 75%', display: 'flex', flexDirection: 'column',
        background: '#FAFAFA', overflow: 'auto',
      }}>
        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.75rem 1.5rem', borderBottom: '1px solid #E7E7E7',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img src="/redhat-logo.svg" alt="Red Hat" style={{ height: '20px' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#151515', fontFamily: '"Red Hat Display", sans-serif' }}>
              AI Crew
            </span>
          </div>
          <Button variant="link" onClick={() => navigate('/dashboard')}
            style={{ color: '#72767B', fontSize: '0.8125rem' }}
            icon={<ArrowRightIcon />} iconPosition="end">
            Dashboard
          </Button>
        </div>

        {/* Main content — vertically centered */}
        <div className="landing-left-hero" style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', padding: '2rem 2.5rem',
          maxWidth: '640px', width: '100%', margin: '0 auto',
        }}>
          <h1 style={{
            fontSize: '2.25rem', fontWeight: 700,
            fontFamily: '"Red Hat Display", sans-serif',
            color: '#151515', marginBottom: '0.5rem', lineHeight: 1.15,
          }}>
            {projectMode === 'build' ? (
              <>Describe it.{' '}
                <span style={{
                  background: 'linear-gradient(135deg, #EE0000, #CC0000)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>We build it.</span>
              </>
            ) : projectMode === 'import' ? (
              <>Bring your code.{' '}
                <span style={{
                  background: 'linear-gradient(135deg, #3E8635, #1E4F2F)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>We analyze &amp; you iterate.</span>
              </>
            ) : (
              <>Upload.{' '}
                <span style={{
                  background: 'linear-gradient(135deg, #0066CC, #004080)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>We migrate it.</span>
              </>
            )}
          </h1>
          <p style={{ fontSize: '0.9375rem', color: '#72767B', marginBottom: '1rem', lineHeight: 1.5 }}>
            {projectMode === 'build'
              ? 'From idea to production-ready code, powered by 6 AI agents.'
              : projectMode === 'import'
                ? 'Upload a ZIP or clone from GitHub — we detect the stack and index the repo. Then describe edits in the Files view (Refine).'
                : 'Upload your MTA report and legacy code — AI applies every change.'}
          </p>

          {/* ── Mode toggle ──────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', borderRadius: '10px', overflow: 'hidden',
            border: '1px solid #D2D2D2', marginBottom: '1.25rem', alignSelf: 'flex-start', maxWidth: '100%',
          }}>
            {([
              { key: 'build' as ProjectMode, label: 'Build New Project', icon: <RocketIcon style={{ fontSize: '0.75rem' }} /> },
              { key: 'import' as ProjectMode, label: 'Import & Iterate', icon: <FileCodeIcon style={{ fontSize: '0.75rem' }} /> },
              { key: 'migration' as ProjectMode, label: 'MTA Migration', icon: <ArrowRightIcon style={{ fontSize: '0.75rem' }} /> },
              { key: 'refactor' as ProjectMode, label: 'Refactor Agent', icon: <CodeIcon style={{ fontSize: '0.75rem' }} /> },
            ]).map((m) => (
              <button
                key={m.key}
                onClick={() => { setProjectMode(m.key); setError(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  padding: '0.45rem 1rem', border: 'none', cursor: 'pointer',
                  fontSize: '0.8125rem', fontWeight: 600,
                  fontFamily: '"Red Hat Text", sans-serif',
                  background: projectMode === m.key
                    ? (m.key === 'build' ? '#EE0000' : m.key === 'import' ? '#3E8635' : '#0066CC')
                    : 'white',
                  color: projectMode === m.key ? 'white' : '#72767B',
                  transition: 'all 0.2s',
                }}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>

          {error && (
            <Alert variant="danger" title={error} style={{ marginBottom: '1rem' }} isInline isPlain
              actionClose={<Button variant="plain" onClick={() => setError(null)}>×</Button>} />
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* BUILD NEW PROJECT MODE                                        */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {projectMode === 'build' && (
            <>
              {/* Input card */}
              <div style={{
                background: 'white', borderRadius: '16px',
                boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
                border: inputMode === 'jira' ? '1px solid rgba(0,102,204,0.3)' : '1px solid #E7E7E7',
                overflow: 'visible',
              }}>
                {/* Mode toggle tabs — visible always so user knows it's there */}
                <div style={{
                  display: 'flex', borderBottom: '1px solid #E7E7E7',
                  background: '#FAFAFA', borderRadius: '16px 16px 0 0',
                }}>
                  {[
                    { id: 'vision' as const, label: '✍️ Describe Vision' },
                    { id: 'jira' as const, label: '🔵 Pick from Jira' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => switchInputMode(tab.id)}
                      style={{
                        flex: 1, padding: '0.65rem 1rem', border: 'none', cursor: 'pointer',
                        fontSize: '0.8125rem', fontWeight: 600,
                        fontFamily: '"Red Hat Text", sans-serif',
                        background: inputMode === tab.id ? 'white' : 'transparent',
                        color: inputMode === tab.id ? (tab.id === 'jira' ? '#0066CC' : '#151515') : '#6A6E73',
                        borderBottom: inputMode === tab.id
                          ? `2px solid ${tab.id === 'jira' ? '#0066CC' : '#EE0000'}`
                          : '2px solid transparent',
                        transition: 'all 0.15s',
                        borderRadius: tab.id === 'vision' ? '16px 0 0 0' : '0 16px 0 0',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div style={{ padding: '1.25rem' }}>
                  {/* ── Vision mode ── */}
                  {inputMode === 'vision' && (
                    <TextArea
                      value={vision}
                      onChange={(_e, v) => setVision(v)}
                      placeholder="Describe your project vision..."
                      style={{
                        minHeight: '120px', fontSize: '0.9375rem',
                        fontFamily: '"Red Hat Text", sans-serif',
                        border: 'none', padding: '0', resize: 'none',
                        lineHeight: 1.6, color: '#151515',
                      }}
                      aria-label="Project description"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCreateProject();
                      }}
                    />
                  )}

                  {/* Capability path (Adaptive Stack Contract) */}
                  <div style={{ marginTop: '0.75rem' }}>
                    <label
                      htmlFor="capability-path"
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#151515',
                        marginBottom: '0.3rem',
                      }}
                    >
                      Capability
                    </label>
                    <FormSelect
                      id="capability-path"
                      value={solutioningPath}
                      onChange={(_e, v) => setSolutioningPath(v as SolutioningPath)}
                      aria-label="Capability"
                      style={{
                        maxWidth: '280px',
                        fontSize: '0.875rem',
                        border: '1px solid #D2D2D2',
                        borderRadius: '8px',
                      }}
                    >
                      <FormSelectOption value="adaptive" label="Auto" />
                      <FormSelectOption value="fast" label="Fast" />
                      <FormSelectOption value="full" label="Full" />
                    </FormSelect>
                    <p
                      data-testid="capability-helper"
                      style={{ fontSize: '0.75rem', color: '#6A6E73', marginTop: '0.35rem', lineHeight: 1.45 }}
                    >
                      {CAPABILITY_HELPERS[solutioningPath]}
                    </p>
                    {suggestedPath && solutioningPath === 'adaptive' && (
                      <p style={{ fontSize: '0.75rem', color: '#0066CC', marginTop: '0.25rem' }}>
                        Detected suggestion: {suggestedPath === 'fast' ? 'Fast' : 'Full'}
                      </p>
                    )}
                    {suggestedPath && solutioningPath !== 'adaptive' && suggestedPath !== solutioningPath && (
                      <p style={{ fontSize: '0.75rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                        Vision suggests {suggestedPath === 'fast' ? 'Fast' : 'Full'} — you can switch Capability if you prefer.
                      </p>
                    )}
                  </div>

                  {/* ── Jira mode ── */}
                  {inputMode === 'jira' && (
                    <div>
                      {!jiraConnected ? (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '2rem 1.5rem',
                          textAlign: 'center',
                        }}>
                          <span style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔵</span>
                          <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#151515', marginBottom: '0.5rem' }}>
                            Jira integration is not connected
                          </h4>
                          <p style={{ fontSize: '0.875rem', color: '#6A6E73', marginBottom: '1.25rem', maxWidth: '340px' }}>
                            Connect your Atlassian Jira account in Settings to search and select user stories directly.
                          </p>
                          <Button variant="secondary" onClick={() => navigate('/settings')}>
                            Configure Jira
                          </Button>
                        </div>
                      ) : selectedJiraIssue ? (
                        /* Selected issue card */
                        <div style={{
                          background: 'rgba(0,102,204,0.04)', border: '1px solid rgba(0,102,204,0.2)',
                          borderRadius: '10px', padding: '0.875rem 1rem',
                          display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                              <a
                                href={selectedJiraIssue.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{ fontWeight: 700, color: '#0066CC', fontSize: '0.875rem', textDecoration: 'none' }}
                              >
                                {selectedJiraIssue.key}
                              </a>
                              <span style={{
                                fontSize: '0.7rem', color: '#6A6E73', background: '#F0F0F0',
                                borderRadius: '4px', padding: '0.1rem 0.4rem',
                              }}>{selectedJiraIssue.issue_type}</span>
                              <span style={{
                                fontSize: '0.7rem',
                                color: selectedJiraIssue.status === 'Done' ? '#3E8635' : '#0066CC',
                                background: selectedJiraIssue.status === 'Done' ? 'rgba(62,134,53,0.08)' : 'rgba(0,102,204,0.08)',
                                borderRadius: '4px', padding: '0.1rem 0.4rem',
                              }}>{selectedJiraIssue.status}</span>
                            </div>
                            <div style={{ fontSize: '0.9375rem', color: '#151515', fontWeight: 500 }}>
                              {selectedJiraIssue.summary}
                            </div>
                          </div>
                          <button
                            onClick={handleClearJiraIssue}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: '#6A6E73', fontSize: '1rem', padding: '0.1rem 0.3rem',
                              borderRadius: '4px', lineHeight: 1,
                            }}
                            title="Change issue"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        /* Search input */
                        <div style={{ position: 'relative' }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            border: '1.5px solid rgba(0,102,204,0.4)', borderRadius: '10px',
                            padding: '0.6rem 0.875rem', background: 'white',
                          }}>
                            <span style={{ color: '#0066CC', fontSize: '1rem' }}>🔍</span>
                            <input
                              ref={jiraInputRef}
                              autoFocus
                              value={jiraQuery}
                              onChange={(e) => handleJiraQueryChange(e.target.value)}
                              onFocus={() => { if (jiraResults.length > 0) setJiraPickerOpen(true); }}
                              placeholder="Search by issue key or title — e.g. PROJ-123 or 'login page'…"
                              style={{
                                flex: 1, border: 'none', outline: 'none', fontSize: '0.9375rem',
                                fontFamily: '"Red Hat Text", sans-serif', color: '#151515',
                                background: 'transparent',
                              }}
                            />
                            {jiraSearching && <Spinner size="sm" />}
                          </div>
                          {jiraPickerOpen && (jiraResults.length > 0 || jiraSearchError) && (
                            <div style={{
                              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 300,
                              background: 'white', border: '1px solid #D2D2D2', borderRadius: '10px',
                              boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
                              maxHeight: '280px', overflowY: 'auto',
                            }}>
                              {jiraSearchError && (
                                <div style={{ padding: '0.875rem', fontSize: '0.8125rem', color: '#C9190B' }}>
                                  {jiraSearchError}
                                </div>
                              )}
                              {jiraResults.map((issue, idx) => (
                                <button
                                  key={issue.key}
                                  onClick={() => handleSelectJiraIssue(issue)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '0.625rem',
                                    width: '100%', padding: '0.625rem 0.875rem',
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    textAlign: 'left',
                                    borderBottom: idx < jiraResults.length - 1 ? '1px solid #F0F0F0' : 'none',
                                  }}
                                  onMouseOver={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
                                  onMouseOut={(e) => { e.currentTarget.style.background = 'none'; }}
                                >
                                  <span style={{ fontWeight: 700, color: '#0066CC', fontSize: '0.8125rem', whiteSpace: 'nowrap', minWidth: '70px' }}>
                                    {issue.key}
                                  </span>
                                  <span style={{ fontSize: '0.875rem', color: '#151515', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {issue.summary}
                                  </span>
                                  <span style={{
                                    fontSize: '0.7rem', color: '#6A6E73', background: '#F0F0F0',
                                    borderRadius: '4px', padding: '0.15rem 0.4rem', whiteSpace: 'nowrap',
                                  }}>
                                    {issue.status}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bottom bar: backend + submit */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginTop: '0.75rem', paddingTop: '0.75rem',
                    borderTop: '1px solid #F0F0F0',
                  }}>
                    <Select
                      toggle={(toggleRef) => (
                        <MenuToggle ref={toggleRef}
                          onClick={() => setBackendSelectOpen(!backendSelectOpen)}
                          isExpanded={backendSelectOpen}
                          style={{ fontSize: '0.8125rem', padding: '0.3rem 0.75rem', minWidth: '150px', border: '1px solid #D2D2D2', borderRadius: '8px' }}
                        >
                          {backends.find((b) => b.name === selectedBackend)?.display_name || 'OPL AI Team'}
                        </MenuToggle>
                      )}
                      onSelect={(_e, s) => { setSelectedBackend(s as string); setBackendSelectOpen(false); }}
                      selected={selectedBackend}
                      isOpen={backendSelectOpen}
                      onOpenChange={setBackendSelectOpen}
                      aria-label="Select agentic system"
                    >
                      <SelectList>
                        {backends.map((b) => (
                          <SelectOption key={b.name} value={b.name} isDisabled={!b.available}>
                            {b.display_name}{!b.available && <span style={{ color: '#8A8D90', fontSize: '0.7rem', marginLeft: '0.4rem' }}>(N/A)</span>}
                          </SelectOption>
                        ))}
                      </SelectList>
                    </Select>
                    <Button variant="primary" onClick={handleCreateProject}
                      isLoading={creating}
                      isDisabled={creating || (inputMode === 'vision' ? !vision.trim() : !selectedJiraIssue)}
                      style={{
                        backgroundColor: inputMode === 'jira' ? '#0066CC' : '#EE0000',
                        border: 'none', fontWeight: 600,
                        padding: '0.5rem 1.75rem', fontSize: '0.875rem', borderRadius: '10px', color: 'white',
                      }}
                      icon={creating ? <Spinner size="sm" /> : <RocketIcon />} iconPosition="end">
                      {creating ? 'Creating...' : 'Start Building'}
                    </Button>
                  </div>

                  {/* Per-job review gate toggle (plan + solution) */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    marginTop: '1rem', flexWrap: 'wrap',
                  }}>
                    <Label style={{ background: 'transparent', padding: 0, color: '#151515', fontWeight: 600 }}>Approvals:</Label>
                    <Select
                      id="plan-review-select"
                      isOpen={reviewPlanSelectOpen}
                      selected={effectiveAutoApprove ? 'auto' : 'review'}
                      onSelect={(_e, val) => {
                        setReviewPlanOverride(val === 'auto');
                        setReviewPlanSelectOpen(false);
                      }}
                      onOpenChange={(isOpen) => setReviewPlanSelectOpen(isOpen)}
                      toggle={(toggleRef) => (
                        <MenuToggle
                          ref={toggleRef}
                          onClick={() => setReviewPlanSelectOpen(!reviewPlanSelectOpen)}
                          isExpanded={reviewPlanSelectOpen}
                          style={{
                            backgroundColor: 'white', border: '1px solid #D2D2D2',
                            borderRadius: '8px', fontSize: '0.875rem',
                            minWidth: '240px', color: '#151515',
                          }}
                        >
                          {effectiveAutoApprove ? '⚡ Auto-approve reviews' : '🔍 Review before coding'}
                        </MenuToggle>
                      )}
                    >
                      <SelectList>
                        <SelectOption value="review" description="Pause for solution and plan approval before generating code.">
                          🔍 Review before coding
                        </SelectOption>
                        <SelectOption value="auto" description="Skip solution and plan review gates — continue straight to build.">
                          ⚡ Auto-approve reviews
                        </SelectOption>
                      </SelectList>
                    </Select>
                    {reviewPlanOverride !== null && (
                      <Button
                        variant="link"
                        isInline
                        onClick={() => setReviewPlanOverride(null)}
                        style={{ fontSize: '0.75rem' }}
                      >
                        Reset to default
                      </Button>
                    )}
                  </div>

                  {/* Optional: push generated project to a new GitHub repo on completion */}
                  {githubConnected && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <label
                        htmlFor="target-repo-name"
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.35rem',
                          fontSize: '0.8rem', fontWeight: 600, color: '#151515', marginBottom: '0.3rem',
                        }}
                      >
                        <GithubIcon style={{ fontSize: '0.8rem' }} /> Push to GitHub repo (optional)
                      </label>
                      <TextInput
                        id="target-repo-name"
                        value={targetRepoName}
                        onChange={(_e, v) => setTargetRepoName(v)}
                        placeholder="auto — crew-ai-your-project-name"
                        style={{ fontSize: '0.8125rem' }}
                      />
                      <p style={{ fontSize: '0.75rem', color: '#6A6E73', marginTop: '0.3rem' }}>
                        A new private repo will be created under your GitHub account and the generated
                        code pushed to it once the build completes.
                      </p>
                    </div>
                  )}
                </div>


              </div>

              {/* Example prompt pills */}
              <div style={{ marginTop: '0.875rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {examplePrompts.map((p) => (
                  <button key={p} onClick={() => setVision(p)} style={{
                    background: 'rgba(238,0,0,0.04)', border: '1px solid rgba(238,0,0,0.12)',
                    borderRadius: '999px', padding: '0.3rem 0.75rem',
                    fontSize: '0.75rem', color: '#CC0000', cursor: 'pointer',
                    fontFamily: '"Red Hat Text", sans-serif', transition: 'all 0.15s', lineHeight: 1.4,
                  }}
                    onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(238,0,0,0.10)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(238,0,0,0.04)'; }}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {/* Context attachments — compact */}
              <details style={{
                background: 'white', borderRadius: '10px', border: '1px solid #E7E7E7',
                marginTop: '1rem',
              }}>
                <summary style={{
                  padding: '0.625rem 1rem', cursor: 'pointer',
                  fontSize: '0.8125rem', fontWeight: 600, color: '#151515',
                  listStyle: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span>+ Add Context (GitHub repos, files)</span>
                  {contextCount > 0 && (
                    <span style={{ background: '#EE0000', color: 'white', borderRadius: '12px', padding: '0.1rem 0.45rem', fontSize: '0.7rem', fontWeight: 600 }}>{contextCount}</span>
                  )}
                </summary>
                <div style={{ padding: '0 1rem 1rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#FAFAFA', border: '1px solid #D2D2D2', borderRadius: '8px', padding: '0.1rem 0.6rem' }}>
                      <GithubIcon style={{ color: '#151515', fontSize: '0.8rem', flexShrink: 0 }} />
                      <TextInput value={githubInput} onChange={(_e, v) => { setGithubInput(v); setGithubError(null); }}
                        placeholder="https://github.com/user/repo" aria-label="GitHub URL"
                        style={{ border: 'none', background: 'transparent', fontSize: '0.8125rem', padding: '0.35rem 0' }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGithubUrl(); } }} />
                    </div>
                    <Button variant="secondary" size="sm" onClick={addGithubUrl} isDisabled={!githubInput.trim()} icon={<PlusCircleIcon />}>Add</Button>
                  </div>
                  {githubError && <span style={{ fontSize: '0.7rem', color: '#C9190B', display: 'block', marginBottom: '0.4rem' }}>{githubError}</span>}
                  {githubUrls.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
                      {githubUrls.map((url) => (
                        <span key={url} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#F0F7FF', border: '1px solid #BEE1F4', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
                          <GithubIcon style={{ fontSize: '0.7rem', color: '#0066CC' }} />{extractRepoName(url)}
                          <button onClick={() => removeGithubUrl(url)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', display: 'flex', color: '#6A6E73' }}><TimesIcon style={{ fontSize: '0.65rem' }} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{ padding: '0.6rem', border: `2px dashed ${dragActive ? '#EE0000' : '#D2D2D2'}`, borderRadius: '8px', background: dragActive ? 'rgba(238,0,0,0.02)' : '#FAFAFA', cursor: 'pointer', textAlign: 'center' }}>
                    <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
                      accept={Array.from(ALLOWED_EXT).map((e) => `.${e}`).join(',')}
                      onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
                    <UploadIcon style={{ marginRight: '0.4rem', color: '#72767B', fontSize: '0.8rem' }} />
                    <span style={{ fontSize: '0.8125rem', color: '#72767B' }}>Drop files or click</span>
                  </div>
                  {files.length > 0 && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {files.map((f) => (
                        <span key={f.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#F5F5F5', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', border: '1px solid #E7E7E7' }}>
                          {getFileIcon(f.name)}{f.name} <span style={{ color: '#8A8D90', fontSize: '0.65rem' }}>{formatSize(f.size)}</span>
                          <button onClick={(e) => { e.stopPropagation(); removeFile(f.name); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', display: 'flex', color: '#6A6E73' }}><TimesIcon style={{ fontSize: '0.65rem' }} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </details>

              <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#8A8D90' }}>
                {contextCount > 0 ? `${contextCount} reference${contextCount > 1 ? 's' : ''} attached  ·  ` : ''}
                ⌘+Enter to submit
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* MTA MIGRATION MODE                                            */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {projectMode === 'migration' && (
            <>
              <div style={{
                background: 'white', borderRadius: '16px', padding: '1.25rem',
                boxShadow: '0 2px 16px rgba(0,0,0,0.06)', border: '1px solid #E7E7E7',
                display: 'flex', flexDirection: 'column', gap: '1rem',
              }}>
                {/* Step 1: MTA Report upload */}
                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#151515', display: 'block', marginBottom: '0.3rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Label color={migrationReady.hasReport ? 'green' : 'blue'} isCompact>1</Label> MTA Report
                      {migrationReady.hasReport
                        ? <span style={{ color: '#3E8635', fontSize: '0.75rem', fontWeight: 400 }}>Ready</span>
                        : <span style={{ color: '#C9190B', fontSize: '0.75rem', fontWeight: 400 }}>Required</span>
                      }
                    </span>
                  </label>
                  <p style={{ fontSize: '0.75rem', color: '#72767B', marginBottom: '0.4rem' }}>
                    The AI reads the report to determine what to migrate — no manual goal needed.
                  </p>
                  <div
                    onDragEnter={handleMtaReportDrag} onDragLeave={handleMtaReportDrag} onDragOver={handleMtaReportDrag}
                    onDrop={handleMtaReportDrop}
                    onClick={() => mtaReportRef.current?.click()}
                    style={{
                      padding: '0.6rem', border: `2px dashed ${mtaDragActive ? '#0066CC' : '#BEE1F4'}`, borderRadius: '8px',
                      background: mtaDragActive ? 'rgba(0,102,204,0.04)' : '#F0F7FF', cursor: 'pointer', textAlign: 'center',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <input ref={mtaReportRef} type="file" multiple style={{ display: 'none' }}
                      accept=".json,.csv,.html,.xml,.yaml,.yml,.txt"
                      onChange={(e) => { if (e.target.files) addMtaReport(e.target.files); e.target.value = ''; }} />
                    <UploadIcon style={{ marginRight: '0.4rem', color: '#0066CC', fontSize: '0.8rem' }} />
                    <span style={{ fontSize: '0.8125rem', color: '#0066CC' }}>
                      {mtaReportFiles.length > 0 ? 'Add more report files' : 'Drop MTA report files here or click to upload'}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#8A8D90', marginTop: '0.15rem' }}>
                      Supported: JSON, CSV, HTML, XML, YAML, TXT (max 50 MB each)
                    </span>
                  </div>
                  {mtaReportFiles.length > 0 && (
                    <div style={{ marginTop: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {mtaReportFiles.map((f) => (
                        <span key={f.name} style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                          background: '#F0F7FF', border: '1px solid #BEE1F4', borderRadius: '6px',
                          padding: '0.2rem 0.5rem', fontSize: '0.75rem', color: '#0066CC',
                        }}>
                          <FileAltIcon style={{ fontSize: '0.7rem' }} />{f.name}
                          <span style={{ color: '#8A8D90', fontSize: '0.65rem' }}>{formatSize(f.size)}</span>
                          <button onClick={(e) => { e.stopPropagation(); removeMtaReport(f.name); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', display: 'flex', color: '#6A6E73' }}>
                            <TimesIcon style={{ fontSize: '0.65rem' }} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Step 2: Legacy source code (ZIP upload) */}
                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#151515', display: 'block', marginBottom: '0.3rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Label color={migrationReady.hasSource ? 'green' : 'blue'} isCompact>2</Label> Legacy Source Code
                      {migrationReady.hasSource
                        ? <span style={{ color: '#3E8635', fontSize: '0.75rem', fontWeight: 400 }}>Ready</span>
                        : <span style={{ color: '#C9190B', fontSize: '0.75rem', fontWeight: 400 }}>Required</span>
                      }
                    </span>
                  </label>
                  <p style={{ fontSize: '0.75rem', color: '#72767B', marginBottom: '0.4rem' }}>
                    Upload a ZIP of your project (directory structure is preserved) or paste a GitHub URL.
                  </p>
                  {/* ZIP upload */}
                  <div
                    onDragEnter={handleSourceArchiveDrag} onDragLeave={handleSourceArchiveDrag} onDragOver={handleSourceArchiveDrag}
                    onDrop={handleSourceArchiveDrop}
                    onClick={() => sourceArchiveRef.current?.click()}
                    style={{
                      padding: '0.75rem', border: `2px dashed ${srcDragActive ? '#0066CC' : (sourceArchive ? '#3E8635' : '#D2D2D2')}`,
                      borderRadius: '8px', background: srcDragActive ? 'rgba(0,102,204,0.02)' : (sourceArchive ? 'rgba(62,134,53,0.02)' : '#FAFAFA'),
                      cursor: 'pointer', textAlign: 'center', marginBottom: '0.5rem',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <input ref={sourceArchiveRef} type="file" style={{ display: 'none' }}
                      accept=".zip"
                      onChange={(e) => { handleSourceArchive(e.target.files); e.target.value = ''; }} />
                    <UploadIcon style={{ marginRight: '0.4rem', color: sourceArchive ? '#3E8635' : '#0066CC', fontSize: '0.85rem' }} />
                    <span style={{ fontSize: '0.8125rem', color: sourceArchive ? '#3E8635' : '#0066CC', fontWeight: 500 }}>
                      {sourceArchive ? 'Replace ZIP' : 'Drop project ZIP here or click to upload'}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#8A8D90', marginTop: '0.25rem' }}>
                      .zip only — max 100 MB (e.g. legacy-inventory-system.zip)
                    </span>
                  </div>
                  {sourceArchive && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                      background: 'rgba(62,134,53,0.06)', border: '1px solid rgba(62,134,53,0.3)', borderRadius: '8px',
                      padding: '0.35rem 0.6rem', marginBottom: '0.5rem',
                    }}>
                      <FileCodeIcon style={{ color: '#3E8635', fontSize: '0.85rem' }} />
                      <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#151515' }}>{sourceArchive.name}</span>
                      <span style={{ fontSize: '0.7rem', color: '#8A8D90' }}>{formatSize(sourceArchive.size)}</span>
                      <button onClick={() => setSourceArchive(null)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                        display: 'flex', color: '#6A6E73',
                      }}>
                        <TimesIcon style={{ fontSize: '0.65rem' }} />
                      </button>
                    </div>
                  )}
                  {/* Or: GitHub input (alternative to ZIP) */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    margin: '0.25rem 0', fontSize: '0.75rem', color: '#8A8D90',
                  }}>
                    <div style={{ flex: 1, height: '1px', background: '#E7E7E7' }} />
                    <span>or add a GitHub repo</span>
                    <div style={{ flex: 1, height: '1px', background: '#E7E7E7' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#FAFAFA', border: '1px solid #D2D2D2', borderRadius: '8px', padding: '0.1rem 0.6rem' }}>
                      <GithubIcon style={{ color: '#151515', fontSize: '0.8rem', flexShrink: 0 }} />
                      <TextInput value={githubInput} onChange={(_e, v) => { setGithubInput(v); setGithubError(null); }}
                        placeholder="https://github.com/user/repo" aria-label="GitHub URL"
                        style={{ border: 'none', background: 'transparent', fontSize: '0.8125rem', padding: '0.35rem 0' }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGithubUrl(); } }} />
                    </div>
                    <Button variant="secondary" size="sm" onClick={addGithubUrl} isDisabled={!githubInput.trim()} icon={<PlusCircleIcon />}>Add</Button>
                  </div>
                  {githubError && <span style={{ fontSize: '0.7rem', color: '#C9190B', display: 'block', marginTop: '0.3rem' }}>{githubError}</span>}
                  {githubUrls.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
                      {githubUrls.map((url) => (
                        <span key={url} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#F0F7FF', border: '1px solid #BEE1F4', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
                          <GithubIcon style={{ fontSize: '0.7rem', color: '#0066CC' }} />{extractRepoName(url)}
                          <button onClick={() => removeGithubUrl(url)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', display: 'flex', color: '#6A6E73' }}><TimesIcon style={{ fontSize: '0.65rem' }} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Step 3 (optional): Migration notes */}
                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#151515', display: 'block', marginBottom: '0.3rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Label color="grey" isCompact>3</Label> Instructions (optional)
                    </span>
                  </label>
                  <TextArea
                    value={migrationNotes}
                    onChange={(_e, v) => setMigrationNotes(v)}
                    placeholder="e.g., Skip files under src/auth/, preserve custom logging, focus on mandatory issues only..."
                    rows={2}
                    style={{ fontSize: '0.8125rem', fontFamily: '"Red Hat Text", sans-serif' }}
                    aria-label="Migration notes"
                  />
                </div>

                {/* Pre-submit readiness checklist + submit */}
                <div style={{
                  paddingTop: '0.75rem', borderTop: '1px solid #F0F0F0',
                }}>
                  {/* Readiness indicators */}
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.75rem' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      color: migrationReady.hasReport ? '#3E8635' : '#C9190B',
                    }}>
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block',
                        background: migrationReady.hasReport ? '#3E8635' : '#C9190B',
                      }} />
                      {migrationReady.hasReport
                        ? `${mtaReportFiles.length} report${mtaReportFiles.length !== 1 ? 's' : ''} ready`
                        : 'MTA report missing'}
                    </span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      color: migrationReady.hasSource ? '#3E8635' : '#C9190B',
                    }}>
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block',
                        background: migrationReady.hasSource ? '#3E8635' : '#C9190B',
                      }} />
                      {sourceArchive
                        ? sourceArchive.name
                        : githubUrls.length > 0
                          ? `${githubUrls.length} repo${githubUrls.length !== 1 ? 's' : ''}`
                          : 'Source code missing'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Select
                      toggle={(toggleRef) => (
                        <MenuToggle ref={toggleRef}
                          onClick={() => setBackendSelectOpen(!backendSelectOpen)}
                          isExpanded={backendSelectOpen}
                          style={{ fontSize: '0.8125rem', padding: '0.3rem 0.75rem', minWidth: '150px', border: '1px solid #D2D2D2', borderRadius: '8px' }}
                        >
                          {backends.find((b) => b.name === selectedBackend)?.display_name || 'OPL AI Team'}
                        </MenuToggle>
                      )}
                      onSelect={(_e, s) => { setSelectedBackend(s as string); setBackendSelectOpen(false); }}
                      selected={selectedBackend}
                      isOpen={backendSelectOpen}
                      onOpenChange={setBackendSelectOpen}
                      aria-label="Select agentic system"
                    >
                      <SelectList>
                        {backends.map((b) => (
                          <SelectOption key={b.name} value={b.name} isDisabled={!b.available}>
                            {b.display_name}{!b.available && <span style={{ color: '#8A8D90', fontSize: '0.7rem', marginLeft: '0.4rem' }}>(N/A)</span>}
                          </SelectOption>
                        ))}
                      </SelectList>
                    </Select>
                    <Button variant="primary" onClick={handleCreateMigrationProject}
                      isLoading={creating}
                      isDisabled={!canSubmitMigration}
                      style={{
                        backgroundColor: canSubmitMigration ? '#0066CC' : '#D2D2D2',
                        border: 'none', fontWeight: 600,
                        padding: '0.5rem 1.75rem', fontSize: '0.875rem', borderRadius: '10px', color: 'white',
                        transition: 'background-color 0.2s',
                      }}
                      icon={creating ? <Spinner size="sm" /> : <ArrowRightIcon />} iconPosition="end">
                      {creating ? 'Uploading & Starting...' : 'Start Migration'}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* REFACTOR AGENT MODE                                           */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {projectMode === 'refactor' && (
            <div style={{
              background: 'white', borderRadius: '16px', padding: '1.25rem',
              boxShadow: '0 2px 16px rgba(0,0,0,0.06)', border: '1px solid #E7E7E7',
              display: 'flex', flexDirection: 'column', gap: '1rem',
            }}>
              {/* Target Architecture Banner */}
              <div style={{
                background: 'linear-gradient(to right, #f0f9ff, #e6f2ff)',
                border: '1px solid #bae6fd',
                borderRadius: '12px',
                padding: '1rem',
                display: 'flex',
                alignItems: 'start',
                gap: '0.75rem'
              }}>
                <div style={{
                  background: '#0284c7', color: 'white', borderRadius: '50%', width: '24px', height: '24px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 'bold', fontSize: '14px'
                }}>✓</div>
                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#0369a1', fontSize: '0.9rem', fontWeight: 700 }}>
                    Target Architecture: Cloud Native & DDD
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#0c4a6e', fontSize: '0.8rem', lineHeight: '1.4' }}>
                    <li><strong>12-Factor App:</strong> Stateless processes, config via env, external backing services.</li>
                    <li><strong>Domain-Driven Design:</strong> Code organized by Bounded Contexts (e.g., <code>billing/</code>, <code>inventory/</code>).</li>
                    <li><strong>Modernization:</strong> No legacy anti-patterns allowed.</li>
                  </ul>
                </div>
              </div>

              {/* Step 1: Target Stack */}
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#151515', display: 'block', marginBottom: '0.3rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Label color={targetStack ? 'green' : 'blue'} isCompact>1</Label> Target Stack
                    {targetStack
                      ? <span style={{ color: '#3E8635', fontSize: '0.75rem', fontWeight: 400 }}>Ready</span>
                      : <span style={{ color: '#C9190B', fontSize: '0.75rem', fontWeight: 400 }}>Required</span>
                    }
                  </span>
                </label>
                <TextArea
                  value={targetStack}
                  onChange={(_e, v) => setTargetStack(v)}
                  placeholder="e.g., Migrate Java 8 to Java 17, Spring Boot 3, and replace JSP with React."
                  style={{ minHeight: '80px', fontSize: '0.9375rem', fontFamily: '"Red Hat Text", sans-serif', resize: 'vertical' }}
                  aria-label="Target Stack"
                />
              </div>

              {/* Step 2: Tech Preferences (Optional) */}
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#151515', display: 'block', marginBottom: '0.3rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Label color='blue' isCompact>2</Label> Tech Preferences
                    <span style={{ color: '#72767B', fontSize: '0.75rem', fontWeight: 400 }}>(Optional)</span>
                  </span>
                </label>
                <TextArea
                  value={techPreferences}
                  onChange={(_e, v) => setTechPreferences(v)}
                  placeholder="e.g., Use Postgres 15, Testcontainers for integration tests, Mapstruct for mapping."
                  style={{ minHeight: '60px', fontSize: '0.9375rem', fontFamily: '"Red Hat Text", sans-serif', resize: 'vertical' }}
                  aria-label="Tech Preferences"
                />
              </div>

              {/* Step 3: Legacy source code (ZIP upload) - Reusing migration components */}
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#151515', display: 'block', marginBottom: '0.3rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Label color={(sourceArchive || githubUrls.length > 0) ? 'green' : 'blue'} isCompact>3</Label> Source Code
                    {(sourceArchive || githubUrls.length > 0)
                      ? <span style={{ color: '#3E8635', fontSize: '0.75rem', fontWeight: 400 }}>Ready</span>
                      : <span style={{ color: '#C9190B', fontSize: '0.75rem', fontWeight: 400 }}>Required</span>
                    }
                  </span>
                </label>
                <p style={{ fontSize: '0.75rem', color: '#72767B', marginBottom: '0.4rem' }}>
                  Upload a ZIP of your project or add a GitHub URL.
                </p>
                <div
                  onDragEnter={handleSourceArchiveDrag} onDragLeave={handleSourceArchiveDrag} onDragOver={handleSourceArchiveDrag}
                  onDrop={handleSourceArchiveDrop}
                  onClick={() => sourceArchiveRef.current?.click()}
                  style={{
                    padding: '0.75rem', border: `2px dashed ${srcDragActive ? '#0066CC' : (sourceArchive ? '#3E8635' : '#D2D2D2')}`,
                    borderRadius: '8px', background: srcDragActive ? 'rgba(0,102,204,0.02)' : (sourceArchive ? 'rgba(62,134,53,0.02)' : '#FAFAFA'),
                    cursor: 'pointer', textAlign: 'center', marginBottom: '0.5rem',
                  }}
                >
                  <input ref={sourceArchiveRef} type="file" style={{ display: 'none' }}
                    accept=".zip"
                    onChange={(e) => { handleSourceArchive(e.target.files); e.target.value = ''; }} />
                  <UploadIcon style={{ marginRight: '0.4rem', color: sourceArchive ? '#3E8635' : '#0066CC', fontSize: '0.85rem' }} />
                  <span style={{ fontSize: '0.8125rem', color: sourceArchive ? '#3E8635' : '#0066CC', fontWeight: 500 }}>
                    {sourceArchive ? 'Replace ZIP' : 'Drop project ZIP here or click to upload'}
                  </span>
                </div>
                {sourceArchive && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                    background: 'rgba(62,134,53,0.06)', border: '1px solid rgba(62,134,53,0.3)', borderRadius: '8px',
                    padding: '0.35rem 0.6rem', marginBottom: '0.5rem',
                  }}>
                    <FileCodeIcon style={{ color: '#3E8635', fontSize: '0.85rem' }} />
                    <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#151515' }}>{sourceArchive.name}</span>
                    <button onClick={() => setSourceArchive(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: '#6A6E73' }}><TimesIcon style={{ fontSize: '0.65rem' }} /></button>
                  </div>
                )}

                {/* GitHub Input */}
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#FAFAFA', border: '1px solid #D2D2D2', borderRadius: '8px', padding: '0.1rem 0.6rem' }}>
                    <GithubIcon style={{ color: '#151515', fontSize: '0.8rem', flexShrink: 0 }} />
                    <TextInput value={githubInput} onChange={(_e, v) => { setGithubInput(v); setGithubError(null); }}
                      placeholder="https://github.com/user/repo" aria-label="GitHub URL"
                      style={{ border: 'none', background: 'transparent', fontSize: '0.8125rem', padding: '0.35rem 0' }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGithubUrl(); } }} />
                  </div>
                  <Button variant="secondary" size="sm" onClick={addGithubUrl} isDisabled={!githubInput.trim()} icon={<PlusCircleIcon />}>Add</Button>
                </div>
                {githubUrls.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
                    {githubUrls.map((url) => (
                      <span key={url} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#F0F7FF', border: '1px solid #BEE1F4', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
                        <GithubIcon style={{ fontSize: '0.7rem', color: '#0066CC' }} />{extractRepoName(url)}
                        <button onClick={() => removeGithubUrl(url)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', display: 'flex', color: '#6A6E73' }}><TimesIcon style={{ fontSize: '0.65rem' }} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #F0F0F0', display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" onClick={handleCreateRefactorProject}
                  isLoading={creating}
                  isDisabled={!targetStack.trim() || (!sourceArchive && githubUrls.length === 0)}
                  style={{
                    backgroundColor: '#0066CC', border: 'none', fontWeight: 600,
                    padding: '0.5rem 1.75rem', fontSize: '0.875rem', borderRadius: '10px', color: 'white',
                  }}
                  icon={creating ? <Spinner size="sm" /> : <CodeIcon />} iconPosition="end">
                  {creating ? 'Starting...' : 'Start Refactor'}
                </Button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* IMPORT & ITERATE                                               */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {projectMode === 'import' && (
            <div style={{
              background: 'white', borderRadius: '16px', padding: '1.25rem',
              boxShadow: '0 2px 16px rgba(0,0,0,0.06)', border: '1px solid #E7E7E7',
              display: 'flex', flexDirection: 'column', gap: '1rem',
            }}>
              <div style={{
                background: 'linear-gradient(to right, #f3faf3, #e8f5e9)',
                border: '1px solid #c3e6cb',
                borderRadius: '12px',
                padding: '1rem',
                fontSize: '0.8125rem',
                color: '#1e4620',
                lineHeight: 1.5,
              }}>
                <strong>First-class import workflow:</strong> source lands in your job workspace, we run tech-stack detection and indexing, then you iterate using <strong>Refine</strong> on the Files page (multi-file edits, pytest, smoke tests, git).
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#151515', display: 'block', marginBottom: '0.3rem' }}>
                  Project description <span style={{ color: '#72767B', fontWeight: 400 }}>(optional)</span>
                </label>
                <TextArea
                  value={importDescription}
                  onChange={(_e, v) => setImportDescription(v)}
                  placeholder="e.g. Internal Spring Boot order service — we'll use this for LLM context in tech_stack.md"
                  style={{ minHeight: '72px', fontSize: '0.9375rem', fontFamily: '"Red Hat Text", sans-serif', resize: 'vertical' }}
                  aria-label="Import project description"
                />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#151515', display: 'block', marginBottom: '0.3rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Label color={(sourceArchive || githubUrls.length > 0) ? 'green' : 'blue'} isCompact>1</Label> Source code
                    {(sourceArchive || githubUrls.length > 0)
                      ? <span style={{ color: '#3E8635', fontSize: '0.75rem', fontWeight: 400 }}>Ready</span>
                      : <span style={{ color: '#C9190B', fontSize: '0.75rem', fontWeight: 400 }}>Required</span>
                    }
                  </span>
                </label>
                <p style={{ fontSize: '0.75rem', color: '#72767B', marginBottom: '0.4rem' }}>
                  ZIP archive and/or public GitHub URL (same as Refactor).
                </p>
                <div
                  onDragEnter={handleSourceArchiveDrag} onDragLeave={handleSourceArchiveDrag} onDragOver={handleSourceArchiveDrag}
                  onDrop={handleSourceArchiveDrop}
                  onClick={() => sourceArchiveRef.current?.click()}
                  style={{
                    padding: '0.75rem', border: `2px dashed ${srcDragActive ? '#3E8635' : (sourceArchive ? '#3E8635' : '#D2D2D2')}`,
                    borderRadius: '8px', background: srcDragActive ? 'rgba(62,134,53,0.02)' : (sourceArchive ? 'rgba(62,134,53,0.02)' : '#FAFAFA'),
                    cursor: 'pointer', textAlign: 'center', marginBottom: '0.5rem',
                  }}
                >
                  <input ref={sourceArchiveRef} type="file" style={{ display: 'none' }}
                    accept=".zip"
                    onChange={(e) => { handleSourceArchive(e.target.files); e.target.value = ''; }} />
                  <UploadIcon style={{ marginRight: '0.4rem', color: sourceArchive ? '#3E8635' : '#3E8635', fontSize: '0.85rem' }} />
                  <span style={{ fontSize: '0.8125rem', color: '#3E8635', fontWeight: 500 }}>
                    {sourceArchive ? 'Replace ZIP' : 'Drop project ZIP here or click to upload'}
                  </span>
                </div>
                {sourceArchive && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                    background: 'rgba(62,134,53,0.06)', border: '1px solid rgba(62,134,53,0.3)', borderRadius: '8px',
                    padding: '0.35rem 0.6rem', marginBottom: '0.5rem',
                  }}>
                    <FileCodeIcon style={{ color: '#3E8635', fontSize: '0.85rem' }} />
                    <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#151515' }}>{sourceArchive.name}</span>
                    <button type="button" onClick={() => setSourceArchive(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: '#6A6E73' }}><TimesIcon style={{ fontSize: '0.65rem' }} /></button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#FAFAFA', border: '1px solid #D2D2D2', borderRadius: '8px', padding: '0.1rem 0.6rem' }}>
                    <GithubIcon style={{ color: '#151515', fontSize: '0.8rem', flexShrink: 0 }} />
                    <TextInput value={githubInput} onChange={(_e, v) => { setGithubInput(v); setGithubError(null); }}
                      placeholder="https://github.com/user/repo" aria-label="GitHub URL"
                      style={{ border: 'none', background: 'transparent', fontSize: '0.8125rem', padding: '0.35rem 0' }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGithubUrl(); } }} />
                  </div>
                  <Button variant="secondary" size="sm" onClick={addGithubUrl} isDisabled={!githubInput.trim()} icon={<PlusCircleIcon />}>Add</Button>
                </div>
                {githubUrls.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
                    {githubUrls.map((url) => (
                      <span key={url} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#F0FFF4', border: '1px solid #C3E6CB', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
                        <GithubIcon style={{ fontSize: '0.7rem', color: '#3E8635' }} />{extractRepoName(url)}
                        <button type="button" onClick={() => removeGithubUrl(url)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', display: 'flex', color: '#6A6E73' }}><TimesIcon style={{ fontSize: '0.65rem' }} /></button>
                      </span>
                    ))}
                  </div>
                )}
                {githubError && (
                  <div style={{ fontSize: '0.75rem', color: '#C9190B', marginTop: '0.35rem' }}>{githubError}</div>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #F0F0F0' }}>
                <Select
                  toggle={(toggleRef) => (
                    <MenuToggle ref={toggleRef}
                      onClick={() => setBackendSelectOpen(!backendSelectOpen)}
                      isExpanded={backendSelectOpen}
                      style={{ fontSize: '0.8125rem', padding: '0.3rem 0.75rem', minWidth: '150px', border: '1px solid #D2D2D2', borderRadius: '8px' }}
                    >
                      {backends.find((b) => b.name === selectedBackend)?.display_name || 'OPL AI Team'}
                    </MenuToggle>
                  )}
                  onSelect={(_e, s) => { setSelectedBackend(s as string); setBackendSelectOpen(false); }}
                  selected={selectedBackend}
                  isOpen={backendSelectOpen}
                  onOpenChange={setBackendSelectOpen}
                  aria-label="Select agentic system"
                >
                  <SelectList>
                    {backends.map((b) => (
                      <SelectOption key={b.name} value={b.name} isDisabled={!b.available}>
                        {b.display_name}{!b.available && <span style={{ color: '#8A8D90', fontSize: '0.7rem', marginLeft: '0.4rem' }}>(N/A)</span>}
                      </SelectOption>
                    ))}
                  </SelectList>
                </Select>
                <Button variant="primary" onClick={handleCreateImportProject}
                  isLoading={creating}
                  isDisabled={(!sourceArchive && githubUrls.length === 0) || creating}
                  style={{
                    backgroundColor: '#3E8635', border: 'none', fontWeight: 600,
                    padding: '0.5rem 1.75rem', fontSize: '0.875rem', borderRadius: '10px', color: 'white',
                  }}
                  icon={creating ? <Spinner size="sm" /> : <UploadIcon />} iconPosition="end">
                  {creating ? 'Starting...' : 'Import & Analyze'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: dark panel — features (25%) with animations ──────────────── */}
      <div
        className="landing-right-panel"
        style={{
          flex: '0 0 25%', minWidth: '240px', maxWidth: '320px',
          background: 'linear-gradient(160deg, #1A1A1A 0%, #0C0C0C 100%)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '1.5rem 1.25rem',
          borderLeft: '3px solid #EE0000',
          overflow: 'auto',
        }}
      >
        <h2 style={{
          fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF',
          fontFamily: '"Red Hat Display", sans-serif',
          marginBottom: '0.25rem', letterSpacing: '-0.02em',
        }}>
          Ship <span style={{ color: '#EE0000' }}>faster</span> with AI
        </h2>
        <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', marginBottom: '1rem', lineHeight: 1.45 }}>
          A full dev crew — architecture to tests — no boilerplate.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {[
            { icon: <CubesIcon />, gradient: 'linear-gradient(135deg, #4A90E2, #357ABD)', title: 'Multi-Agent Crew', desc: '6 AI agents: PM, Architect, Dev, QA, Frontend, DevOps.' },
            { icon: <CodeIcon />, gradient: 'linear-gradient(135deg, #A855F7, #7C3AED)', title: 'Production Ready', desc: 'TDD, code review, security checks — tested & deployable.' },
            { icon: <RocketIcon />, gradient: 'linear-gradient(135deg, #EE0000, #CC0000)', title: 'Lightning Fast', desc: 'Idea to prototype in minutes with real-time tracking.' },
            { icon: <LightbulbIcon />, gradient: 'linear-gradient(135deg, #F59E0B, #D97706)', title: 'Prompt-to-Refine', desc: 'Describe edits in English — add, delete, restructure.' },
            { icon: <GithubIcon />, gradient: 'linear-gradient(135deg, #6EE7B7, #10B981)', title: 'Context-Aware', desc: 'Attach repos & docs — no hallucinated APIs.' },
            { icon: <ArrowRightIcon />, gradient: 'linear-gradient(135deg, #0066CC, #004080)', title: 'MTA Migration', desc: 'Upload an MTA report — AI migrates every file for you.' },
            { icon: <CodeIcon />, gradient: 'linear-gradient(135deg, #38BDF8, #0EA5E9)', title: 'Pluggable LLMs', desc: 'Red Hat MaaS, OpenRouter, Ollama — swap from the UI.' },
          ].map((c, i) => (
            <div
              key={c.title}
              className="landing-right-row"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                padding: '0.6rem 0.75rem', borderRadius: '10px',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                transition: 'transform 0.2s ease, background 0.2s, border-color 0.2s',
                animationDelay: `${0.1 + i * 0.06}s`,
              } as React.CSSProperties}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                e.currentTarget.style.borderColor = 'rgba(238,0,0,0.3)';
                e.currentTarget.style.transform = 'translateX(4px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.transform = 'translateX(0)';
              }}
            >
              <div
                className="landing-right-icon"
                style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: c.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: '0.9rem', flexShrink: 0,
                  transition: 'transform 0.25s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                {c.icon}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#FFFFFF', fontFamily: '"Red Hat Display", sans-serif', marginBottom: '0.1rem' }}>{c.title}</div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>{c.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <p style={{
          marginTop: '1rem', fontSize: '0.7rem',
          color: 'rgba(255,255,255,0.2)',
          fontFamily: '"Red Hat Text", sans-serif',
        }}>
          Built with LlamaIndex &middot; Powered by Red Hat &middot; Open Source
        </p>
      </div>
    </div>
  );
};

export default Landing;
