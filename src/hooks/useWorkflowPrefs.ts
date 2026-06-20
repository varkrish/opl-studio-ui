/**
 * useWorkflowPrefs — persists user workflow preferences in localStorage.
 *
 * Currently tracks:
 *   autoApprovePlan  – skip the plan review gate and go straight to coding
 *
 * All values default to false (manual review) so the first-run experience
 * is always explicit, not automatic.
 */
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'crew_workflow_prefs_v1';

export interface WorkflowPrefs {
  /** When true: jobs skip the plan review gate and coding starts immediately. */
  autoApprovePlan: boolean;
}

const DEFAULTS: WorkflowPrefs = {
  autoApprovePlan: false,
};

function readPrefs(): WorkflowPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function writePrefs(prefs: WorkflowPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota/security errors */
  }
}

export function useWorkflowPrefs() {
  const [prefs, setPrefsState] = useState<WorkflowPrefs>(readPrefs);

  const setPrefs = useCallback((update: Partial<WorkflowPrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...update };
      writePrefs(next);
      return next;
    });
  }, []);

  return { prefs, setPrefs };
}

/** One-shot read — use outside React components (e.g. in API call helpers). */
export function getWorkflowPrefs(): WorkflowPrefs {
  return readPrefs();
}
