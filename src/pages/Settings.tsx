import React, { useState, useEffect } from 'react';
import {
  Card,
  CardTitle,
  CardBody,
  CardHeader,
  Title,
  Form,
  FormGroup,
  TextInput,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  Switch,
  Button,
  Divider,
  Split,
  SplitItem,
  Alert,
  Tabs,
  Tab,
  TabTitleText,
  Grid,
  GridItem,
  Flex,
  FlexItem,
  Label,
  Spinner,
  ActionList,
  ActionListItem,
} from '@patternfly/react-core';
import { CogIcon, UserIcon, KeyIcon, BellIcon, AutomationIcon, LinkIcon, CheckCircleIcon, TimesCircleIcon } from '@patternfly/react-icons';
import { useWorkflowPrefs } from '../hooks/useWorkflowPrefs';
import { getJiraConfig, saveJiraConfig, deleteJiraConfig, testJiraConnection } from '../api/client';
import type { JiraConfig } from '../api/client';

const Settings: React.FC = () => {
  const [activeTabKey, setActiveTabKey] = useState<string | number>(0);
  const [saved, setSaved] = useState(false);
  const { prefs, setPrefs } = useWorkflowPrefs();

  // General Settings
  const [workspacePath, setWorkspacePath] = useState('./workspace');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  // API Settings
  const [apiKey, setApiKey] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState('http://localhost:8081');
  const [modelSelectOpen, setModelSelectOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('qwen3-14b');

  // Notification Settings
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [slackNotifications, setSlackNotifications] = useState(false);
  const [jobCompletionNotif, setJobCompletionNotif] = useState(true);
  const [errorNotif, setErrorNotif] = useState(true);

  // Jira configuration
  const [jiraConfig, setJiraConfig] = useState<JiraConfig | null>(null);
  const [jiraBaseUrl, setJiraBaseUrl] = useState('');
  const [jiraEmail, setJiraEmail] = useState('');
  const [jiraToken, setJiraToken] = useState('');
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraTestStatus, setJiraTestStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [jiraSaveStatus, setJiraSaveStatus] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    getJiraConfig()
      .then(cfg => {
        setJiraConfig(cfg);
        if (cfg.configured) {
          setJiraBaseUrl(cfg.jira_base_url || '');
          setJiraEmail(cfg.jira_email || '');
        }
      })
      .catch(() => {});
  }, []);

  const handleJiraTest = async () => {
    setJiraTestStatus(null);
    setJiraLoading(true);
    try {
      const result = await testJiraConnection({ jira_base_url: jiraBaseUrl, jira_email: jiraEmail, api_token: jiraToken });
      setJiraTestStatus(result.ok
        ? { ok: true, message: `Connected as ${result.display_name}` }
        : { ok: false, message: result.error || 'Connection failed' }
      );
    } catch {
      setJiraTestStatus({ ok: false, message: 'Request failed — check the console' });
    } finally {
      setJiraLoading(false);
    }
  };

  const handleJiraSave = async () => {
    setJiraSaveStatus(null);
    setJiraLoading(true);
    try {
      await saveJiraConfig({ jira_base_url: jiraBaseUrl, jira_email: jiraEmail, api_token: jiraToken });
      const cfg = await getJiraConfig();
      setJiraConfig(cfg);
      setJiraToken('');
      setJiraSaveStatus({ ok: true, message: 'Jira credentials saved.' });
    } catch {
      setJiraSaveStatus({ ok: false, message: 'Failed to save credentials.' });
    } finally {
      setJiraLoading(false);
    }
  };

  const handleJiraDisconnect = async () => {
    setJiraLoading(true);
    try {
      await deleteJiraConfig();
      setJiraConfig({ configured: false });
      setJiraBaseUrl('');
      setJiraEmail('');
      setJiraToken('');
      setJiraTestStatus(null);
      setJiraSaveStatus(null);
    } catch {
      setJiraSaveStatus({ ok: false, message: 'Failed to remove credentials.' });
    } finally {
      setJiraLoading(false);
    }
  };

  const models = [
    'qwen3-14b',
    'deepseek-r1-distill-qwen-14b',
    'granite-3-2-8b-instruct',
    'llama-3-70b',
    'gpt-4-turbo',
  ];

  const handleSave = () => {
    // In a real app, this would save to backend
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <>
      {/* Header */}
      <Split hasGutter style={{ marginBottom: '1.5rem' }}>
        <SplitItem isFilled>
          <Title headingLevel="h1" size="2xl" style={{ fontFamily: '"Red Hat Display", sans-serif' }}>
            Settings
          </Title>
          <p style={{ color: '#6A6E73', marginTop: '0.25rem' }}>
            Configure your AI development environment and preferences.
          </p>
        </SplitItem>
        <SplitItem>
          <Button variant="primary" onClick={handleSave}>
            Save Changes
          </Button>
        </SplitItem>
      </Split>

      {saved && (
        <Alert
          variant="success"
          title="Settings saved successfully"
          style={{ marginBottom: '1.5rem' }}
          isInline
        />
      )}

      <Card>
        <CardBody>
          <Tabs
            activeKey={activeTabKey}
            onSelect={(_event, tabIndex) => setActiveTabKey(tabIndex)}
            aria-label="Settings tabs"
          >
            {/* General Tab */}
            <Tab eventKey={0} title={<TabTitleText><CogIcon /> General</TabTitleText>}>
              <div style={{ padding: '1.5rem 0' }}>
                <Title headingLevel="h3" size="lg" style={{ marginBottom: '1rem' }}>
                  General Settings
                </Title>
                <Form>
                  <FormGroup label="Workspace Path" fieldId="workspace-path" isRequired>
                    <TextInput
                      id="workspace-path"
                      value={workspacePath}
                      onChange={(_event, value) => setWorkspacePath(value)}
                      placeholder="/path/to/workspace"
                    />
                    <p style={{ fontSize: '0.875rem', color: '#6A6E73', marginTop: '0.5rem' }}>
                      Directory where all generated projects will be stored
                    </p>
                  </FormGroup>

                  <FormGroup label="Auto-save projects" fieldId="auto-save">
                    <Switch
                      id="auto-save"
                      label="Enabled"
                      labelOff="Disabled"
                      isChecked={autoSaveEnabled}
                      onChange={(_event, checked) => setAutoSaveEnabled(checked)}
                    />
                    <p style={{ fontSize: '0.875rem', color: '#6A6E73', marginTop: '0.5rem' }}>
                      Automatically save project state and progress
                    </p>
                  </FormGroup>

                  <FormGroup label="Dark Mode" fieldId="dark-mode">
                    <Switch
                      id="dark-mode"
                      label="Enabled"
                      labelOff="Disabled"
                      isChecked={darkModeEnabled}
                      onChange={(_event, checked) => setDarkModeEnabled(checked)}
                    />
                    <p style={{ fontSize: '0.875rem', color: '#6A6E73', marginTop: '0.5rem' }}>
                      Use dark theme for the interface (coming soon)
                    </p>
                  </FormGroup>
                </Form>
              </div>
            </Tab>

            {/* API Configuration Tab */}
            <Tab eventKey={1} title={<TabTitleText><KeyIcon /> API Configuration</TabTitleText>}>
              <div style={{ padding: '1.5rem 0' }}>
                <Title headingLevel="h3" size="lg" style={{ marginBottom: '1rem' }}>
                  API Configuration
                </Title>
                <Form>
                  <FormGroup label="API Endpoint" fieldId="api-endpoint" isRequired>
                    <TextInput
                      id="api-endpoint"
                      value={apiEndpoint}
                      onChange={(_event, value) => setApiEndpoint(value)}
                      placeholder="http://localhost:8081"
                    />
                    <p style={{ fontSize: '0.875rem', color: '#6A6E73', marginTop: '0.5rem' }}>
                      Backend API server URL
                    </p>
                  </FormGroup>

                  <FormGroup label="API Key" fieldId="api-key">
                    <TextInput
                      id="api-key"
                      type="password"
                      value={apiKey}
                      onChange={(_event, value) => setApiKey(value)}
                      placeholder="Enter your API key"
                    />
                    <p style={{ fontSize: '0.875rem', color: '#6A6E73', marginTop: '0.5rem' }}>
                      Optional: For secured API endpoints
                    </p>
                  </FormGroup>

                  <FormGroup label="Default LLM Model" fieldId="default-model">
                    <Select
                      toggle={(toggleRef) => (
                        <MenuToggle
                          ref={toggleRef}
                          onClick={() => setModelSelectOpen(!modelSelectOpen)}
                          isExpanded={modelSelectOpen}
                        >
                          {selectedModel}
                        </MenuToggle>
                      )}
                      onSelect={(_event, selection) => {
                        setSelectedModel(selection as string);
                        setModelSelectOpen(false);
                      }}
                      selected={selectedModel}
                      isOpen={modelSelectOpen}
                      onOpenChange={(isOpen) => setModelSelectOpen(isOpen)}
                      aria-label="Select default model"
                    >
                      <SelectList>
                        {models.map((model, index) => (
                          <SelectOption key={index} value={model}>
                            {model}
                          </SelectOption>
                        ))}
                      </SelectList>
                    </Select>
                    <p style={{ fontSize: '0.875rem', color: '#6A6E73', marginTop: '0.5rem' }}>
                      Language model used for code generation
                    </p>
                  </FormGroup>

                  <Divider style={{ margin: '1.5rem 0' }} />

                  <Alert
                    variant="info"
                    title="Model Configuration"
                    isInline
                    style={{ marginTop: '1rem' }}
                  >
                    Different agents use specialized models. Meta Agent uses{' '}
                    <strong>deepseek-r1-distill-qwen-14b</strong> for planning, while Dev Crew uses{' '}
                    <strong>qwen3-14b</strong> for implementation.
                  </Alert>
                </Form>
              </div>
            </Tab>

            {/* Notifications Tab */}
            <Tab eventKey={2} title={<TabTitleText><BellIcon /> Notifications</TabTitleText>}>
              <div style={{ padding: '1.5rem 0' }}>
                <Title headingLevel="h3" size="lg" style={{ marginBottom: '1rem' }}>
                  Notification Preferences
                </Title>
                <Form>
                  <Title headingLevel="h4" size="md" style={{ marginBottom: '0.75rem', marginTop: '1rem' }}>
                    Notification Channels
                  </Title>

                  <FormGroup label="Email Notifications" fieldId="email-notif">
                    <Switch
                      id="email-notif"
                      label="Enabled"
                      labelOff="Disabled"
                      isChecked={emailNotifications}
                      onChange={(_event, checked) => setEmailNotifications(checked)}
                    />
                  </FormGroup>

                  <FormGroup label="Slack Notifications" fieldId="slack-notif">
                    <Switch
                      id="slack-notif"
                      label="Enabled"
                      labelOff="Disabled"
                      isChecked={slackNotifications}
                      onChange={(_event, checked) => setSlackNotifications(checked)}
                    />
                    {slackNotifications && (
                      <TextInput
                        style={{ marginTop: '0.5rem' }}
                        placeholder="Slack webhook URL"
                        aria-label="Slack webhook URL"
                      />
                    )}
                  </FormGroup>

                  <Divider style={{ margin: '1.5rem 0' }} />

                  <Title headingLevel="h4" size="md" style={{ marginBottom: '0.75rem' }}>
                    Event Notifications
                  </Title>

                  <FormGroup label="Job Completion" fieldId="job-completion">
                    <Switch
                      id="job-completion"
                      label="Notify on completion"
                      labelOff="Don't notify"
                      isChecked={jobCompletionNotif}
                      onChange={(_event, checked) => setJobCompletionNotif(checked)}
                    />
                  </FormGroup>

                  <FormGroup label="Errors and Failures" fieldId="error-notif">
                    <Switch
                      id="error-notif"
                      label="Notify on errors"
                      labelOff="Don't notify"
                      isChecked={errorNotif}
                      onChange={(_event, checked) => setErrorNotif(checked)}
                    />
                  </FormGroup>
                </Form>
              </div>
            </Tab>

            {/* Workflow Automation Tab */}
            <Tab eventKey={3} title={<TabTitleText><AutomationIcon /> Workflow</TabTitleText>}>
              <div style={{ padding: '1.5rem 0' }}>
                <Title headingLevel="h3" size="lg" style={{ marginBottom: '0.25rem' }}>
                  Workflow Automation
                </Title>
                <p style={{ color: '#6A6E73', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                  Control how much human oversight is applied during the AI planning process.
                </p>

                <Form>
                  <FormGroup
                    label={
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Auto-approve plans
                        {prefs.autoApprovePlan
                          ? <Label isCompact color="green">Active</Label>
                          : <Label isCompact color="grey">Off</Label>}
                      </span>
                    }
                    fieldId="auto-approve-plan"
                  >
                    <Switch
                      id="auto-approve-plan"
                      label="Coding starts automatically after planning"
                      labelOff="Pause for plan review before coding"
                      isChecked={prefs.autoApprovePlan}
                      onChange={(_e, checked) => setPrefs({ autoApprovePlan: checked })}
                    />
                    <div style={{
                      marginTop: '0.75rem', fontSize: '0.875rem', color: '#6A6E73',
                      background: prefs.autoApprovePlan ? '#F3FAF3' : '#F8F8F8',
                      border: `1px solid ${prefs.autoApprovePlan ? '#C8E6C9' : '#E0E0E0'}`,
                      borderRadius: '8px', padding: '0.75rem 1rem',
                    }}>
                      {prefs.autoApprovePlan ? (
                        <>
                          <strong style={{ color: '#3E8635' }}>Auto-approve is ON.</strong>
                          {' '}Jobs go straight to coding once planning completes — no review
                          pause. If a job enters review unexpectedly (e.g. from a JIRA trigger),
                          a 5-second countdown will auto-approve it in the browser.
                        </>
                      ) : (
                        <>
                          <strong>Manual review is ON.</strong>
                          {' '}After planning phases complete, every job pauses so you can
                          review the generated plan, provide feedback, and approve before
                          coding begins. This requires <code>plan_review.enabled: true</code>
                          {' '}in your server config, or the per-job "Review plan" checkbox
                          at job creation time.
                        </>
                      )}
                    </div>
                  </FormGroup>

                  <Divider style={{ margin: '1.5rem 0' }} />

                  <Alert
                    variant="info"
                    title="How it works"
                    isInline
                  >
                    <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem', fontSize: '0.875rem' }}>
                      <li>
                        When <strong>Auto-approve is ON</strong>, new jobs are submitted with
                        <code> auto_approve_plan: true</code>. The backend skips the review gate
                        entirely — the job never enters <em>pending_review</em>.
                      </li>
                      <li style={{ marginTop: '0.35rem' }}>
                        When <strong>Auto-approve is OFF</strong>, jobs pause for your review
                        (requires the server-side <code>plan_review.enabled</code> flag). You can
                        still override per job at creation time.
                      </li>
                      <li style={{ marginTop: '0.35rem' }}>
                        For <strong>JIRA-triggered epics</strong>, use the
                        <code> auto_approve_no_jira</code> server config for the equivalent
                        server-side auto-approve behaviour.
                      </li>
                    </ul>
                  </Alert>
                </Form>
              </div>
            </Tab>

            {/* Jira Integration Tab */}
            <Tab eventKey={4} title={<TabTitleText><LinkIcon /> Jira</TabTitleText>}>
              <div style={{ padding: '1.5rem 0', maxWidth: '640px' }}>
                <Title headingLevel="h3" size="lg" style={{ marginBottom: '0.5rem' }}>
                  Jira Integration
                </Title>
                <p style={{ color: '#6A6E73', marginBottom: '1.5rem' }}>
                  Connect your Atlassian Jira account. Your API token is encrypted at rest and never exposed in the UI.
                </p>

                {/* Connection status badge */}
                {jiraConfig !== null && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    {jiraConfig.configured ? (
                      <Label color="green" icon={<CheckCircleIcon />}>
                        Connected — {jiraConfig.jira_email} · updated {jiraConfig.updated_at?.slice(0, 10)}
                      </Label>
                    ) : (
                      <Label color="grey" icon={<TimesCircleIcon />}>Not connected</Label>
                    )}
                  </div>
                )}

                <Form>
                  <FormGroup label="Jira Base URL" fieldId="jira-base-url" isRequired>
                    <TextInput
                      id="jira-base-url"
                      value={jiraBaseUrl}
                      onChange={(_e, v) => setJiraBaseUrl(v)}
                      placeholder="https://your-org.atlassian.net"
                      type="url"
                    />
                    <p style={{ fontSize: '0.8125rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                      For Jira Cloud: <code>https://your-org.atlassian.net</code>. For Jira Server use your host URL.
                    </p>
                  </FormGroup>

                  <FormGroup label="Email" fieldId="jira-email" isRequired>
                    <TextInput
                      id="jira-email"
                      value={jiraEmail}
                      onChange={(_e, v) => setJiraEmail(v)}
                      placeholder="you@example.com"
                      type="email"
                    />
                  </FormGroup>

                  <FormGroup
                    label="API Token"
                    fieldId="jira-token"
                    isRequired={!jiraConfig?.configured}
                    helperText={jiraConfig?.configured
                      ? `Current token: ${jiraConfig.api_token_masked} — enter a new value to rotate`
                      : undefined}
                  >
                    <TextInput
                      id="jira-token"
                      value={jiraToken}
                      onChange={(_e, v) => setJiraToken(v)}
                      type="password"
                      placeholder={jiraConfig?.configured ? '••••••••  (leave blank to keep existing)' : 'Paste your API token'}
                      autoComplete="new-password"
                    />
                    <p style={{ fontSize: '0.8125rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                      Generate at: <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">
                        id.atlassian.com → API tokens
                      </a>
                    </p>
                  </FormGroup>
                </Form>

                {/* Status messages */}
                {jiraTestStatus && (
                  <Alert
                    variant={jiraTestStatus.ok ? 'success' : 'danger'}
                    title={jiraTestStatus.message}
                    isInline
                    style={{ marginTop: '1rem' }}
                  />
                )}
                {jiraSaveStatus && (
                  <Alert
                    variant={jiraSaveStatus.ok ? 'success' : 'danger'}
                    title={jiraSaveStatus.message}
                    isInline
                    style={{ marginTop: '1rem' }}
                  />
                )}

                <ActionList style={{ marginTop: '1.5rem' }}>
                  <ActionListItem>
                    <Button
                      variant="secondary"
                      onClick={handleJiraTest}
                      isDisabled={jiraLoading || !jiraBaseUrl || !jiraEmail || (!jiraToken && !jiraConfig?.configured)}
                    >
                      {jiraLoading ? <Spinner size="sm" /> : 'Test Connection'}
                    </Button>
                  </ActionListItem>
                  <ActionListItem>
                    <Button
                      variant="primary"
                      onClick={handleJiraSave}
                      isDisabled={jiraLoading || !jiraBaseUrl || !jiraEmail || (!jiraToken && !jiraConfig?.configured)}
                    >
                      {jiraLoading ? <Spinner size="sm" /> : (jiraConfig?.configured ? 'Update Credentials' : 'Save & Connect')}
                    </Button>
                  </ActionListItem>
                  {jiraConfig?.configured && (
                    <ActionListItem>
                      <Button variant="danger" onClick={handleJiraDisconnect} isDisabled={jiraLoading}>
                        Disconnect
                      </Button>
                    </ActionListItem>
                  )}
                </ActionList>
              </div>
            </Tab>

            {/* About Tab */}
            <Tab eventKey={5} title={<TabTitleText><UserIcon /> About</TabTitleText>}>
              <div style={{ padding: '1.5rem 0' }}>
                <Title headingLevel="h3" size="lg" style={{ marginBottom: '1rem' }}>
                  About AI Crew Studio
                </Title>

                <Grid hasGutter>
                  <GridItem span={6}>
                    <Card isFlat>
                      <CardHeader>
                        <CardTitle>Version Information</CardTitle>
                      </CardHeader>
                      <CardBody>
                        <Flex direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
                          <FlexItem>
                            <strong>Studio Version:</strong> 1.0.0
                          </FlexItem>
                          <FlexItem>
                            <strong>Backend API:</strong> v1.0.0
                          </FlexItem>
                          <FlexItem>
                            <strong>Database:</strong> SQLite (Persistent)
                          </FlexItem>
                          <FlexItem>
                            <strong>Build Date:</strong> 2026-02-06
                          </FlexItem>
                        </Flex>
                      </CardBody>
                    </Card>
                  </GridItem>

                  <GridItem span={6}>
                    <Card isFlat>
                      <CardHeader>
                        <CardTitle>System Resources</CardTitle>
                      </CardHeader>
                      <CardBody>
                        <Flex direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
                          <FlexItem>
                            <strong>Database Size:</strong> ~20KB
                          </FlexItem>
                          <FlexItem>
                            <strong>Active Agents:</strong> 6
                          </FlexItem>
                          <FlexItem>
                            <strong>Supported Models:</strong> 5+
                          </FlexItem>
                          <FlexItem>
                            <strong>Storage:</strong> File-based workspace
                          </FlexItem>
                        </Flex>
                      </CardBody>
                    </Card>
                  </GridItem>

                  <GridItem span={12}>
                    <Card isFlat style={{ marginTop: '1rem' }}>
                      <CardHeader>
                        <CardTitle>Documentation & Support</CardTitle>
                      </CardHeader>
                      <CardBody>
                        <Flex gap={{ default: 'gapMd' }}>
                          <FlexItem>
                            <Button variant="link" component="a" href="/README.md" target="_blank">
                              📚 Documentation
                            </Button>
                          </FlexItem>
                          <FlexItem>
                            <Button variant="link" component="a" href="/PERSISTENCE.md" target="_blank">
                              💾 Persistence Guide
                            </Button>
                          </FlexItem>
                          <FlexItem>
                            <Button variant="link" component="a" href="/TEST_REPORT.md" target="_blank">
                              ✅ Test Report
                            </Button>
                          </FlexItem>
                        </Flex>
                      </CardBody>
                    </Card>
                  </GridItem>
                </Grid>
              </div>
            </Tab>
          </Tabs>
        </CardBody>
      </Card>
    </>
  );
};

export default Settings;
