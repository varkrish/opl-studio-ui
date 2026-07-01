import React, { useState, useCallback } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  Grid,
  GridItem,
  Title,
  Progress,
  ProgressVariant,
  Label,
  Flex,
  FlexItem,
  Button,
  Spinner,
  Tooltip,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
} from '@patternfly/react-core';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  WrenchIcon,
  CubesIcon,
} from '@patternfly/react-icons';
import { useNavigate, useParams } from 'react-router-dom';
import { usePolling } from '../hooks/usePolling';
import {
  getJob,
  getJobProgress,
  getJobToolStats,
  getJobBudget,
  restartJob,
  cancelJob,
} from '../api/client';
import type { Job, ProgressMessage } from '../types';
import type { JobToolStats } from '../api/client';

// ── Helpers ──────────────────────────────────────────────────────────────────

const jobStatusColor = (status: string): 'green' | 'red' | 'blue' | 'orange' | 'gold' | 'grey' => {
  switch (status) {
    case 'completed': return 'green';
    case 'running': return 'blue';
    case 'failed': return 'red';
    case 'cancelled': return 'grey';
    case 'quota_exhausted': return 'red';
    case 'refinement_failed': return 'orange';
    case 'validation_failed': return 'orange';
    case 'pending_review': return 'gold';
    case 'pending_approval': return 'gold';
    case 'pending_solution_review': return 'gold';
    default: return 'grey';
  }
};

const RUNNING_STATUSES = new Set(['running', 'queued']);
const RESTARTABLE_STATUSES = new Set(['failed', 'cancelled', 'quota_exhausted', 'completed', 'partially_completed']);

