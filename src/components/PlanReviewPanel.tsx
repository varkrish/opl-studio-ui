/**
 * PlanReviewPanel — universal plan review / feedback / approval panel.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Button,
  Spinner,
  TextArea,
  Tab,
  Tabs,
  TabTitleText,
  Progress,
} from '@patternfly/react-core';
import {
  CheckCircleIcon,
  SyncAltIcon,
  OutlinedCommentsIcon,
  BanIcon,
} from '@patternfly/react-icons';
import { approveJob, getJob, getJobPlan, getJobSolution, refinePlan, refineSolution, getGranularTasks } from '../api/client';
import { getWorkflowPrefs } from '../hooks/useWorkflowPrefs';
import MarkdownPreview from './MarkdownPreview';
import GranularTaskBoard from './GranularTaskBoard';
import type { PlanReviewData, JiraStory, GranularTask } from '../types';

const AUTO_APPROVE_DELAY_SEC = 5;

/** Job statuses where the plan/solution gate is still open for feedback + approval. */
const REVIEWABLE_STATUSES = new Set([
  'pending_review',
  'pending_approval',
  'pending_solution_review',
]);

interface Props {
  jobId: string;
  /** Called after the user approves so the parent can re-poll the job. */
  onApproved?: () => void;
  /** embedded = compact card; page = full-height document reader */
  layout?: 'embedded' | 'page';
}

const ARTIFACT_ORDER = [
  'solution_spec.md',
  'user_stories.md',
  'design_spec.md',
  'tech_stack.md',
  'implementation_plan.md',
  'requirements.md',
] as const;

const ARTIFACT_TAB_LABELS: Record<string, string> = {
  'solution_spec.md': 'Solution Spec',
  'user_stories.md': 'User Stories',
  'design_spec.md': 'Design Spec',
  'tech_stack.md': 'Tech Stack',
  'implementation_plan.md': 'Implementation',
  'requirements.md': 'Requirements',
};

