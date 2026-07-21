/// <reference types="cypress" />
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import Landing from '../../src/pages/Landing';
import { OAuthProvider } from '../../src/auth/OAuthProvider';
import '@patternfly/react-core/dist/styles/base.css';

/**
 * Component tests for Landing — Capability dropdown (Adaptive Stack Contract).
 *
 * Network is intercepted; the API client module is not mocked.
 */

const HELPER_FULL =
  'Full: research stack options, critique the approach, then plan & build. Best for apps, APIs, and multi-tier systems.';
const HELPER_AUTO =
  'Auto: backend infers Fast or Full from your vision (e.g. simple client page → Fast; named framework / API → Full).';
const HELPER_FAST =
  'Fast: skip stack research. Lock constraints from your vision, then plan & build as usual (including tech_stack.md). Best for simple pages, widgets, and single-file deliverables.';

const mountLanding = () => {
  cy.mount(
    <OAuthProvider>
      <MemoryRouter initialEntries={['/']}>
        <Landing />
      </MemoryRouter>
    </OAuthProvider>,
  );
};

describe('Landing — Capability dropdown', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/backends', {
      statusCode: 200,
      body: {
        backends: [
          { name: 'opl-ai-team', display_name: 'OPL AI Team', available: true },
        ],
      },
    }).as('getBackends');

    cy.intercept('GET', '/api/jira/config', {
      statusCode: 200,
      body: { configured: false },
    });

    cy.intercept('GET', '/api/github/config', {
      statusCode: 200,
      body: { configured: false },
    });

    cy.intercept('GET', '/api/llm/status', {
      statusCode: 200,
      body: { configured: true, source: 'server' },
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

    cy.intercept('POST', '/api/jobs/preview-capabilities', {
      statusCode: 200,
      body: {
        delivery_surface: 'client_deliverable',
        complexity: 'minimal',
        suggested_path: 'fast',
        evidence: ['simple html page'],
      },
    }).as('previewCapabilities');

    mountLanding();
    cy.contains('button', 'Build New Project').should('be.visible');
  });

  it('shows Capability dropdown with Auto, Fast, and Full options', () => {
    cy.get('[aria-label="Capability"]').scrollIntoView().should('exist');
    cy.get('[aria-label="Capability"] option').then(($opts) => {
      const labels = [...$opts].map((o) => o.textContent?.trim());
      expect(labels).to.include.members(['Auto', 'Fast', 'Full']);
    });
  });

  it('defaults Capability to Auto and shows Auto helper text', () => {
    cy.get('[aria-label="Capability"]').scrollIntoView().should('have.value', 'adaptive');
    cy.contains(HELPER_AUTO).scrollIntoView().should('exist');
  });

  it('shows Auto helper text when Auto is selected', () => {
    cy.get('[aria-label="Capability"]').select('adaptive');
    cy.contains(HELPER_AUTO).should('be.visible');
  });

  it('shows Fast helper text when Fast is selected', () => {
    cy.get('[aria-label="Capability"]').select('fast');
    cy.contains(HELPER_FAST).should('be.visible');
  });

  it('POST /api/jobs body includes capability_profile.solutioning_path fast', () => {
    cy.intercept('POST', '/api/jobs', {
      statusCode: 201,
      body: { job_id: 'cap-job-fast', status: 'queued', documents: 0, github_repos: 0 },
    }).as('createJob');

    cy.get('[aria-label="Capability"]').select('fast');
    cy.get('textarea[aria-label="Project description"]').type(
      'Simple HTML page with an Asia Pacific map',
    );
    cy.contains('button', 'Start Building').click();

    cy.wait('@createJob').then((interception) => {
      const body = interception.request.body;
      expect(body).to.have.property('capability_profile');
      expect(body.capability_profile).to.deep.include({
        solutioning_path: 'fast',
        source: 'user',
      });
    });
  });

  it('omits capability_profile from POST /api/jobs when Auto is selected (default)', () => {
    cy.intercept('POST', '/api/jobs', {
      statusCode: 201,
      body: { job_id: 'cap-job-auto', status: 'queued', documents: 0, github_repos: 0 },
    }).as('createJob');

    cy.get('[aria-label="Capability"]').should('have.value', 'adaptive');
    cy.get('textarea[aria-label="Project description"]').type(
      'Build a Frappe invoicing application',
    );
    cy.contains('button', 'Start Building').click();

    cy.wait('@createJob').then((interception) => {
      const body = interception.request.body;
      expect(body).not.to.have.property('capability_profile');
    });
  });
});
