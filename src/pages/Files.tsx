import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Alert,
  Button,
  Card,
  CardTitle,
  CardBody,
  CardHeader,
  Title,
  TreeView,
  TreeViewDataItem,
  EmptyState,
  EmptyStateIcon,
  EmptyStateBody,
  Spinner,
  Split,
  SplitItem,
  Flex,
  FlexItem,
  ExpandableSection,
  Label,
  Modal,
  ModalVariant,
} from '@patternfly/react-core';
import {
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
  FileCodeIcon,
  CubeIcon,
  DownloadIcon,
  SyncAltIcon,
} from '@patternfly/react-icons';
import { useSearchParams, Link } from 'react-router-dom';
import Editor, { DiffEditor, type Monaco } from '@monaco-editor/react';
import { usePolling } from '../hooks/usePolling';
import {
  getJobs,
  getWorkspaceFiles,
  getFileContent,
  getPreviewUrl,
  downloadJobWorkspace,
  getRefinementChanges,
  getRefinementCompare,
  type MigrationChanges,
} from '../api/client';
import { buildFileTree } from '../utils/fileTree';
import type { JobSummary, FileTreeNode } from '../types';
import RefineChat from '../components/RefineChat';
import JobSearchSelect from '../components/JobSearchSelect';

/** Red Hat brand colors for Monaco theme */
const REDHAT = {
  red: '#CC0000',
  redDark: '#A30000',
  text: '#151515',
  textMuted: '#6A6E73',
  border: '#D2D2D2',
  bg: '#FFFFFF',
  bgSubtle: '#F5F5F5',
  accent: '#0066CC',
};

/** Map file extension to Monaco language id */
function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', json: 'json', md: 'markdown', html: 'html', htm: 'html',
    css: 'css', scss: 'scss', yaml: 'yaml', yml: 'yaml', xml: 'xml',
    sh: 'shell', bash: 'shell', env: 'plaintext',
  };
  return map[ext] || 'plaintext';
}

function defineRedHatTheme(monaco: Monaco): void {
  monaco.editor.defineTheme('redhat-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: REDHAT.redDark, fontStyle: 'bold' },
      { token: 'string', foreground: '#006600' },
      { token: 'comment', foreground: REDHAT.textMuted, fontStyle: 'italic' },
      { token: 'number', foreground: REDHAT.accent },
    ],
    colors: {
      'editor.background': REDHAT.bg,
      'editor.foreground': REDHAT.text,
      'editorLineNumber.foreground': REDHAT.textMuted,
      'editorLineNumber.activeForeground': REDHAT.red,
      'editor.selectionBackground': '#E8F4FF',
      'editorCursor.foreground': REDHAT.red,
    },
  });
}

/** Convert our FileTreeNode[] to PatternFly TreeViewDataItem[] */
function toTreeViewData(nodes: FileTreeNode[]): TreeViewDataItem[] {
  return nodes.map((node) => ({
    id: node.path,
    name: node.name,
    icon: node.type === 'folder' ? <FolderIcon /> : getFileIcon(node.name),
    expandedIcon: node.type === 'folder' ? <FolderOpenIcon /> : undefined,
    children: node.children ? toTreeViewData(node.children) : undefined,
    defaultExpanded: false,
  }));
}

function getFileIcon(name: string): React.ReactNode {
  if (name.endsWith('.py') || name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.js') || name.endsWith('.jsx')) {
    return <FileCodeIcon />;
  }
  return <FileIcon />;
}

/* Refine polling constants moved into RefineChat component */