const PlanReviewPanel: React.FC<Props> = ({ jobId, onApproved, layout = 'embedded' }) => {
  const isPage = layout === 'page';
  const [plan, setPlan] = useState<PlanReviewData | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('user_stories.md');
  const [feedback, setFeedback] = useState('');
  const [refining, setRefining] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refineSuccess, setRefineSuccess] = useState(false);
  const [granularTasks, setGranularTasks] = useState<GranularTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [isSolutionReview, setIsSolutionReview] = useState(false);
  const [solutionFeedbackHistory, setSolutionFeedbackHistory] = useState<{ feedback: string }[]>([]);

  const autoApproveEnabled = getWorkflowPrefs().autoApprovePlan;
  const [countdown, setCountdown] = useState<number | null>(null);
  const [autoApproveCancelled, setAutoApproveCancelled] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPlan = useCallback(async () => {
    try {
      const data = await getJobPlan(jobId);

      // Merge solution spec if the solutioning loop produced one
      try {
        const sol = await getJobSolution(jobId);
        const spec = sol.artifacts?.['solution_spec.md'];
        if (spec) {
          data.artifacts = { ...data.artifacts, 'solution_spec.md': spec };
        }
        if (sol.solution_feedback_history?.length) {
          setSolutionFeedbackHistory(sol.solution_feedback_history);
        }
      } catch {
        // Solution endpoint may 404 if solutioning was not enabled — ignore
      }

      // Determine whether this job is still awaiting review, so jobs opened
      // via "View Plan" (any status) render read-only instead of stale actions.
      try {
        const job = await getJob(jobId);
        setJobStatus(job.status);
        setIsSolutionReview(job.status === 'pending_solution_review');
      } catch {
        setJobStatus(null);
      }

      setPlan(data);
      if (data.jira_stories.length > 0) {
        setActiveTab('stories');
      } else {
        const firstArtifact = ARTIFACT_ORDER.find((key) => key in data.artifacts);
        if (firstArtifact) setActiveTab(firstArtifact);
      }
    } catch {
      setError('Failed to load plan artifacts.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  useEffect(() => {
    if (activeTab === 'tasks') {
      setTasksLoading(true);
      getGranularTasks(jobId)
        .then((res) => setGranularTasks(res.tasks))
        .catch(() => setGranularTasks([]))
        .finally(() => setTasksLoading(false));
    }
  }, [activeTab, jobId]);

  // Pre-fetch granular tasks count for tab label
  useEffect(() => {
    getGranularTasks(jobId)
      .then((res) => setGranularTasks(res.tasks))
      .catch(() => {});
  }, [jobId]);

  const isReviewable = jobStatus === null || REVIEWABLE_STATUSES.has(jobStatus);

  useEffect(() => {
    if (!autoApproveEnabled || autoApproveCancelled || loading || !plan || !isReviewable) return;
    setCountdown(AUTO_APPROVE_DELAY_SEC);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c === null) return null;
        if (c <= 1) {
          clearInterval(countdownRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoApproveEnabled, autoApproveCancelled, loading, plan, isReviewable]);

  useEffect(() => {
    if (countdown === 0 && !autoApproveCancelled && !approving) {
      handleApprove();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  const handleRefine = async () => {
    if (!feedback.trim()) return;
    setRefining(true);
    setError(null);
    setRefineSuccess(false);
    try {
      if (isSolutionReview) {
        await refineSolution(jobId, feedback.trim());
      } else {
        await refinePlan(jobId, feedback.trim());
      }
      setFeedback('');
      setRefineSuccess(true);
      await fetchPlan();
    } catch {
      setError(`Failed to regenerate ${isSolutionReview ? 'solution' : 'plan'}. Please try again.`);
    } finally {
      setRefining(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    setError(null);
    if (countdownRef.current) clearInterval(countdownRef.current);
    try {
      await approveJob(jobId);
      onApproved?.();
    } catch {
      setError('Failed to approve job. Please try again.');
      setApproving(false);
    }
  };

  const cancelAutoApprove = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(null);
    setAutoApproveCancelled(true);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#6A6E73' }}>
        <Spinner size="lg" />
        <div style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>Loading plan…</div>
      </div>
    );
  }

  const hasStories = (plan?.jira_stories ?? []).length > 0;
  const artifactKeys = ARTIFACT_ORDER.filter((key) => key in (plan?.artifacts ?? {}));

  const renderStoryList = (stories: JiraStory[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {stories.map((s, i) => (
        <div
          key={s.key ?? i}
          style={{
            background: s.ai_generated ? '#FFF8E1' : '#F8F8F8',
            border: `1px solid ${s.ai_generated ? '#FFD54F' : '#E0E0E0'}`,
            borderRadius: '8px',
            padding: '0.75rem 1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            {s.key && (
              <span style={{
                fontSize: '0.6875rem', fontWeight: 700, color: '#0066CC',
                background: '#E8F0FE', padding: '1px 6px', borderRadius: '4px',
              }}>
                {s.key}
              </span>
            )}
            {s.ai_generated && (
              <span style={{
                fontSize: '0.6875rem', fontWeight: 600, color: '#B45309',
                background: '#FEF3C7', padding: '1px 6px', borderRadius: '4px',
              }}>
                AI-generated
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#151515' }}>
            {s.summary}
          </div>
          {s.description && (
            <MarkdownPreview content={s.description} variant="inline" />
          )}
        </div>
      ))}
    </div>
  );

  const renderActiveTabContent = () => {
    if (activeTab === 'stories' && plan) {
      return renderStoryList(plan.jira_stories);
    }
    if (activeTab === 'tasks') {
      return (
        <GranularTaskBoard
          tasks={granularTasks}
          loading={tasksLoading}
          compact
          title="Decomposed Tasks"
          subtitle="Per-file tasks generated from the plan."
        />
      );
    }
    if (plan && activeTab in plan.artifacts) {
      return (
        <MarkdownPreview
          content={plan.artifacts[activeTab as keyof typeof plan.artifacts] ?? ''}
          variant="document"
          maxHeight={isPage ? 'none' : 'min(70vh, 640px)'}
        />
      );
    }
    return null;
  };

  const shellStyle: React.CSSProperties = isPage
    ? {
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        background: '#FFFFFF',
        border: '1px solid #E0E0E0',
        borderRadius: '12px',
        padding: '1.5rem 2rem',
        fontFamily: '"Red Hat Text", sans-serif',
      }
    : {
        background: '#FFFBF0',
        border: '2px solid #F0AB00',
        borderRadius: '12px',
        padding: '1.5rem',
        marginTop: '1rem',
        fontFamily: '"Red Hat Text", sans-serif',
      };

  return (
    <div style={shellStyle}>
      <div style={{ flexShrink: 0, marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          {!isPage && <span style={{ fontSize: '1.5rem' }}>🔍</span>}
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: isPage ? '1.375rem' : '1rem',
              fontWeight: 700,
              color: '#151515',
              marginBottom: '0.25rem',
            }}>
              {isReviewable
                ? (isSolutionReview ? 'Review & Approve Solution' : 'Review & Approve Plan')
                : (isSolutionReview ? 'Solution' : 'Plan')}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6A6E73' }}>
              {isReviewable
                ? (isSolutionReview
                    ? 'The solutioning phase is complete. Review the generated solution spec below, provide feedback to refine, or approve to continue building.'
                    : 'The planning phase is complete. Review the generated plan below, provide feedback to regenerate, or approve to start coding.')
                : (isSolutionReview
                    ? 'Read-only view of the solution spec that was approved.'
                    : 'This job has already moved past the planning phase. Read-only view of the plan that was generated.')}
            </div>
            {plan?.epic_judge_reasoning && (
              <div style={{
                marginTop: '0.5rem', fontSize: '0.8125rem', color: '#4A4A4A',
                background: '#FEF3C7', borderRadius: '6px', padding: '0.5rem 0.75rem',
                borderLeft: '3px solid #F0AB00',
              }}>
                <strong>AI Judge:</strong> {plan.epic_judge_reasoning}
              </div>
            )}
          </div>
        </div>
      </div>

      {isReviewable && autoApproveEnabled && !autoApproveCancelled && countdown !== null && (
        <div style={{
          background: '#F0FFF0',
          border: '1px solid #84CC84',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '1rem' }}>⚡</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1A6B1A', marginBottom: '0.35rem' }}>
              Auto-approving in {countdown}s…
            </div>
            <Progress
              value={(AUTO_APPROVE_DELAY_SEC - countdown) * (100 / AUTO_APPROVE_DELAY_SEC)}
              size="sm"
              title=""
              aria-label="Auto-approve countdown"
              style={{ '--pf-v5-c-progress__bar--BackgroundColor': '#3E8635' } as React.CSSProperties}
            />
          </div>
          <Button
            variant="plain"
            onClick={cancelAutoApprove}
            icon={<BanIcon />}
            style={{ color: '#C9190B', flexShrink: 0 }}
            aria-label="Cancel auto-approve"
          >
            Cancel
          </Button>
        </div>
      )}

      {(hasStories || artifactKeys.length > 0 || granularTasks.length > 0) && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          flex: isPage ? 1 : undefined,
          minHeight: isPage ? 0 : undefined,
          marginBottom: isPage ? '1rem' : undefined,
        }}>
          <Tabs
            activeKey={activeTab}
            onSelect={(_, key) => setActiveTab(String(key))}
            isBox={false}
            mountOnEnter
            unmountOnExit
            style={{ flexShrink: 0 }}
          >
            {[
              hasStories ? (
                <Tab
                  key="stories"
                  eventKey="stories"
                  title={<TabTitleText>Jira Stories ({plan!.jira_stories.length})</TabTitleText>}
                />
              ) : null,
              ...artifactKeys.map((key) => (
                <Tab
                  key={key}
                  eventKey={key}
                  title={<TabTitleText>{ARTIFACT_TAB_LABELS[key] ?? key}</TabTitleText>}
                />
              )),
              <Tab
                key="tasks"
                eventKey="tasks"
                title={<TabTitleText>Tasks{granularTasks.length > 0 ? ` (${granularTasks.length})` : ''}</TabTitleText>}
              />,
            ]}
          </Tabs>
          <div
            role="tabpanel"
            id={`plan-tab-${activeTab}`}
            style={{
              paddingTop: '1rem',
              flex: isPage ? 1 : undefined,
              minHeight: isPage ? 0 : undefined,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {renderActiveTabContent()}
          </div>
        </div>
      )}

      {!hasStories && artifactKeys.length === 0 && (
        <div style={{
          color: '#6A6E73', fontSize: '0.875rem', padding: '1rem',
          background: '#F8F8F8', borderRadius: '8px', marginBottom: '1rem',
        }}>
          No plan artifacts available yet.
        </div>
      )}

      <div style={{ flexShrink: 0 }}>
        {(() => {
          const history = isSolutionReview
            ? solutionFeedbackHistory
            : (plan?.plan_feedback_history ?? []);
          return history.length > 0 ? (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{
                fontSize: '0.6875rem', fontWeight: 600, color: '#6A6E73',
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem',
              }}>
                <OutlinedCommentsIcon /> Feedback history ({history.length} rounds)
              </div>
              {history.map((round, i) => (
                <div key={i} style={{
                  background: '#F0F8FF', border: '1px solid #BFDBFE', borderRadius: '6px',
                  padding: '0.5rem 0.75rem', marginBottom: '0.35rem',
                  fontSize: '0.8125rem', color: '#1E40AF',
                }}>
                  <strong>Round {i + 1}:</strong> {round.feedback}
                </div>
              ))}
            </div>
          ) : null;
        })()}

        {isReviewable && (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{
                fontSize: '0.6875rem', fontWeight: 600, color: '#6A6E73',
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem',
              }}>
                {isSolutionReview ? 'Provide feedback to refine solution' : 'Provide feedback to regenerate'}
              </div>
              <TextArea
                value={feedback}
                onChange={(_e, val) => setFeedback(val)}
                placeholder={isSolutionReview
                  ? 'e.g. Use event-driven architecture instead. Add Redis caching layer. Split the auth module.'
                  : 'e.g. Split the auth story into login + registration. Add a caching layer. Use PostgreSQL instead of SQLite.'}
                rows={3}
                style={{ fontFamily: '"Red Hat Text", sans-serif', fontSize: '0.875rem' }}
                aria-label={isSolutionReview ? 'Solution feedback' : 'Plan feedback'}
              />
            </div>

            {error && (
              <div style={{
                color: '#C9190B', fontSize: '0.8125rem', marginBottom: '0.75rem',
                background: '#FFF5F5', padding: '0.5rem 0.75rem', borderRadius: '6px',
                border: '1px solid #FECDD3',
              }}>
                {error}
              </div>
            )}

            {refineSuccess && !refining && (
              <div style={{
                color: '#3E8635', fontSize: '0.8125rem', marginBottom: '0.75rem',
                background: '#F3FAF3', padding: '0.5rem 0.75rem', borderRadius: '6px',
                border: '1px solid #C8E6C9',
              }}>
                {isSolutionReview ? 'Solution refined. Review the updated spec above.' : 'Plan regenerated. Review the updated plan above.'}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                onClick={handleApprove}
                isDisabled={approving || refining}
                icon={approving ? <Spinner size="sm" /> : <CheckCircleIcon />}
                style={{ backgroundColor: '#3E8635', border: 'none' }}
              >
                {approving ? 'Approving…' : (isSolutionReview ? 'Approve Solution & Continue' : 'Approve & Start Coding')}
              </Button>
              <Button
                variant="secondary"
                onClick={handleRefine}
                isDisabled={refining || approving || !feedback.trim()}
                icon={refining ? <Spinner size="sm" /> : <SyncAltIcon />}
              >
                {refining ? 'Regenerating…' : (isSolutionReview ? 'Refine Solution' : 'Regenerate Plan')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PlanReviewPanel;
