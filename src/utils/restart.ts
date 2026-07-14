/** Greenfield build jobs (not migration / refactor pipelines). */
export function isBuildJob(vision = ''): boolean {
  return !vision.startsWith('[MTA') && !vision.startsWith('[Refactor');
}

/** Jobs where retry_failed restart is meaningful (partial output exists). */
export function canRetryFailedTasks(status: string, vision = ''): boolean {
  return isBuildJob(vision) && (status === 'failed' || status === 'partially_completed');
}