function fmtMs(ms: number): string {
  if (ms <= 0) return '—';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ── Budget types ─────────────────────────────────────────────────────────────

interface AgentBudget {
  agent_name?: string;
  input_tokens?: number;
  output_tokens?: number;
}

interface BudgetData {
  total_cost?: number;
  total_tokens?: number;
  agents?: AgentBudget[];
}

// ── Component ─────────────────────────────────────────────────────────────────

const JobDetail: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<Job | null>(null);
  const [progress, setProgress] = useState<{
    status: string;
    progress: number;
    current_phase: string;
    last_message: ProgressMessage[];
  } | null>(null);
  const [toolStats, setToolStats] = useState<JobToolStats | null>(null);
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const isRunning = progress ? RUNNING_STATUSES.has(progress.status) : false;

  const loadData = useCallback(async () => {
    if (!jobId) return;
    try {
      const [j, p] = await Promise.all([getJob(jobId), getJobProgress(jobId)]);
      setJob(j as unknown as Job);
      setProgress(p as typeof progress);

      // Tool stats — fire and forget, don't block the page
      getJobToolStats(jobId)
        .then(setToolStats)
        .catch(() => {});

      // Budget — gracefully degrade
      getJobBudget(jobId)
        .then((b) => setBudget(b as BudgetData))
        .catch(() => {});
    } catch (err) {
      console.error('Failed to load job detail:', err);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  usePolling(loadData, isRunning ? 3000 : 0);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleRestart = async () => {
    if (!jobId) return;
    setActionError(null);
    try {
      await restartJob(jobId);
      await loadData();
    } catch {
      setActionError('Restart failed. Please try again.');
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;
    setActionError(null);
    try {
      await cancelJob(jobId);
      await loadData();
    } catch {
      setActionError('Cancel failed. Please try again.');
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner aria-label="Loading job detail" />
      </div>
    );
  }

  if (!job) {
    return (
      <EmptyState>
        <EmptyStateIcon icon={ExclamationTriangleIcon} color="#C9190B" />
        <Title headingLevel="h2" size="lg">Job not found</Title>
        <EmptyStateBody>The job may have been deleted or you don&apos;t have access.</EmptyStateBody>
        <Button variant="link" onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
      </EmptyState>
    );
  }

  const currentStatus = progress?.status ?? (job as unknown as Record<string, string>).status ?? 'unknown';
  const currentPhase = progress?.current_phase ?? (job as unknown as Record<string, string>).current_phase ?? 'N/A';
  const currentProgress = progress?.progress ?? (job as unknown as Record<string, number>).progress ?? 0;
  const messages = (progress?.last_message ?? []).slice(-15).reverse();

  const cost = budget?.total_cost ?? (job as unknown as Record<string, number>).cost ?? 0;
  const tokens = budget?.total_tokens ?? (job as unknown as Record<string, number>).tokens ?? 0;
  const agentBudgets: AgentBudget[] = budget?.agents ?? [];

  const maxToolCount = toolStats?.by_tool?.[0]?.count ?? 1;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }} style={{ marginBottom: '1.5rem' }}>
        <FlexItem>
          <Button variant="plain" onClick={() => navigate('/dashboard')} aria-label="Back to dashboard">
            <ArrowLeftIcon />
          </Button>
        </FlexItem>
        <FlexItem flex={{ default: 'flex_1' }}>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }} flexWrap={{ default: 'wrap' }}>
            <FlexItem>
              <Tooltip
                content={<div style={{ maxWidth: 480, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{(job as unknown as Record<string, string>).vision}</div>}
                maxWidth="500px"
              >
                <Title
                  headingLevel="h1"
                  size="xl"
                  style={{
                    fontFamily: '"Red Hat Display", sans-serif',
                    maxWidth: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    cursor: 'default',
                  }}
                >
                  {(job as unknown as Record<string, string>).vision}
                </Title>
              </Tooltip>
            </FlexItem>
            <FlexItem>
              <Label color={jobStatusColor(currentStatus)} style={{ textTransform: 'capitalize' }}>
                {currentStatus.replace(/_/g, ' ')}
              </Label>
            </FlexItem>
            {isRunning && <FlexItem><Spinner size="md" aria-label="Running" /></FlexItem>}
          </Flex>
          <Flex gap={{ default: 'gapMd' }} style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: '#6A6E73' }}>
            <FlexItem>
              <ClockIcon style={{ marginRight: 4, verticalAlign: 'middle' }} />
              {new Date((job as unknown as Record<string, string>).created_at).toLocaleString()}
            </FlexItem>
            <FlexItem>Cost: <strong>${cost.toFixed(4)}</strong></FlexItem>
            <FlexItem>Tokens: <strong>{tokens.toLocaleString()}</strong></FlexItem>
            <FlexItem>ID: <code style={{ fontSize: '0.75rem' }}>{jobId}</code></FlexItem>
          </Flex>
        </FlexItem>
      </Flex>

      {/* ── Phase progress bar ────────────────────────────────────────────── */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <CardBody style={{ padding: '0.75rem 1.25rem' }}>
          <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} style={{ marginBottom: '0.35rem' }}>
            <FlexItem>
              <strong style={{ textTransform: 'capitalize' }}>{currentPhase.replace(/_/g, ' ')}</strong>
            </FlexItem>
            <FlexItem><span style={{ color: '#6A6E73' }}>{currentProgress}%</span></FlexItem>
          </Flex>
          <Progress
            value={currentProgress}
            variant={
              currentStatus === 'failed' ? ProgressVariant.danger
                : currentStatus === 'completed' ? ProgressVariant.success
                  : undefined
            }
            aria-label="Job progress"
          />
        </CardBody>
      </Card>

      {/* ── Main columns ──────────────────────────────────────────────────── */}
      <Grid hasGutter>
        {/* Activity Feed */}
        <GridItem lg={8} md={12}>
          <Card isFullHeight>
            <CardHeader>
              <CardTitle>Activity Feed</CardTitle>
              <p style={{ fontSize: '0.75rem', color: '#6A6E73', marginTop: '0.15rem' }}>
                Last 15 messages · newest first{isRunning && ' · auto-refreshing every 3s'}
              </p>
            </CardHeader>
            <CardBody>
              {messages.length > 0 ? (
                <div>
                  {messages.map((msg, i) => (
                    <Flex
                      key={i}
                      gap={{ default: 'gapMd' }}
                      alignItems={{ default: 'alignItemsFlexStart' }}
                      style={{ marginBottom: '0.875rem' }}
                    >
                      <FlexItem>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: '#3E8635',
                            marginTop: 6,
                            flexShrink: 0,
                          }}
                        />
                      </FlexItem>
                      <FlexItem flex={{ default: 'flex_1' }}>
                        <div>
                          <Label isCompact color="blue" style={{ marginRight: 6, textTransform: 'capitalize' }}>
                            {msg.phase?.replace(/_/g, ' ') ?? 'unknown'}
                          </Label>
                          <span style={{ fontSize: '0.875rem' }}>{msg.message}</span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#6A6E73', marginTop: 2 }}>
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </div>
                      </FlexItem>
                    </Flex>
                  ))}
                </div>
              ) : (
                <EmptyState>
                  <EmptyStateIcon icon={CubesIcon} />
                  <Title headingLevel="h3" size="md">No activity yet</Title>
                  <EmptyStateBody>Messages will appear here once the job starts processing.</EmptyStateBody>
                </EmptyState>
              )}
            </CardBody>
          </Card>
        </GridItem>

        {/* Right sidebar */}
        <GridItem lg={4} md={12}>
          {/* Tool Call Stats */}
          <Card style={{ marginBottom: '1.5rem' }}>
            <CardHeader>
              <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                <FlexItem><CardTitle>Tool Calls</CardTitle></FlexItem>
                <FlexItem><WrenchIcon color="#6A6E73" /></FlexItem>
              </Flex>
            </CardHeader>
            <CardBody>
              {toolStats && toolStats.total > 0 ? (
                <>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <Title headingLevel="h3" size="xl" style={{ color: '#6753AC' }}>
                      {toolStats.total.toLocaleString()}
                    </Title>
                    <p style={{ fontSize: '0.75rem', color: '#6A6E73' }}>total calls</p>
                  </div>
                  {toolStats.by_tool.map((t, i) => {
                    const pct = maxToolCount > 0 ? Math.round((t.count / maxToolCount) * 100) : 0;
                    return (
                      <div key={t.name} style={{ marginBottom: i < toolStats.by_tool.length - 1 ? '0.65rem' : 0 }}>
                        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} style={{ marginBottom: '0.15rem' }}>
                          <FlexItem>
                            <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{t.name}</span>
                          </FlexItem>
                          <FlexItem>
                            <span style={{ fontSize: '0.72rem', color: '#6A6E73' }}>
                              {t.count} · {fmtMs(t.avg_ms)}
                            </span>
                          </FlexItem>
                        </Flex>
                        <Progress
                          value={pct}
                          size="sm"
                          style={{ '--pf-v5-c-progress__bar--BackgroundColor': '#6753AC' } as React.CSSProperties}
                          aria-label={`${t.name} call count`}
                        />
                      </div>
                    );
                  })}
                </>
              ) : (
                <p style={{ color: '#6A6E73', fontSize: '0.875rem' }}>No tool calls recorded yet.</p>
              )}
            </CardBody>
          </Card>

          {/* LLM Usage */}
          <Card>
            <CardHeader>
              <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                <FlexItem><CardTitle>LLM Usage</CardTitle></FlexItem>
                <FlexItem><CheckCircleIcon color="#6A6E73" /></FlexItem>
              </Flex>
            </CardHeader>
            <CardBody>
              <DescriptionList isCompact style={{ marginBottom: agentBudgets.length > 0 ? '1rem' : 0 }}>
                <DescriptionListGroup>
                  <DescriptionListTerm>Total cost</DescriptionListTerm>
                  <DescriptionListDescription>
                    <strong>${cost.toFixed(4)}</strong>
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Total tokens</DescriptionListTerm>
                  <DescriptionListDescription>
                    <strong>{tokens.toLocaleString()}</strong>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>

              {agentBudgets.length > 0 && (
                <>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6A6E73', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    By agent
                  </p>
                  {agentBudgets.map((ab) => (
                    <div
                      key={ab.agent_name}
                      style={{
                        padding: '0.4rem 0',
                        borderBottom: '1px solid #F0F0F0',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div style={{ fontWeight: 500, marginBottom: '0.15rem' }}>
                        {ab.agent_name ?? 'unknown'}
                      </div>
                      <Flex gap={{ default: 'gapSm' }}>
                        <FlexItem>
                          <span style={{ color: '#6A6E73' }}>in </span>
                          {(ab.input_tokens ?? 0).toLocaleString()}
                        </FlexItem>
                        <FlexItem>
                          <span style={{ color: '#6A6E73' }}>out </span>
                          {(ab.output_tokens ?? 0).toLocaleString()}
                        </FlexItem>
                      </Flex>
                    </div>
                  ))}
                </>
              )}
            </CardBody>
          </Card>
        </GridItem>
      </Grid>

      {/* ── Quick Actions ─────────────────────────────────────────────────── */}
      <Card style={{ marginTop: '1.5rem' }}>
        <CardBody>
          <Flex gap={{ default: 'gapSm' }} flexWrap={{ default: 'wrap' }} alignItems={{ default: 'alignItemsCenter' }}>
            <FlexItem>
              <strong style={{ fontSize: '0.875rem', color: '#6A6E73', marginRight: 4 }}>Quick actions:</strong>
            </FlexItem>
            <FlexItem>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/files?job=${jobId}`)}
              >
                View Files
              </Button>
            </FlexItem>
            <FlexItem>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/tasks')}
              >
                Tasks
              </Button>
            </FlexItem>
            <FlexItem>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/review/${jobId}`)}
              >
                Plan / Review
              </Button>
            </FlexItem>
            {RESTARTABLE_STATUSES.has(currentStatus) && (
              <FlexItem>
                <Button variant="secondary" size="sm" onClick={handleRestart}>
                  Restart
                </Button>
              </FlexItem>
            )}
            {RUNNING_STATUSES.has(currentStatus) && (
              <FlexItem>
                <Button variant="danger" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
              </FlexItem>
            )}
            {actionError && (
              <FlexItem>
                <span style={{ color: '#C9190B', fontSize: '0.8rem' }}>{actionError}</span>
              </FlexItem>
            )}
          </Flex>
        </CardBody>
      </Card>
    </>
  );
};

export default JobDetail;
