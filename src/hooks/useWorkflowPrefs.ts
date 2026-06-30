/**
 * useWorkflowPrefs — workflow preferences synced with backend /api/workflow/config.
 *
 * localStorage is used as a read-through cache so getWorkflowPrefs() works
 * synchronously in Landing and PlanReviewPanel before the API round-trip completes.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  getWorkflowConfig,
  saveWorkflowConfig,
  type WorkflowConfigInput,
} from '../api/client';

const STORAGE_KEY = 'crew_workflow_prefs_v2';

export interface WorkflowPrefs {
  autoApprovePlan: boolean;
  planReviewEnabled: boolean;
  solutioningEnabled: boolean;
  solutioningMaxPasses: number;
  solutioningMaxGithubSearches: number;
}

const DEFAULTS: WorkflowPrefs = {
  autoApprovePlan: false,
  planReviewEnabled: false,
  solutioningEnabled: false,
  solutioningMaxPasses: 3,
  solutioningMaxGithubSearches: 10,
};

function fromApi(cfg: Partial<WorkflowConfigInput> & { auto_approve_plan?: boolean }): WorkflowPrefs {
  return {
    autoApprovePlan: Boolean(cfg.auto_approve_plan),
    planReviewEnabled: Boolean(cfg.plan_review_enabled),
    solutioningEnabled: Boolean(cfg.solutioning_enabled),
    solutioningMaxPasses: cfg.solutioning_max_passes ?? DEFAULTS.solutioningMaxPasses,
    solutioningMaxGithubSearches: cfg.solutioning_max_github_searches ?? DEFAULTS.solutioningMaxGithubSearches,
  };
}

function toApi(prefs: WorkflowPrefs): WorkflowConfigInput {
  return {
    plan_review_enabled: prefs.planReviewEnabled,
    solutioning_enabled: prefs.solutioningEnabled,
    solutioning_max_passes: prefs.solutioningMaxPasses,
    solutioning_max_github_searches: prefs.solutioningMaxGithubSearches,
    auto_approve_plan: prefs.autoApprovePlan,
  };
}

function readCache(): WorkflowPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeCache(prefs: WorkflowPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

let fetchPromise: Promise<WorkflowPrefs> | null = null;

/** Fetch prefs from API once; updates localStorage cache. */
export function refreshWorkflowPrefsFromApi(): Promise<WorkflowPrefs> {
  if (!fetchPromise) {
    fetchPromise = getWorkflowConfig()
      .then((cfg) => {
        const prefs = fromApi(cfg);
        writeCache(prefs);
        return prefs;
      })
      .catch(() => readCache())
      .finally(() => {
        fetchPromise = null;
      });
  }
  return fetchPromise;
}

export function useWorkflowPrefs() {
  const [prefs, setPrefsState] = useState<WorkflowPrefs>(readCache);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    refreshWorkflowPrefsFromApi().then((next) => {
      if (!cancelled) {
        setPrefsState(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPrefs = useCallback((update: Partial<WorkflowPrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...update };
      writeCache(next);
      setSaveError(null);
      saveWorkflowConfig(toApi(next)).catch(() => {
        setSaveError('Failed to save workflow settings to server.');
      });
      return next;
    });
  }, []);

  const savePrefs = useCallback(async (next: WorkflowPrefs) => {
    writeCache(next);
    setPrefsState(next);
    setSaveError(null);
    try {
      await saveWorkflowConfig(toApi(next));
    } catch {
      setSaveError('Failed to save workflow settings to server.');
      throw new Error('save failed');
    }
  }, []);

  return { prefs, setPrefs, savePrefs, loading, saveError };
}

/** One-shot read from localStorage cache (updated after API fetch). */
export function getWorkflowPrefs(): WorkflowPrefs {
  return readCache();
}
