import type { GranularTask, KanbanColumn, Task } from '../types';

/** Map granular task status to kanban column id */
function columnForStatus(status: string): string {
  switch (status) {
    case 'in_progress':
      return 'in-progress';
    case 'completed':
    case 'skipped':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'todo';
  }
}

/** Convert granular tasks to pseudo-Task shape for shared kanban rendering */
export function granularToDisplayTask(t: GranularTask): Task & { filePath?: string; error?: string; phase: string } {
  const filePath =
    (t.metadata?.file_path as string | undefined) ??
    (t.metadata?.path as string | undefined) ??
    (t.task_type === 'file' ? t.description : undefined);

  return {
    task_id: t.task_id,
    phase: t.phase,
    task_type: t.task_type,
    agent: t.phase.replace(/_/g, ' '),
    description: filePath || t.description,
    status: t.status,
    subtasks_total: 0,
    subtasks_completed: 0,
    subtasks_in_progress: 0,
    progress: t.status === 'completed' || t.status === 'skipped' ? 100 : t.status === 'in_progress' ? 50 : 0,
    filePath,
    error: t.error_message ?? undefined,
  };
}

export function groupGranularTasksIntoColumns(tasks: GranularTask[]): KanbanColumn[] {
  const todo: Task[] = [];
  const inProgress: Task[] = [];
  const completed: Task[] = [];
  const failed: Task[] = [];

  for (const raw of tasks) {
    const task = granularToDisplayTask(raw);
    switch (columnForStatus(raw.status)) {
      case 'in-progress':
        inProgress.push(task);
        break;
      case 'completed':
        completed.push(task);
        break;
      case 'failed':
        failed.push(task);
        break;
      default:
        todo.push(task);
    }
  }

  const columns: KanbanColumn[] = [
    { id: 'todo', title: 'Planned', tasks: todo },
    { id: 'in-progress', title: 'In Progress', tasks: inProgress },
    { id: 'completed', title: 'Completed', tasks: completed },
  ];
  if (failed.length > 0) {
    columns.push({ id: 'failed', title: 'Failed', tasks: failed });
  }
  return columns;
}
