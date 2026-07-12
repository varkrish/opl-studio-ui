import React, { useState, useEffect, useCallback } from 'react';
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
  FormSelect,
  FormSelectOption,
  TextArea,
} from '@patternfly/react-core';
import { CogIcon, UserIcon, KeyIcon, BellIcon, AutomationIcon, LinkIcon, CheckCircleIcon, TimesCircleIcon, GithubIcon, CubeIcon } from '@patternfly/react-icons';
import { useWorkflowPrefs } from '../hooks/useWorkflowPrefs';
import {
  getJiraConfig, saveJiraConfig, deleteJiraConfig, testJiraConnection,
  getLlmConfig, saveLlmConfig, deleteLlmConfig, testLlmConnection, getLlmModels,
  getGithubConfig, saveGithubConfig, deleteGithubConfig, testGithubConnection,
  getMcpConfigs, saveMcpConfig, deleteMcpConfig
} from '../api/client';
import type { JiraConfig, LlmConfig, GitHubConfig, McpConfig } from '../api/client';

const Settings: React.FC = () => {
  const [activeTabKey, setActiveTabKey] = useState<string | number>(0);
  const [saved, setSaved] = useState(false);
  const { prefs, setPrefs, saveError: workflowSaveError, loading: workflowLoading } = useWorkflowPrefs();

  // GitHub configuration
  const [githubConfig, setGithubConfig] = useState<GitHubConfig | null>(null);
  const [githubToken, setGithubToken] = useState('');
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubTestStatus, setGithubTestStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [githubSaveStatus, setGithubSaveStatus] = useState<{ ok: boolean; message: string } | null>(null);

  // MCP configurations state
  const [mcpConfigs, setMcpConfigs] = useState<McpConfig[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpListLoading, setMcpListLoading] = useState(false);
  const [showMcpForm, setShowMcpForm] = useState(false);
  const [editingMcp, setEditingMcp] = useState<McpConfig | null>(null);

  const [mcpServerName, setMcpServerName] = useState('');
  const [mcpTargetAgent, setMcpTargetAgent] = useState('global');
  const [mcpTransportType, setMcpTransportType] = useState('stdio');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpArgs, setMcpArgs] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpEnv, setMcpEnv] = useState('{}');
  const [mcpTools, setMcpTools] = useState('');
  const [mcpSaveError, setMcpSaveError] = useState<string | null>(null);

  // General Settings
  const [workspacePath, setWorkspacePath] = useState('./workspace');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  // LLM API Settings
  const [llmConfig, setLlmConfig] = useState<LlmConfig | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState('https://openrouter.ai/api/v1');
  const [apiKey, setApiKey] = useState('');
  const [modelManager, setModelManager] = useState('deepseek/deepseek-r1-distill-qwen-14b');
  const [modelWorker, setModelWorker] = useState('deepseek/deepseek-r1-distill-qwen-14b');
  const [modelReviewer, setModelReviewer] = useState('deepseek/deepseek-r1-distill-qwen-14b');
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmTestStatus, setLlmTestStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [llmSaveStatus, setLlmSaveStatus] = useState<{ ok: boolean; message: string } | null>(null);

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

  const [modelSuggestions, setModelSuggestions] = useState<string[]>([
    'deepseek-r1-distill-qwen-14b',
  ]);

  const loadMcpConfigs = useCallback(() => {
    setMcpListLoading(true);
    getMcpConfigs()
      .then(setMcpConfigs)
      .catch(err => console.error("Failed to load MCP configs", err))
      .finally(() => setMcpListLoading(false));
  }, []);

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

    getLlmConfig()
      .then(cfg => {
        setLlmConfig(cfg);
        if (cfg.configured) {
          setApiBaseUrl(cfg.api_base_url || '');
          setModelManager(cfg.model_manager || '');
          setModelWorker(cfg.model_worker || '');
          setModelReviewer(cfg.model_reviewer || '');
          setApiKey(cfg.api_token_masked || '');
        }
      })
      .catch(() => {});

    getLlmModels()
      .then(res => {
        if (res.models && res.models.length > 0) {
          setModelSuggestions(res.models);
        }
      })
      .catch(() => {});

    getGithubConfig()
      .then(cfg => setGithubConfig(cfg))
      .catch(() => {});
    loadMcpConfigs();
  }, [loadMcpConfigs]);

  const handleAddMcpClick = () => {
    setEditingMcp(null);
    setMcpServerName('');
    setMcpTargetAgent('global');
    setMcpTransportType('stdio');
    setMcpCommand('');
    setMcpArgs('');
    setMcpUrl('');
    setMcpEnv('{}');
    setMcpTools('');
    setMcpSaveError(null);
    setShowMcpForm(true);
  };

  const handleEditMcpClick = (cfg: McpConfig) => {
    setEditingMcp(cfg);
    setMcpServerName(cfg.server_name);
    setMcpTargetAgent(cfg.target_agent);
    setMcpTransportType(cfg.transport_type);
    setMcpCommand(cfg.command || '');
    setMcpArgs((cfg.args || []).join(' '));
    setMcpUrl(cfg.url || '');
    setMcpEnv(JSON.stringify(cfg.env || {}, null, 2));
    setMcpTools((cfg.tools || []).join(', '));
    setMcpSaveError(null);
    setShowMcpForm(true);
  };

  const handleMcpSave = async () => {
    setMcpSaveError(null);
    if (!mcpServerName.trim()) {
      setMcpSaveError('Server name is required');
      return;
    }
    
    let parsedEnv: Record<string, string> = {};
    if (mcpEnv.trim()) {
      try {
        parsedEnv = JSON.parse(mcpEnv);
        if (typeof parsedEnv !== 'object' || Array.isArray(parsedEnv)) {
          setMcpSaveError('Environment variables must be a JSON object');
          return;
        }
      } catch {
        setMcpSaveError('Environment variables is not a valid JSON string');
        return;
      }
    }

    if (mcpTransportType === 'stdio' && !mcpCommand.trim()) {
      setMcpSaveError('Command is required for stdio transport');
      return;
    }

    if (mcpTransportType === 'sse' && !mcpUrl.trim()) {
      setMcpSaveError('Connection URL is required for sse transport');
      return;
    }

    const parsedArgs = mcpArgs.trim() ? mcpArgs.split(/\s+/) : [];
    const parsedTools = mcpTools.trim() ? mcpTools.split(',').map(t => t.trim()).filter(Boolean) : [];

    setMcpLoading(true);
    try {
      await saveMcpConfig({
        server_name: mcpServerName.trim(),
        target_agent: mcpTargetAgent,
        transport_type: mcpTransportType,
        command: mcpTransportType === 'stdio' ? mcpCommand.trim() : null,
        args: mcpTransportType === 'stdio' ? parsedArgs : [],
        url: mcpTransportType === 'sse' ? mcpUrl.trim() : null,
        env: parsedEnv,
        tools: parsedTools,
      });
      setShowMcpForm(false);
      loadMcpConfigs();
    } catch {
      setMcpSaveError('Failed to save MCP configuration.');
    } finally {
      setMcpLoading(false);
    }
  };

  const handleMcpDelete = async (serverName: string) => {
    if (!window.confirm(`Are you sure you want to delete MCP server "${serverName}"?`)) {
      return;
    }
    setMcpLoading(true);
    try {
      await deleteMcpConfig(serverName);
      loadMcpConfigs();
    } catch {
      alert(`Failed to delete MCP server "${serverName}".`);
    } finally {
      setMcpLoading(false);
    }
  };

  const handleLlmTest = async () => {
    setLlmTestStatus(null);
    setLlmLoading(true);
    try {
      const result = await testLlmConnection({
        api_base_url: apiBaseUrl,
        api_key: apiKey,
        model_manager: modelManager,
        model_worker: modelWorker,
        model_reviewer: modelReviewer,
      });
      setLlmTestStatus(result.ok
        ? { ok: true, message: result.message || 'Connection successful' }
        : { ok: false, message: result.error || result.message || 'Connection failed' }
      );
    } catch {
      setLlmTestStatus({ ok: false, message: 'Request failed — check the console' });
    } finally {
      setLlmLoading(false);
    }
  };

  const handleLlmSave = async () => {
    setLlmSaveStatus(null);
    setLlmLoading(true);
    try {
      await saveLlmConfig({
        api_base_url: apiBaseUrl,
        api_key: apiKey,
        model_manager: modelManager,
        model_worker: modelWorker,
        model_reviewer: modelReviewer,
      });
      const cfg = await getLlmConfig();
      setLlmConfig(cfg);
      setApiKey('');
      setLlmSaveStatus({ ok: true, message: 'LLM credentials saved.' });
    } catch {
      setLlmSaveStatus({ ok: false, message: 'Failed to save credentials.' });
    } finally {
      setLlmLoading(false);
    }
  };

  const handleLlmDisconnect = async () => {
    setLlmLoading(true);
    try {
      await deleteLlmConfig();
      setLlmConfig({ configured: false });
      setApiBaseUrl('https://openrouter.ai/api/v1');
      setApiKey('');
      setModelManager('deepseek/deepseek-r1-distill-qwen-14b');
      setModelWorker('deepseek/deepseek-r1-distill-qwen-14b');
      setModelReviewer('deepseek/deepseek-r1-distill-qwen-14b');
      setLlmTestStatus(null);
      setLlmSaveStatus(null);
    } catch {
      setLlmSaveStatus({ ok: false, message: 'Failed to remove credentials.' });
    } finally {
      setLlmLoading(false);
    }
  };


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

  const handleGithubTest = async () => {
    setGithubTestStatus(null);
    setGithubLoading(true);
    try {
      const result = await testGithubConnection({ api_token: githubToken });
      setGithubTestStatus(result.ok
        ? { ok: true, message: `Connected as ${result.login || result.name || 'GitHub user'}` }
        : { ok: false, message: result.error || 'Connection failed' }
      );
    } catch {
      setGithubTestStatus({ ok: false, message: 'Request failed — check the console' });
    } finally {
      setGithubLoading(false);
    }
  };

  const handleGithubSave = async () => {
    setGithubSaveStatus(null);
    setGithubLoading(true);
    try {
      await saveGithubConfig({ api_token: githubToken });
      const cfg = await getGithubConfig();
      setGithubConfig(cfg);
      setGithubToken('');
      setGithubSaveStatus({ ok: true, message: 'GitHub token saved.' });
    } catch {
      setGithubSaveStatus({ ok: false, message: 'Failed to save token.' });
    } finally {
      setGithubLoading(false);
    }
  };

  const handleGithubDisconnect = async () => {
    setGithubLoading(true);
    try {
      await deleteGithubConfig();
      setGithubConfig({ configured: false });
      setGithubToken('');
      setGithubTestStatus(null);
      setGithubSaveStatus(null);
    } catch {
      setGithubSaveStatus({ ok: false, message: 'Failed to remove token.' });
    } finally {
      setGithubLoading(false);
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
              <div style={{ padding: '1.5rem 0', maxWidth: '640px' }}>
                <Title headingLevel="h3" size="lg" style={{ marginBottom: '0.5rem' }}>
                  LLM API Configuration
                </Title>
                <p style={{ color: '#6A6E73', marginBottom: '1.5rem' }}>
                  Connect to your preferred LLM provider. Your API key is encrypted at rest and never exposed in the UI.
                </p>

                {/* Connection status badge */}
                {llmConfig !== null && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    {llmConfig.configured ? (
                      <Label color="green" icon={<CheckCircleIcon />}>
                        Connected — {llmConfig.api_base_url} · updated {llmConfig.updated_at?.slice(0, 10)}
                      </Label>
                    ) : (
                      <Label color="grey" icon={<TimesCircleIcon />}>Not connected (Using backend default config.yaml)</Label>
                    )}
                  </div>
                )}

                <datalist id="model-suggestions">
                  {modelSuggestions.map(model => (
                    <option key={model} value={model} />
                  ))}
                </datalist>

                <Form>
                  <FormGroup label="API Base URL (Provider)" fieldId="api-endpoint" isRequired>
                    <TextInput
                      id="api-endpoint"
                      value={apiBaseUrl}
                      onChange={(_event, value) => setApiBaseUrl(value)}
                      placeholder="https://api.openai.com/v1"
                    />
                    <p style={{ fontSize: '0.8125rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                      Example: <code>https://openrouter.ai/api/v1</code> or <code>http://localhost:11434/v1</code>
                    </p>
                  </FormGroup>

                  <FormGroup
                    label="API Key"
                    fieldId="api-key"
                    isRequired={!llmConfig?.configured}
                  >
                    <TextInput
                      id="api-key"
                      type="password"
                      value={apiKey}
                      onChange={(_event, value) => setApiKey(value)}
                      placeholder={llmConfig?.configured ? '••••••••  (leave blank to keep existing)' : 'Enter your API key'}
                      autoComplete="new-password"
                    />
                    {llmConfig?.configured && (
                      <p style={{ fontSize: '0.8125rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                        Current token: {llmConfig.api_token_masked} — enter a new value to rotate
                      </p>
                    )}
                  </FormGroup>

                  <FormGroup label="Manager Model" fieldId="model-manager">
                    <TextInput
                      id="model-manager"
                      value={modelManager}
                      onChange={(_event, value) => setModelManager(value)}
                      list="model-suggestions"
                      placeholder="Select or type model..."
                    />
                    <p style={{ fontSize: '0.8125rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                      Used by the Meta Agent for complex planning and orchestration.
                    </p>
                  </FormGroup>

                  <FormGroup label="Worker Model" fieldId="model-worker">
                    <TextInput
                      id="model-worker"
                      value={modelWorker}
                      onChange={(_event, value) => setModelWorker(value)}
                      list="model-suggestions"
                      placeholder="Select or type model..."
                    />
                    <p style={{ fontSize: '0.8125rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                      Used by the Dev Crew for writing implementations.
                    </p>
                  </FormGroup>

                  <FormGroup label="Reviewer Model" fieldId="model-reviewer">
                    <TextInput
                      id="model-reviewer"
                      value={modelReviewer}
                      onChange={(_event, value) => setModelReviewer(value)}
                      list="model-suggestions"
                      placeholder="Select or type model..."
                    />
                    <p style={{ fontSize: '0.8125rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                      Used by Code Reviewers to analyze and critique code.
                    </p>
                  </FormGroup>
                </Form>

                {/* Status messages */}
                {llmTestStatus && (
                  <Alert
                    variant={llmTestStatus.ok ? 'success' : 'danger'}
                    title={llmTestStatus.message}
                    isInline
                    style={{ marginTop: '1rem' }}
                  />
                )}
                {llmSaveStatus && (
                  <Alert
                    variant={llmSaveStatus.ok ? 'success' : 'danger'}
                    title={llmSaveStatus.message}
                    isInline
                    style={{ marginTop: '1rem' }}
                  />
                )}

                <ActionList style={{ marginTop: '1.5rem' }}>
                  <ActionListItem>
                    <Button
                      variant="secondary"
                      onClick={handleLlmTest}
                      isDisabled={llmLoading || !apiBaseUrl || (!apiKey && !llmConfig?.configured)}
                    >
                      {llmLoading ? <Spinner size="sm" /> : 'Test Connection'}
                    </Button>
                  </ActionListItem>
                  <ActionListItem>
                    <Button
                      variant="primary"
                      onClick={handleLlmSave}
                      isDisabled={llmLoading || !apiBaseUrl || (!apiKey && !llmConfig?.configured)}
                    >
                      {llmLoading ? <Spinner size="sm" /> : (llmConfig?.configured ? 'Update Configuration' : 'Save & Connect')}
                    </Button>
                  </ActionListItem>
                  {llmConfig?.configured && (
                    <ActionListItem>
                      <Button variant="danger" onClick={handleLlmDisconnect} isDisabled={llmLoading}>
                        Disconnect
                      </Button>
                    </ActionListItem>
                  )}
                </ActionList>
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
              <div style={{ padding: '1.5rem 0', maxWidth: '720px' }}>
                <Title headingLevel="h3" size="lg" style={{ marginBottom: '0.25rem' }}>
                  Workflow Automation
                </Title>
                <p style={{ color: '#6A6E73', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                  Control solutioning, plan review, and auto-approve behaviour. Settings are saved to your account and apply to new jobs.
                </p>

                {workflowSaveError && (
                  <Alert variant="warning" title={workflowSaveError} isInline style={{ marginBottom: '1rem' }} />
                )}

                <Form>
                  <FormGroup
                    label={
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Solutioning loop
                        {prefs.solutioningEnabled
                          ? <Label isCompact color="green">Active</Label>
                          : <Label isCompact color="grey">Off</Label>}
                      </span>
                    }
                    fieldId="solutioning-enabled"
                  >
                    <Switch
                      id="solutioning-enabled"
                      label="Research + architect + critique before planning"
                      labelOff="Skip solutioning (go straight to Product Owner)"
                      isChecked={prefs.solutioningEnabled}
                      isDisabled={workflowLoading}
                      onChange={(_e, checked) => setPrefs({ solutioningEnabled: checked })}
                    />
                    <p style={{ fontSize: '0.8125rem', color: '#6A6E73', marginTop: '0.5rem' }}>
                      When enabled, the crew searches GitHub and skills for reference implementations, writes a solution spec, and pauses for your review before user stories.
                    </p>
                  </FormGroup>

                  {prefs.solutioningEnabled && (
                    <>
                      <FormGroup label="Solutioning max passes" fieldId="solutioning-max-passes">
                        <TextInput
                          id="solutioning-max-passes"
                          type="number"
                          value={String(prefs.solutioningMaxPasses)}
                          min={1}
                          max={5}
                          onChange={(_e, v) => setPrefs({ solutioningMaxPasses: Math.max(1, Math.min(5, parseInt(v, 10) || 3)) })}
                          style={{ maxWidth: '120px' }}
                        />
                      </FormGroup>
                      <FormGroup label="Max GitHub searches per job" fieldId="solutioning-max-github">
                        <TextInput
                          id="solutioning-max-github"
                          type="number"
                          value={String(prefs.solutioningMaxGithubSearches)}
                          min={1}
                          max={50}
                          onChange={(_e, v) => setPrefs({ solutioningMaxGithubSearches: Math.max(1, Math.min(50, parseInt(v, 10) || 10)) })}
                          style={{ maxWidth: '120px' }}
                        />
                      </FormGroup>
                    </>
                  )}

                  <Divider style={{ margin: '1.5rem 0' }} />

                  <FormGroup
                    label={
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Code intelligence (TLDR)
                        {prefs.tldrEnabled
                          ? <Label isCompact color="green">Active</Label>
                          : <Label isCompact color="grey">Off</Label>}
                      </span>
                    }
                    fieldId="tldr-enabled"
                  >
                    <Switch
                      id="tldr-enabled"
                      label="Use TLDR for codebase structure and search"
                      labelOff="Disable TLDR code intelligence"
                      isChecked={prefs.tldrEnabled}
                      isDisabled={workflowLoading}
                      onChange={(_e, checked) => setPrefs({ tldrEnabled: checked })}
                    />
                    <p style={{ fontSize: '0.8125rem', color: '#6A6E73', marginTop: '0.5rem' }}>
                      When enabled, simple-mode file generation prefetches TLDR context into prompts; ReAct agents get TLDR search tools.
                    </p>
                  </FormGroup>

                  {prefs.tldrEnabled && (
                    <>
                      <FormGroup label="Max TLDR context chars" fieldId="tldr-max-chars">
                        <TextInput
                          id="tldr-max-chars"
                          type="number"
                          value={String(prefs.tldrMaxChars)}
                          min={500}
                          max={50000}
                          onChange={(_e, v) => setPrefs({ tldrMaxChars: Math.max(500, Math.min(50000, parseInt(v, 10) || 6000)) })}
                          style={{ maxWidth: '120px' }}
                        />
                      </FormGroup>
                      <FormGroup
                        label="Include codebase structure"
                        fieldId="tldr-include-structure"
                      >
                        <Switch
                          id="tldr-include-structure"
                          label="Inject tldr structure (cached per job)"
                          labelOff="Skip structure section"
                          isChecked={prefs.tldrIncludeStructure}
                          isDisabled={workflowLoading}
                          onChange={(_e, checked) => setPrefs({ tldrIncludeStructure: checked })}
                        />
                      </FormGroup>
                      <FormGroup label="Min completed files before TLDR" fieldId="tldr-min-completed">
                        <TextInput
                          id="tldr-min-completed"
                          type="number"
                          value={String(prefs.tldrMinCompletedFiles)}
                          min={0}
                          max={100}
                          onChange={(_e, v) => setPrefs({ tldrMinCompletedFiles: Math.max(0, Math.min(100, parseInt(v, 10) || 1)) })}
                          style={{ maxWidth: '120px' }}
                        />
                      </FormGroup>
                    </>
                  )}

                  <Divider style={{ margin: '1.5rem 0' }} />

                  <FormGroup
                    label="Parallel file workers"
                    fieldId="parallel-file-workers"
                  >
                    <TextInput
                      id="parallel-file-workers"
                      type="number"
                      value={String(prefs.parallelFileWorkers)}
                      min={1}
                      max={10}
                      isDisabled={workflowLoading}
                      onChange={(_e, v) => setPrefs({ parallelFileWorkers: Math.max(1, Math.min(10, parseInt(v, 10) || 2)) })}
                      style={{ maxWidth: '120px' }}
                    />
                    <p style={{ fontSize: '0.8125rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                      Number of concurrent LLM threads generating files during development. Lower values reduce load on rate-limited endpoints (default: 2).
                    </p>
                  </FormGroup>

                  <Divider style={{ margin: '1.5rem 0' }} />

                  <FormGroup
                    label={
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Plan review gate
                        {prefs.planReviewEnabled
                          ? <Label isCompact color="green">Active</Label>
                          : <Label isCompact color="grey">Off</Label>}
                      </span>
                    }
                    fieldId="plan-review-enabled"
                  >
                    <Switch
                      id="plan-review-enabled"
                      label="Pause after planning for human review"
                      labelOff="Skip plan review gate"
                      isChecked={prefs.planReviewEnabled}
                      isDisabled={workflowLoading}
                      onChange={(_e, checked) => setPrefs({ planReviewEnabled: checked })}
                    />
                    <p style={{ fontSize: '0.8125rem', color: '#6A6E73', marginTop: '0.5rem' }}>
                      When enabled, jobs pause after Product Owner, Designer, and Tech Architect complete so you can review the plan before coding starts.
                    </p>
                  </FormGroup>

                  <Divider style={{ margin: '1.5rem 0' }} />

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
                      isDisabled={workflowLoading}
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
                          {' '}New jobs skip the plan review pause and go straight to development once planning completes.
                        </>
                      ) : (
                        <>
                          <strong>Manual review is ON.</strong>
                          {' '}New jobs pause for plan review when the plan review gate is enabled above.
                        </>
                      )}
                    </div>
                  </FormGroup>

                  <Alert variant="info" title="How it works" isInline style={{ marginTop: '1.5rem' }}>
                    <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem', fontSize: '0.875rem' }}>
                      <li>Settings sync to the server — no <code>config.yaml</code> edit required.</li>
                      <li>Solutioning runs before Product Owner when enabled; plan review runs after Tech Architect when enabled.</li>
                      <li>Per-job overrides at job creation still apply for auto-approve.</li>
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
                  >
                    <TextInput
                      id="jira-token"
                      value={jiraToken}
                      onChange={(_e, v) => setJiraToken(v)}
                      type="password"
                      placeholder={jiraConfig?.configured ? '••••••••  (leave blank to keep existing)' : 'Paste your API token'}
                      autoComplete="new-password"
                    />
                    {jiraConfig?.configured && (
                      <p style={{ fontSize: '0.8125rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                        Current token: {jiraConfig.api_token_masked} — enter a new value to rotate
                      </p>
                    )}
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

            {/* GitHub Integration Tab */}
            <Tab eventKey={5} title={<TabTitleText><GithubIcon /> GitHub</TabTitleText>}>
              <div style={{ padding: '1.5rem 0', maxWidth: '640px' }}>
                <Title headingLevel="h3" size="lg" style={{ marginBottom: '0.5rem' }}>
                  GitHub Integration
                </Title>
                <p style={{ color: '#6A6E73', marginBottom: '1.5rem' }}>
                  Connect a GitHub personal access token. Used for: cloning and pulling private repos,
                  solutioning research, pushing generated code, opening pull requests, and auto-creating
                  repos for new projects. Your token is encrypted at rest.
                </p>

                {githubConfig !== null && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    {githubConfig.configured ? (
                      <Label color="green" icon={<CheckCircleIcon />}>
                        Connected — {githubConfig.github_username || 'GitHub user'} · updated {githubConfig.updated_at?.slice(0, 10)}
                      </Label>
                    ) : (
                      <Label color="grey" icon={<TimesCircleIcon />}>Not connected</Label>
                    )}
                  </div>
                )}

                <Form>
                  <FormGroup
                    label="Personal Access Token"
                    fieldId="github-token"
                    isRequired={!githubConfig?.configured}
                  >
                    <TextInput
                      id="github-token"
                      value={githubToken}
                      onChange={(_e, v) => setGithubToken(v)}
                      type="password"
                      placeholder={githubConfig?.configured ? '••••••••  (leave blank to keep existing)' : 'ghp_…'}
                      autoComplete="new-password"
                    />
                    {githubConfig?.configured && (
                      <p style={{ fontSize: '0.8125rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                        Current token: {githubConfig.api_token_masked}
                      </p>
                    )}
                    <p style={{ fontSize: '0.8125rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                      Create at: <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">github.com/settings/tokens</a> — needs the <code>repo</code> scope
                      (read/write) to clone private repos, push commits, open PRs, and create new repositories on your behalf.
                    </p>
                  </FormGroup>
                </Form>

                {githubTestStatus && (
                  <Alert variant={githubTestStatus.ok ? 'success' : 'danger'} title={githubTestStatus.message} isInline style={{ marginTop: '1rem' }} />
                )}
                {githubSaveStatus && (
                  <Alert variant={githubSaveStatus.ok ? 'success' : 'danger'} title={githubSaveStatus.message} isInline style={{ marginTop: '1rem' }} />
                )}

                <ActionList style={{ marginTop: '1.5rem' }}>
                  <ActionListItem>
                    <Button variant="secondary" onClick={handleGithubTest} isDisabled={githubLoading || !githubToken}>
                      {githubLoading ? <Spinner size="sm" /> : 'Test Connection'}
                    </Button>
                  </ActionListItem>
                  <ActionListItem>
                    <Button variant="primary" onClick={handleGithubSave} isDisabled={githubLoading || !githubToken}>
                      {githubLoading ? <Spinner size="sm" /> : (githubConfig?.configured ? 'Update Token' : 'Save & Connect')}
                    </Button>
                  </ActionListItem>
                  {githubConfig?.configured && (
                    <ActionListItem>
                      <Button variant="danger" onClick={handleGithubDisconnect} isDisabled={githubLoading}>
                        Disconnect
                      </Button>
                    </ActionListItem>
                  )}
                </ActionList>
              </div>
            </Tab>

            {/* MCP Integrations Tab */}
            <Tab eventKey={7} title={<TabTitleText><CubeIcon /> MCP Integrations</TabTitleText>}>
              <div style={{ padding: '1.5rem 0' }}>
                <Split style={{ marginBottom: '1.5rem' }}>
                  <SplitItem isFilled>
                    <Title headingLevel="h3" size="lg">
                      Model Context Protocol (MCP) Servers
                    </Title>
                    <p style={{ fontSize: '0.875rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                      Connect external agent tools dynamically. By default, these servers are available to all agents.
                    </p>
                  </SplitItem>
                  {!showMcpForm && (
                    <SplitItem>
                      <Button variant="primary" onClick={handleAddMcpClick}>
                        Add Integration
                      </Button>
                    </SplitItem>
                  )}
                </Split>

                {showMcpForm ? (
                  <Card isFlat style={{ border: '1px solid #D2D2D2', padding: '1.5rem' }}>
                    <CardHeader style={{ paddingBottom: '1rem' }}>
                      <Title headingLevel="h4" size="md">
                        {editingMcp ? `Edit MCP Server: ${mcpServerName}` : 'Add New MCP Integration'}
                      </Title>
                    </CardHeader>
                    <CardBody>
                      <Form style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {mcpSaveError && (
                          <Alert variant="danger" title={mcpSaveError} isInline />
                        )}

                        <Grid hasGutter>
                          <GridItem span={6}>
                            <FormGroup label="Server Name" fieldId="mcp-name" isRequired>
                              <TextInput
                                id="mcp-name"
                                isRequired
                                value={mcpServerName}
                                onChange={(_event, value) => setMcpServerName(value)}
                                placeholder="e.g. graphrag-codebase"
                                isDisabled={!!editingMcp}
                              />
                              <p style={{ fontSize: '0.75rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                                A unique identifier for the MCP server.
                              </p>
                            </FormGroup>
                          </GridItem>

                          <GridItem span={6}>
                            <FormGroup label="Target Agent" fieldId="mcp-agent">
                              <FormSelect
                                value={mcpTargetAgent}
                                onChange={(_event, value) => setMcpTargetAgent(value)}
                                id="mcp-agent"
                              >
                                <FormSelectOption value="global" label="Global (All Agents)" />
                                <FormSelectOption value="developer" label="Developer Agent" />
                                <FormSelectOption value="devops" label="DevOps Agent" />
                                <FormSelectOption value="frontend" label="Frontend Agent" />
                                <FormSelectOption value="tech_architect" label="Tech Architect" />
                                <FormSelectOption value="product_owner" label="Product Owner" />
                                <FormSelectOption value="test_agent" label="Test Agent" />
                              </FormSelect>
                              <p style={{ fontSize: '0.75rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                                Which agent role can invoke this server's tools.
                              </p>
                            </FormGroup>
                          </GridItem>

                          <GridItem span={12}>
                            <FormGroup label="Transport Type" fieldId="mcp-transport" isRequired>
                              <FormSelect
                                value={mcpTransportType}
                                onChange={(_event, value) => setMcpTransportType(value)}
                                id="mcp-transport"
                              >
                                <FormSelectOption value="stdio" label="Stdio (Spawn local command/process)" />
                                <FormSelectOption value="sse" label="SSE (Connect to remote HTTP stream server)" />
                              </FormSelect>
                            </FormGroup>
                          </GridItem>

                          {mcpTransportType === 'stdio' ? (
                            <>
                              <GridItem span={4}>
                                <FormGroup label="Command" fieldId="mcp-command" isRequired>
                                  <TextInput
                                    id="mcp-command"
                                    value={mcpCommand}
                                    onChange={(_event, value) => setMcpCommand(value)}
                                    placeholder="e.g. python, uv, node, docker"
                                  />
                                </FormGroup>
                              </GridItem>
                              <GridItem span={8}>
                                <FormGroup label="Arguments" fieldId="mcp-args">
                                  <TextInput
                                    id="mcp-args"
                                    value={mcpArgs}
                                    onChange={(_event, value) => setMcpArgs(value)}
                                    placeholder="e.g. -m crew_jira_connector.server"
                                  />
                                  <p style={{ fontSize: '0.75rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                                    Space-separated arguments passed to the command.
                                  </p>
                                </FormGroup>
                              </GridItem>
                            </>
                          ) : (
                            <GridItem span={12}>
                              <FormGroup label="SSE URL" fieldId="mcp-url" isRequired>
                                <TextInput
                                  id="mcp-url"
                                  value={mcpUrl}
                                  onChange={(_event, value) => setMcpUrl(value)}
                                  placeholder="e.g. http://localhost:5001/sse"
                                />
                              </FormGroup>
                            </GridItem>
                          )}

                          <GridItem span={12}>
                            <FormGroup label="Environment Variables (JSON Object)" fieldId="mcp-env">
                              <TextArea
                                id="mcp-env"
                                value={mcpEnv}
                                onChange={(_event, value) => setMcpEnv(value)}
                                rows={4}
                                placeholder='{"API_KEY": "secret_value"}'
                                style={{ fontFamily: 'monospace' }}
                              />
                            </FormGroup>
                          </GridItem>

                          <GridItem span={12}>
                            <FormGroup label="Allowed Tools Whitelist (Optional)" fieldId="mcp-tools">
                              <TextInput
                                id="mcp-tools"
                                value={mcpTools}
                                onChange={(_event, value) => setMcpTools(value)}
                                placeholder="e.g. get_tickets, create_branch (leave empty for all)"
                              />
                              <p style={{ fontSize: '0.75rem', color: '#6A6E73', marginTop: '0.25rem' }}>
                                Comma-separated list of tool names to import (empty imports all tools).
                              </p>
                            </FormGroup>
                          </GridItem>
                        </Grid>

                        <ActionList style={{ marginTop: '1rem' }}>
                          <ActionListItem>
                            <Button variant="primary" onClick={handleMcpSave} isDisabled={mcpLoading}>
                              {mcpLoading ? <Spinner size="sm" /> : 'Save Integration'}
                            </Button>
                          </ActionListItem>
                          <ActionListItem>
                            <Button variant="link" onClick={() => setShowMcpForm(false)} isDisabled={mcpLoading}>
                              Cancel
                            </Button>
                          </ActionListItem>
                        </ActionList>
                      </Form>
                    </CardBody>
                  </Card>
                ) : (
                  <div>
                    {mcpListLoading ? (
                      <div style={{ textAlign: 'center', padding: '3rem' }}>
                        <Spinner size="lg" />
                        <p style={{ marginTop: '1rem' }}>Loading MCP Servers...</p>
                      </div>
                    ) : mcpConfigs.length === 0 ? (
                      <Card isFlat style={{ border: '1px dashed #D2D2D2', backgroundColor: '#F8F9FA' }}>
                        <CardBody style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                          <CubeIcon style={{ fontSize: '3rem', color: '#6A6E73', marginBottom: '1rem' }} />
                          <Title headingLevel="h4" size="md">
                            No Dynamic MCP Servers Configured
                          </Title>
                          <p style={{ color: '#6A6E73', marginTop: '0.5rem', marginBottom: '1.5rem', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
                            Configure local stdio tools or remote SSE endpoints to give your agents extra capabilities (e.g. Neo4j graph traversal, Jira access, custom dev tools).
                          </p>
                          <Button variant="secondary" onClick={handleAddMcpClick}>
                            Add Your First Integration
                          </Button>
                        </CardBody>
                      </Card>
                    ) : (
                      <Grid hasGutter>
                        {mcpConfigs.map((cfg) => (
                          <GridItem span={6} key={cfg.server_name}>
                            <Card isFlat style={{ border: '1px solid #D2D2D2', height: '100%', display: 'flex', flexDirection: 'column' }}>
                              <CardHeader style={{ paddingBottom: '0.5rem' }}>
                                <Split hasGutter style={{ width: '100%', alignItems: 'center' }}>
                                  <SplitItem isFilled>
                                    <Title headingLevel="h4" size="md" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      <CubeIcon style={{ color: '#0066CC' }} /> {cfg.server_name}
                                    </Title>
                                  </SplitItem>
                                  <SplitItem>
                                    <Label color={cfg.target_agent === 'global' ? 'blue' : 'green'}>
                                      {cfg.target_agent === 'global' ? 'Global' : `Agent: ${cfg.target_agent}`}
                                    </Label>
                                  </SplitItem>
                                  <SplitItem>
                                    <Label color={cfg.transport_type === 'stdio' ? 'orange' : 'purple'}>
                                      {cfg.transport_type === 'stdio' ? 'Stdio' : 'SSE'}
                                    </Label>
                                  </SplitItem>
                                </Split>
                              </CardHeader>
                              <CardBody style={{ flexGrow: 1, paddingBottom: '1rem' }}>
                                <Flex direction={{ default: 'column' }} gap={{ default: 'gapXs' }} style={{ fontSize: '0.875rem' }}>
                                  {cfg.transport_type === 'stdio' ? (
                                    <>
                                      <FlexItem>
                                        <strong>Command:</strong> <code style={{ backgroundColor: '#F0F0F0', padding: '0.125rem 0.25rem', borderRadius: '3px' }}>{cfg.command}</code>
                                      </FlexItem>
                                      {cfg.args && cfg.args.length > 0 && (
                                        <FlexItem>
                                          <strong>Args:</strong> <code style={{ backgroundColor: '#F0F0F0', padding: '0.125rem 0.25rem', borderRadius: '3px' }}>{cfg.args.join(' ')}</code>
                                        </FlexItem>
                                      )}
                                    </>
                                  ) : (
                                    <FlexItem style={{ wordBreak: 'break-all' }}>
                                      <strong>URL:</strong> <a href={cfg.url || '#'} target="_blank" rel="noreferrer">{cfg.url}</a>
                                    </FlexItem>
                                  )}
                                  <FlexItem>
                                    <strong>Env vars:</strong> {Object.keys(cfg.env || {}).length > 0 ? `${Object.keys(cfg.env).length} configured` : 'None'}
                                  </FlexItem>
                                  <FlexItem>
                                    <strong>Tools:</strong> {cfg.tools && cfg.tools.length > 0 ? cfg.tools.join(', ') : 'All tools imported'}
                                  </FlexItem>
                                </Flex>
                              </CardBody>
                              <CardBody style={{ paddingTop: 0 }}>
                                <Divider style={{ marginBottom: '0.75rem' }} />
                                <ActionList>
                                  <ActionListItem>
                                    <Button variant="secondary" size="sm" onClick={() => handleEditMcpClick(cfg)}>
                                      Edit
                                    </Button>
                                  </ActionListItem>
                                  <ActionListItem>
                                    <Button variant="danger" size="sm" onClick={() => handleMcpDelete(cfg.server_name)} isDisabled={mcpLoading}>
                                      Delete
                                    </Button>
                                  </ActionListItem>
                                </ActionList>
                              </CardBody>
                            </Card>
                          </GridItem>
                        ))}
                      </Grid>
                    )}
                  </div>
                )}
              </div>
            </Tab>

            {/* About Tab */}
            <Tab eventKey={6} title={<TabTitleText><UserIcon /> About</TabTitleText>}>
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