const Files: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<TreeViewDataItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [loading, setLoading] = useState(true);
  // isSelectOpen removed - handled by JobSearchSelect
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const lastAppliedFileParam = useRef<string | null>(null);
  const [refinementChanges, setRefinementChanges] = useState<MigrationChanges | null>(null);
  const [refChangesExpanded, setRefChangesExpanded] = useState(true);
  const [diffModal, setDiffModal] = useState<{
    isOpen: boolean;
    path: string;
    original: string;
    modified: string;
    loading: boolean;
    error: string | null;
  }>({ isOpen: false, path: '', original: '', modified: '', loading: false, error: null });
  /* Refine state now lives in RefineChat component */

  /** When URL has ?job= & ?file=, open that file in the editor after tree is loaded. */
  useEffect(() => {
    const urlJob = searchParams.get('job');
    const urlFile = searchParams.get('file');
    if (!urlJob || !urlFile) return;
    const paramKey = `${urlJob}:${urlFile}`;
    if (lastAppliedFileParam.current === paramKey || selectedJobId !== urlJob || treeData.length === 0) {
      return;
    }
    let cancelled = false;
    lastAppliedFileParam.current = paramKey;
    const filePath = decodeURIComponent(urlFile);
    setLoadingFile(true);
    getFileContent(filePath, urlJob)
      .then((result) => {
        if (!cancelled) setSelectedFile(result);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Error loading file from URL:', err);
          setSelectedFile({ path: filePath, content: 'Error loading file content.' });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams, selectedJobId, treeData]);

  /** Load jobs list and file tree. Pass jobId to immediately load files for that project (e.g. after dropdown change). */
  const loadData = useCallback(async (overrideJobId?: string) => {
    try {
      const res = await getJobs(1, 100);
      setJobs(res.jobs);

      let jobId: string | null = overrideJobId ?? selectedJobId;

      if (overrideJobId === undefined) {
        // No override: apply URL and auto-selection rules
        const urlJobId = searchParams.get('job');
        if (urlJobId && urlJobId !== selectedJobId) {
          jobId = urlJobId;
          setSelectedJobId(jobId);
        } else if (!jobId || !res.jobs.find((job) => job.id === jobId)) {
          const running = res.jobs.find((job) => job.status === 'running');
          jobId = running?.id ?? res.jobs[0]?.id ?? null;
          setSelectedJobId(jobId);
        }
      }

      if (jobId) {
        const files = await getWorkspaceFiles(jobId);
        const tree = buildFileTree(files);
        setTreeData(toTreeViewData(tree));
      } else {
        setTreeData([]);
      }
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }, [selectedJobId, searchParams]);

  const loadRefinementChanges = useCallback(async () => {
    if (!selectedJobId) {
      setRefinementChanges(null);
      return;
    }
    try {
      const data = await getRefinementChanges(selectedJobId);
      setRefinementChanges(data);
    } catch {
      setRefinementChanges(null);
    }
  }, [selectedJobId]);

  useEffect(() => {
    void loadRefinementChanges();
  }, [loadRefinementChanges]);

  const activeJob = jobs.find((j) => j.id === selectedJobId);
  const isRefining = activeJob?.status === 'running' && activeJob?.current_phase === 'refining';

  useEffect(() => {
    if (!selectedJobId || !isRefining) return;
    const t = window.setInterval(() => void loadRefinementChanges(), 3000);
    return () => window.clearInterval(t);
  }, [selectedJobId, isRefining, loadRefinementChanges]);

  usePolling(loadData, 5000);

  /** Called by RefineChat after a successful refinement to reload tree + file */
  const handleRefineComplete = useCallback(async () => {
    await loadData();
    await loadRefinementChanges();
    if (selectedFile && selectedJobId) {
      try {
        const result = await getFileContent(selectedFile.path, selectedJobId);
        setSelectedFile(result);
      } catch { /* ignore */ }
    }
  }, [loadData, loadRefinementChanges, selectedFile, selectedJobId]);

  const handleFileSelect = async (_event: React.MouseEvent, item: TreeViewDataItem) => {
    // Only handle file clicks (items without children)
    if (item.children) return;

    const filePath = item.id as string;
    setLoadingFile(true);
    try {
      const result = await getFileContent(filePath, selectedJobId || undefined);
      setSelectedFile(result);
    } catch (err) {
      console.error('Error loading file:', err);
      setSelectedFile({ path: filePath, content: 'Error loading file content.' });
    } finally {
      setLoadingFile(false);
    }
  };

  const handleJobSelect = (newJobId: string) => {
    setSelectedJobId(newJobId);
    setSelectedFile(null);
    loadData(newJobId);
  };

  const openRefinementDiff = useCallback(
    async (path: string) => {
      if (!selectedJobId) return;
      setDiffModal({
        isOpen: true,
        path,
        original: '',
        modified: '',
        loading: true,
        error: null,
      });
      try {
        const res = await getRefinementCompare(selectedJobId, path);
        if (res.error) {
          setDiffModal({
            isOpen: true,
            path,
            original: '',
            modified: '',
            loading: false,
            error: res.error,
          });
          return;
        }
        setDiffModal({
          isOpen: true,
          path,
          original: res.original,
          modified: res.modified,
          loading: false,
          error: null,
        });
      } catch {
        setDiffModal({
          isOpen: true,
          path,
          original: '',
          modified: '',
          loading: false,
          error: 'Failed to load diff from the server.',
        });
      }
    },
    [selectedJobId]
  );

  const closeDiffModal = () => {
    setDiffModal({
      isOpen: false,
      path: '',
      original: '',
      modified: '',
      loading: false,
      error: null,
    });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner aria-label="Loading files" />
      </div>
    );
  }

  return (
    <>
      {downloadError && (
        <Alert
          variant="danger"
          title={downloadError}
          isInline
          style={{ marginBottom: '1rem' }}
          actionClose={<Button variant="plain" onClick={() => setDownloadError(null)} aria-label="Close">×</Button>}
        />
      )}
      {selectedJobId && (jobs.find((j) => j.id === selectedJobId)?.vision?.startsWith('[Import]')) && (
        <Alert
          variant="success"
          title="Import & Iterate project"
          isInline
          style={{ marginBottom: '1rem' }}
        >
          This job used first-class import analysis (tech stack + indexing). Use <strong>Refine</strong> for natural-language
          edits — enhanced mode enables multi-file work, pytest, smoke tests, and git on the server.
        </Alert>
      )}
      <Split hasGutter style={{ marginBottom: '1.5rem' }}>
        <SplitItem isFilled>
          <Title headingLevel="h1" size="2xl" style={{ fontFamily: '"Red Hat Display", sans-serif' }}>
            Files
          </Title>
          <p style={{ color: '#6A6E73', marginTop: '0.25rem' }}>Browse workspace files generated by jobs.</p>
        </SplitItem>
        <SplitItem>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
            <FlexItem>
              <JobSearchSelect
                selectedJobId={selectedJobId}
                onSelect={handleJobSelect}
                data-testid="files-project-select-toggle"
              />
            </FlexItem>
            {selectedJobId && (
              <Button
                variant="secondary"
                icon={<DownloadIcon />}
                iconPosition="end"
                data-testid="files-download-project"
                isDisabled={downloading}
                onClick={async () => {
                  setDownloadError(null);
                  setDownloading(true);
                  try {
                    await downloadJobWorkspace(selectedJobId);
                  } catch (e: unknown) {
                    const msg = e && typeof e === 'object' && 'response' in e
                      ? (e as { response?: { status?: number; data?: unknown } }).response?.status === 404
                        ? 'Project or workspace not found.'
                        : 'Download failed. Try again.'
                      : 'Download failed. Try again.';
                    setDownloadError(msg);
                  } finally {
                    setDownloading(false);
                  }
                }}
              >
                {downloading ? 'Downloading...' : 'Download project'}
              </Button>
            )}
          </Flex>
        </SplitItem>
      </Split>

      {selectedJobId && (
        <>
          <style>{`@keyframes refineSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          <div
            style={{
              marginBottom: '1rem',
              border: '1px solid #D2D2D2',
              borderRadius: 6,
              background: '#FAFAFA',
            }}
          >
            <ExpandableSection
              isExpanded={refChangesExpanded}
              onToggle={() => setRefChangesExpanded(!refChangesExpanded)}
              toggleContent={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                  <FolderOpenIcon style={{ color: '#0066CC', fontSize: '0.875rem' }} />
                  <span style={{ fontWeight: 600 }}>Refinement change log</span>
                  {refinementChanges && refinementChanges.total_files > 0 ? (
                    <>
                      <Label isCompact color="blue">{refinementChanges.total_files} files</Label>
                      <span style={{ color: '#3E8635', fontWeight: 600, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        +{refinementChanges.total_insertions}
                      </span>
                      <span style={{ color: '#C9190B', fontWeight: 600, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        -{refinementChanges.total_deletions}
                      </span>
                    </>
                  ) : (
                    <Label isCompact color="grey">No refine diffs yet</Label>
                  )}
                  {isRefining && (
                    <SyncAltIcon
                      style={{
                        color: '#0066CC',
                        fontSize: '0.75rem',
                        animation: 'refineSpin 2s linear infinite',
                      }}
                    />
                  )}
                </span>
              }
            >
              <div style={{ borderTop: '1px solid #E8E8E8' }}>
                {!refinementChanges || refinementChanges.total_files === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6A6E73', fontSize: '0.8125rem' }}>
                    {isRefining
                      ? 'Waiting for refinement edits…'
                      : 'After at least one successful Refine, git snapshots show cumulative changes vs the workspace before the first refinement (same idea as MTA File Change Log).'}
                  </div>
                ) : (
                  <>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #E8E8E8', textAlign: 'left' }}>
                          <th style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#6A6E73' }}>File</th>
                          <th style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#6A6E73', width: 80, textAlign: 'center' }}>Change</th>
                          <th style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#6A6E73', width: 80, textAlign: 'right' }}>Added</th>
                          <th style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#6A6E73', width: 80, textAlign: 'right' }}>Removed</th>
                          <th style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#6A6E73', width: 120 }}>View</th>
                        </tr>
                      </thead>
                      <tbody>
                        {refinementChanges.files.map((f) => {
                          const total = f.insertions + f.deletions;
                          const insPct = total > 0 ? (f.insertions / total) * 100 : 0;
                          const changeLabel =
                            f.change_type === 'A'
                              ? 'Added'
                              : f.change_type === 'D'
                                ? 'Deleted'
                                : f.change_type === 'R'
                                  ? 'Renamed'
                                  : 'Modified';
                          const changeColor =
                            f.change_type === 'A'
                              ? '#3E8635'
                              : f.change_type === 'D'
                                ? '#C9190B'
                                : '#0066CC';
                          return (
                            <tr key={f.path} style={{ borderBottom: '1px solid #F0F0F0' }}>
                              <td
                                style={{
                                  padding: '0.4rem 1rem',
                                  fontFamily: 'monospace',
                                  fontSize: '0.75rem',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  maxWidth: 0,
                                }}
                              >
                                <Link
                                  to={`/files?job=${selectedJobId}&file=${encodeURIComponent(f.path)}`}
                                  style={{ color: '#0066CC', textDecoration: 'none', fontFamily: 'monospace' }}
                                >
                                  {f.path}
                                </Link>
                              </td>
                              <td style={{ padding: '0.4rem 1rem', textAlign: 'center' }}>
                                <Label
                                  isCompact
                                  style={{
                                    color: changeColor,
                                    borderColor: changeColor,
                                    background: 'transparent',
                                    border: `1px solid ${changeColor}`,
                                  }}
                                >
                                  {changeLabel}
                                </Label>
                              </td>
                              <td
                                style={{
                                  padding: '0.4rem 1rem',
                                  textAlign: 'right',
                                  color: '#3E8635',
                                  fontWeight: 500,
                                  fontFamily: 'monospace',
                                }}
                              >
                                {f.insertions > 0 ? `+${f.insertions}` : '—'}
                              </td>
                              <td
                                style={{
                                  padding: '0.4rem 1rem',
                                  textAlign: 'right',
                                  color: '#C9190B',
                                  fontWeight: 500,
                                  fontFamily: 'monospace',
                                }}
                              >
                                {f.deletions > 0 ? `-${f.deletions}` : '—'}
                              </td>
                              <td style={{ padding: '0.4rem 1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {total > 0 && (
                                    <div
                                      style={{
                                        display: 'flex',
                                        height: '8px',
                                        borderRadius: '4px',
                                        overflow: 'hidden',
                                        background: '#F0F0F0',
                                        flex: 1,
                                        minWidth: 48,
                                      }}
                                    >
                                      <div style={{ width: `${insPct}%`, background: '#3E8635', transition: 'width 0.3s' }} />
                                      <div style={{ width: `${100 - insPct}%`, background: '#C9190B', transition: 'width 0.3s' }} />
                                    </div>
                                  )}
                                  <Button
                                    variant="link"
                                    isInline
                                    style={{ padding: 0, fontSize: '0.75rem', flexShrink: 0 }}
                                    onClick={() => void openRefinementDiff(f.path)}
                                  >
                                    Diff
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div
                      style={{
                        padding: '0.375rem 1rem',
                        borderTop: '1px solid #F0F0F0',
                        fontSize: '0.75rem',
                        color: '#6A6E73',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>
                        {refinementChanges.baseline_commit} → {refinementChanges.head_commit}
                      </span>
                      <span>
                        {refinementChanges.total_files} file{refinementChanges.total_files !== 1 ? 's' : ''} changed
                      </span>
                    </div>
                  </>
                )}
              </div>
            </ExpandableSection>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: '1.5rem', height: 'calc(100vh - 14rem)' }}>
        {/* File Tree Panel */}
        <Card style={{ width: 320, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <CardHeader style={{ borderBottom: '1px solid #D2D2D2' }}>
            <CardTitle style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FolderIcon /> Project Explorer
            </CardTitle>
          </CardHeader>
          <CardBody style={{ overflow: 'auto', flex: 1, padding: '0.5rem' }}>
            {treeData.length > 0 ? (
              <TreeView data={treeData} onSelect={handleFileSelect} />
            ) : (
              <p style={{ color: '#6A6E73', textAlign: 'center', padding: '2rem', fontSize: '0.875rem' }}>
                No files in workspace
              </p>
            )}
          </CardBody>
        </Card>

        {/* File Content Panel */}
        <Card style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {loadingFile ? (
            <CardBody style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spinner aria-label="Loading file" />
            </CardBody>
          ) : selectedFile ? (
            <>
              <CardHeader style={{ borderBottom: `1px solid ${REDHAT.border}` }}>
                <CardTitle style={{ fontSize: '0.875rem', fontFamily: '"Red Hat Mono", "JetBrains Mono", monospace', color: REDHAT.text }}>
                  {selectedFile.path}
                </CardTitle>
              </CardHeader>
              <CardBody style={{ overflow: 'hidden', flex: 1, padding: 0, backgroundColor: REDHAT.bg, display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    flex: 1,
                    minHeight: 240,
                    borderTop: `1px solid ${REDHAT.border}`,
                    boxSizing: 'border-box',
                  }}
                >
                  <Editor
                    height={selectedFile.path.toLowerCase().endsWith('.html') || selectedFile.path.toLowerCase().endsWith('.htm') ? '50%' : '100%'}
                    language={getLanguage(selectedFile.path)}
                    value={selectedFile.content}
                    theme="redhat-light"
                    loading={null}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      fontSize: 13,
                      fontFamily: '"Red Hat Mono", "JetBrains Mono", "Menlo", monospace',
                      lineNumbers: 'on',
                      renderLineHighlight: 'line',
                      padding: { top: 12, bottom: 12 },
                      overviewRulerBorder: false,
                      hideCursorInOverviewRuler: true,
                      matchBrackets: 'always',
                      cursorBlinking: 'smooth',
                    }}
                    beforeMount={defineRedHatTheme}
                  />
                </div>
                {(selectedFile.path.toLowerCase().endsWith('.html') || selectedFile.path.toLowerCase().endsWith('.htm')) && selectedJobId && (
                  <div style={{ borderTop: `1px solid ${REDHAT.border}`, flex: '1 1 280px', minHeight: 280 }}>
                    <div style={{ padding: '8px 12px', fontSize: '0.875rem', color: REDHAT.textMuted }}>Preview</div>
                    <iframe
                      title="HTML preview"
                      src={getPreviewUrl(selectedJobId, selectedFile.path)}
                      sandbox="allow-scripts"
                      style={{ width: '100%', height: 'calc(100% - 32px)', border: 'none', display: 'block' }}
                    />
                  </div>
                )}
              </CardBody>
            </>
          ) : (
            <CardBody style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EmptyState>
                <EmptyStateIcon icon={CubeIcon} />
                <Title headingLevel="h4" size="lg">
                  Select a file to view
                </Title>
                <EmptyStateBody>
                  Choose a file from the project explorer to view its contents.
                </EmptyStateBody>
              </EmptyState>
            </CardBody>
          )}
        </Card>
      </div>

      <Modal
        variant={ModalVariant.large}
        title={`Refinement diff — ${diffModal.path || 'file'}`}
        isOpen={diffModal.isOpen}
        onClose={closeDiffModal}
        actions={[
          <Button key="close" variant="primary" onClick={closeDiffModal}>
            Close
          </Button>,
        ]}
      >
        {diffModal.loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Spinner aria-label="Loading diff" />
          </div>
        )}
        {!diffModal.loading && diffModal.error && (
          <Alert variant="danger" title={diffModal.error} isInline />
        )}
        {!diffModal.loading && !diffModal.error && diffModal.path && (
          <div style={{ border: `1px solid ${REDHAT.border}`, borderRadius: 4, overflow: 'hidden' }}>
            <DiffEditor
              height={560}
              language={getLanguage(diffModal.path)}
              original={diffModal.original}
              modified={diffModal.modified}
              theme="redhat-light"
              beforeMount={defineRedHatTheme}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                renderSideBySide: true,
                fontSize: 13,
                fontFamily: '"Red Hat Mono", "JetBrains Mono", "Menlo", monospace',
              }}
            />
          </div>
        )}
      </Modal>

      {/* Floating refine button + slide-out chat panel */}
      <RefineChat
        selectedJobId={selectedJobId}
        selectedFile={selectedFile}
        jobVision={jobs.find((j) => j.id === selectedJobId)?.vision || null}
        jiraIssueKey={jobs.find((j) => j.id === selectedJobId)?.metadata?.jira_issue_key ?? null}
        welcomeImport={searchParams.get('welcomeImport') === '1'}
        onRefineComplete={handleRefineComplete}
      />
    </>
  );
};

export default Files;
