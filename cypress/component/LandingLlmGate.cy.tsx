/// <reference types="cypress" />
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import Landing from '../../src/pages/Landing';
import { OAuthProvider } from '../../src/auth/OAuthProvider';
import '@patternfly/react-core/dist/styles/base.css';

/**
 * TDD: Build page must surface missing LLM credentials and block Start Building.
 */

const mountLanding = () => {
  cy.mount(
    <OAuthProvider>
      <MemoryRouter initialEntries={['/']}>
        <Landing />
      </MemoryRouter>
    </OAuthProvider>,
  );
};

const stubCommonApis = (llmConfigured: boolean) => {
  cy.intercept('GET', '/api/backends', {
    statusCode: 200,
    body: {
      backends: [
        { name: 'opl-ai-team', display_name: 'OPL AI Team', available: true },
      ],
    },
  });
  cy.intercept('GET', '/api/jira/config', {
    statusCode: 200,
    body: { configured: false },
  });
  cy.intercept('GET', '/api/github/config', {
    statusCode: 200,
    body: { configured: false },
  });
  cy.intercept('GET', '/api/workflow/config', {
    statusCode: 200,
    body: {
      configured: false,
      plan_review_enabled: false,
      solutioning_enabled: false,
      solutioning_max_passes: 3,
      solutioning_max_github_searches: 10,
      auto_approve_plan: false,
      tldr_enabled: true,
      tldr_max_chars: 6000,
      tldr_include_structure: true,
      tldr_min_completed_files: 1,
    },
  });
  cy.intercept('GET', '/api/llm/status', {
    statusCode: 200,
    body: llmConfigured
      ? { configured: true, source: 'server' }
      : {
          configured: false,
          source: 'none',
          hint: 'Save a key in Settings → API Configuration.',
        },
  }).as('llmStatus');
};

describe('Landing — LLM gate', () => {
  it('shows warning and disables Start Building when LLM is not configured', () => {
    stubCommonApis(false);
    mountLanding();
    cy.wait('@llmStatus');
    cy.contains('LLM API key required').should('be.visible');
    cy.contains('Open Settings → API Configuration').should('exist');
    cy.get('textarea').first().type('Build a simple calculator API');
    cy.contains('button', 'Start Building').should('be.disabled');
  });

  it('allows Start Building when LLM is configured', () => {
    stubCommonApis(true);
    cy.intercept('POST', '/api/jobs', {
      statusCode: 201,
      body: { job_id: 'job-llm-ok', status: 'queued', documents: 0, github_repos: 0 },
    }).as('createJob');
    mountLanding();
    cy.wait('@llmStatus');
    cy.contains('LLM API key required').should('not.exist');
    cy.get('textarea').first().type('Build a simple calculator API');
    cy.contains('button', 'Start Building').should('not.be.disabled').click();
    cy.wait('@createJob');
  });
});
