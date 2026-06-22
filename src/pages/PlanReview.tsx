import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Title } from '@patternfly/react-core';
import { ArrowLeftIcon } from '@patternfly/react-icons';
import PlanReviewPanel from '../components/PlanReviewPanel';

const PlanReview: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  if (!jobId) {
    return (
      <div style={{ padding: '2rem', fontFamily: '"Red Hat Text", sans-serif' }}>
        <Title headingLevel="h1" size="lg">No job selected</Title>
        <Button variant="link" onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <div style={{
      height: 'calc(100vh - 64px)',
      display: 'flex',
      flexDirection: 'column',
      padding: '1.5rem 2rem',
      boxSizing: 'border-box',
      fontFamily: '"Red Hat Text", sans-serif',
      background: '#FFFFFF',
    }}>
      <div style={{ marginBottom: '1rem', flexShrink: 0 }}>
        <Button
          variant="link"
          icon={<ArrowLeftIcon />}
          onClick={() => navigate(-1)}
          style={{ paddingLeft: 0, marginBottom: '0.5rem' }}
        >
          Back
        </Button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <PlanReviewPanel
          jobId={jobId}
          layout="page"
          onApproved={() => navigate('/dashboard')}
        />
      </div>
    </div>
  );
};

export default PlanReview;
