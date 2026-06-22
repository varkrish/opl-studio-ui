/// <reference types="cypress" />
import React from 'react';
import PlanReviewPanel from '../../src/components/PlanReviewPanel';

const PLAN_FIXTURE = {
  artifacts: {
    'user_stories.md': '## Story 1\nAs a user, I want to log in.',
    'design_spec.md': '# Design\nSingle-page app with REST backend.',
    'tech_stack.md': '## Tech Stack\nFastAPI + React + PostgreSQL',
  },
  jira_stories: [
    { key: 'PROJ-1', summary: 'User authentication', ai_generated: true },
    { key: 'PROJ-2', summary: 'Dashboard view', ai_generated: true },
  ],
  epic_judge_reasoning: 'Epic lacks stories — decomposed into 2 child stories.',
  plan_feedback_history: [],
};

describe('PlanReviewPanel', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/jobs/test-job/plan', PLAN_FIXTURE).as('getPlan');
    cy.mount(<PlanReviewPanel jobId="test-job" onApproved={cy.spy().as('onApproved')} />);
    cy.wait('@getPlan');
  });

  it('renders the review heading', () => {
    cy.contains('Review & Approve Plan').should('be.visible');
  });

  it('shows AI Judge reasoning', () => {
    cy.contains('Epic lacks stories — decomposed into 2 child stories.').should('be.visible');
  });

  it('shows story list by default', () => {
    cy.contains('User authentication').should('be.visible');
    cy.contains('Dashboard view').should('be.visible');
    cy.contains('AI-generated').should('be.visible');
  });

  it('can switch to artifact tabs', () => {
    cy.contains('User Stories').click();
    cy.contains('As a user, I want to log in.').should('be.visible');
  });

  it('disables Regenerate button when feedback is empty', () => {
    cy.contains('Regenerate Plan').should('be.disabled');
  });

  it('enables Regenerate button when feedback is typed', () => {
    cy.get('textarea[aria-label="Plan feedback"]').type('Add a caching layer');
    cy.contains('Regenerate Plan').should('not.be.disabled');
  });

  it('calls approve endpoint and fires onApproved', () => {
    cy.intercept('POST', '/api/jobs/test-job/approve', { job_id: 'test-job', status: 'resumed' }).as('approve');
    cy.contains('Approve & Start Coding').click();
    cy.wait('@approve');
    cy.get('@onApproved').should('have.been.called');
  });

  it('calls refine-plan endpoint with feedback and shows success message', () => {
    cy.intercept('POST', '/api/jobs/test-job/refine-plan', {
      status: 'pending_review',
      artifacts: PLAN_FIXTURE.artifacts,
      feedback_rounds: 1,
      job_id: 'test-job',
    }).as('refine');
    // Also stub the follow-up plan reload
    cy.intercept('GET', '/api/jobs/test-job/plan', {
      ...PLAN_FIXTURE,
      plan_feedback_history: [{ feedback: 'Add a caching layer', at: '"2026-06-20T00:00:00Z"' }],
    }).as('getPlanAfterRefine');

    cy.get('textarea[aria-label="Plan feedback"]').type('Add a caching layer');
    cy.contains('Regenerate Plan').click();
    cy.wait('@refine');
    cy.contains('Plan regenerated').should('be.visible');
  });
});
