/**
 * PlanReviewPanel — universal plan review / feedback / approval panel.
 *
 * Shown whenever a job is in `pending_review` or `pending_approval` state.
 * Works for all job types:
 *   - Regular build: shows user_stories.md, design_spec.md, tech_stack.md
 *   - Epic jobs: also shows AI-decomposed story list and judge reasoning
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
  ListIcon,
  BanIcon,
} from '@patternfly/react-icons';
import { approveJob, getJobPlan, refinePlan } from '../api/client';
import { getWorkflowPrefs } from '../hooks/useWorkflowPrefs';
import type { PlanReviewData, JiraStory } from '../types';

const AUTO_APPROVE_DELAY_SEC = 5;

interface Props {
  jobId: string;
  /** Called after the user approves so the parent can re-poll the job. */
  onApproved?: () => void;
}

const ARTIFACT_LABELS: Record<string, string> = {
  'user_stories.md': '📋 User Stories',
  'design_spec.md': '🎨 Design Spec',
  'tech_stack.md': '🏗️ Tech Stack',
  'requirements.md': '📄 Requirements',
};

const PlanReviewPanel: React.FC<Props> = ({ jobId, onApproved }) => {
  const [plan, setPlan] = useState<PlanReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('stories');
  const [feedback, setFeedback] = useState('');
  const [refining, setRefining] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refineSuccess, setRefineSuccess] = useState(false);

  // Auto-approve countdown
  const autoApproveEnabled = getWorkflowPrefs().autoApprovePlan;
  const [countdown, setCountdown] = useState<number | null>(null);
  const [autoApproveCancelled, setAutoApproveCancelled] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPlan = useCallback(async () => {
    try {
      const data = await getJobPlan(jobId);
      setPlan(data);
      // Pick default tab: stories if epic, else first artifact
      if (data.jira_stories.length > 0) {
        setActiveTab('stories');
      } else {
        const firstArtifact = Object.keys(data.artifacts)[0];
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

  // Start auto-approve countdown after plan loads (if pref is ON and not cancelled)
  useEffect(() => {
    if (!autoApproveEnabled || autoApproveCancelled || loading || !plan) return;
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
  }, [autoApproveEnabled, autoApproveCancelled, loading, plan]);

  // Fire approval when countdown hits 0
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
      const result = await refinePlan(jobId, feedback.trim());
      setPlan((prev) =>
        prev ? { ...prev, artifacts: result.artifacts ?? prev.artifacts } : prev,
      );
      setFeedback('');
      setRefineSuccess(true);
      // Re-fetch to pick up updated stories too
      await fetchPlan();
    } catch {
      setError('Failed to regenerate plan. Please try again.');
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
  const artifactKeys = Object.keys(plan?.artifacts ?? {});

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
            <div style={{
              fontSize: '0.8125rem', color: '#6A6E73', marginTop: '0.25rem',
              lineHeight: 1.5,
            }}>
              {s.description}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderArtifact = (key: string, content: string) => (
    <div style={{
      background: '#1E1E1E', borderRadius: '10px', padding: '1rem',
      fontFamily: '"Red Hat Mono", monospace', fontSize: '0.75rem',
      color: '#D4D4D4', maxHeight: '320px', overflowY: 'auto',
      lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      {content || <span style={{ color: '#6A6E73' }}>No content available.</span>}
    </div>
  );

  return (
    <div style={{
      background: '#FFFBF0',
      border: '2px solid #F0AB00',
      borderRadius: '12px',
      padding: '1.5rem',
      marginTop: '1rem',
      fontFamily: '"Red Hat Text", sans-serif',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <span style={{ fontSize: '1.5rem' }}>🔍</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#151515', marginBottom: '0.25rem' }}>
            Review &amp; Approve Plan
          </div>
          <div style={{ fontSize: '0.8125rem', color: '#6A6E73' }}>
            The planning phase is complete. Review the generated plan below, provide feedback to
            regenerate, or approve to start coding.
          </div>
          {plan?.epic_judge_reasoning && (
            <div style={{
              marginTop: '0.5rem', fontSize: '0.8125rem', color: '#4A4A4A',
              background: '#FEF3C7', borderRadius: '6px', padding: '0.5rem 0.75rem',
              borderLeft: '3px solid #F0AB00',
            }}>
              🧠 <strong>AI Judge:</strong> {plan.epic_judge_reasoning}
            </div>
          )}
        </div>
      </div>

      {/* Auto-approve countdown banner */}
      {autoApproveEnabled && !autoApproveCancelled && countdown !== null && (
        <div style={{
          background: '#F0FFF0',
          border: '1px solid #84CC84',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
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

      {/* Tabs */}
      {(hasStories || artifactKeys.length > 0) && (
        <Tabs
          activeKey={activeTab}
          onSelect={(_, key) => setActiveTab(key as string)}
          style={{ marginBottom: '1rem' }}
          isBox={false}
        >
          {hasStories && (
            <Tab
              eventKey="stories"
              title={<TabTitleText><ListIcon /> Stories ({plan!.jira_stories.length})</TabTitleText>}
            >
              <div style={{ paddingTop: '0.75rem' }}>
                {renderStoryList(plan!.jira_stories)}
              </div>
            </Tab>
          )}
          {artifactKeys.map((key) => (
            <Tab
              key={key}
              eventKey={key}
              title={<TabTitleText>{ARTIFACT_LABELS[key] ?? key}</TabTitleText>}
            >
              <div style={{ paddingTop: '0.75rem' }}>
                {renderArtifact(key, plan!.artifacts[key as keyof typeof plan.artifacts] ?? '')}
              </div>
            </Tab>
          ))}
        </Tabs>
      )}

      {!hasStories && artifactKeys.length === 0 && (
        <div style={{
          color: '#6A6E73', fontSize: '0.875rem', padding: '1rem',
          background: '#F8F8F8', borderRadius: '8px', marginBottom: '1rem',
        }}>
          No plan artifacts available yet.
        </div>
      )}

      {/* Feedback history */}
      {(plan?.plan_feedback_history ?? []).length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{
            fontSize: '0.6875rem', fontWeight: 600, color: '#6A6E73',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem',
          }}>
            <OutlinedCommentsIcon /> Feedback history ({plan!.plan_feedback_history.length} rounds)
          </div>
          {plan!.plan_feedback_history.map((round, i) => (
            <div key={i} style={{
              background: '#F0F8FF', border: '1px solid #BFDBFE', borderRadius: '6px',
              padding: '0.5rem 0.75rem', marginBottom: '0.35rem',
              fontSize: '0.8125rem', color: '#1E40AF',
            }}>
              <strong>Round {i + 1}:</strong> {round.feedback}
            </div>
          ))}
        </div>
      )}

      {/* Feedback input */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{
          fontSize: '0.6875rem', fontWeight: 600, color: '#6A6E73',
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem',
        }}>
          Provide feedback to regenerate
        </div>
        <TextArea
          value={feedback}
          onChange={(_e, val) => setFeedback(val)}
          placeholder="e.g. Split the auth story into login + registration. Add a caching layer. Use PostgreSQL instead of SQLite."
          rows={3}
          style={{ fontFamily: '"Red Hat Text", sans-serif', fontSize: '0.875rem' }}
          aria-label="Plan feedback"
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
          ✅ Plan regenerated. Review the updated plan above.
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Button
          variant="primary"
          onClick={handleApprove}
          isDisabled={approving || refining}
          icon={approving ? <Spinner size="sm" /> : <CheckCircleIcon />}
          style={{ backgroundColor: '#3E8635', border: 'none' }}
        >
          {approving ? 'Approving…' : 'Approve & Start Coding'}
        </Button>
        <Button
          variant="secondary"
          onClick={handleRefine}
          isDisabled={refining || approving || !feedback.trim()}
          icon={refining ? <Spinner size="sm" /> : <SyncAltIcon />}
        >
          {refining ? 'Regenerating…' : 'Regenerate Plan'}
        </Button>
      </div>
    </div>
  );
};

export default PlanReviewPanel;
