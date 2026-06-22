import React from 'react';
import {
  Label,
  Progress,
  ProgressMeasureLocation,
  ProgressVariant,
  Spinner,
  Title,
} from '@patternfly/react-core';
import {
  CheckCircleIcon,
  OutlinedClockIcon,
  InProgressIcon,
  ExclamationCircleIcon,
  CodeIcon,
} from '@patternfly/react-icons';
import type { GranularTask, KanbanColumn, Task } from '../types';
import { groupGranularTasksIntoColumns } from '../utils/granularTaskGrouping';

const columnMeta: Record<string, { color: string; headerBg: string; icon: React.ReactNode }> = {
  todo:          { color: '#6A6E73', headerBg: '#F0F0F0', icon: <OutlinedClockIcon /> },
  'in-progress': { color: '#F0AB00', headerBg: '#FFF4E0', icon: <InProgressIcon /> },
  completed:     { color: '#3E8635', headerBg: '#E9F5E6', icon: <CheckCircleIcon /> },
  failed:        { color: '#C9190B', headerBg: '#FFF5F5', icon: <ExclamationCircleIcon /> },
};

const phaseColors: Record<string, string> = {
  development: '#3E8635',
  frontend: '#009596',
  tech_architect: '#F0AB00',
  designer: '#EC7A08',
  product_owner: '#0066CC',
  meta: '#6753AC',
};

interface Props {
  tasks: GranularTask[];
  loading?: boolean;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

const GranularTaskBoard: React.FC<Props> = ({
  tasks,
  loading = false,
  title = 'Granular Tasks',
  subtitle = 'Per-file and per-step tasks decomposed from the plan.',
  compact = false,
}) => {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <Spinner size="lg" aria-label="Loading granular tasks" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div style={{
        color: '#6A6E73', fontSize: '0.875rem', padding: '1.5rem',
        background: '#F8F8F8', borderRadius: '8px', textAlign: 'center',
      }}>
        No granular tasks registered yet. Tasks appear after plan approval when coding begins.
      </div>
    );
  }

  const columns = groupGranularTasksIntoColumns(tasks);

  return (
    <div style={{ marginTop: compact ? 0 : '2rem' }}>
      {!compact && (
        <div style={{ marginBottom: '1rem' }}>
          <Title headingLevel="h2" size="lg" style={{ fontFamily: '"Red Hat Display", sans-serif' }}>
            {title}
          </Title>
          <p style={{ color: '#6A6E73', marginTop: '0.25rem', fontSize: '0.875rem' }}>{subtitle}</p>
          <Label isCompact color="blue" style={{ marginTop: '0.35rem' }}>{tasks.length} tasks</Label>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'stretch', overflowX: 'auto' }}>
        {columns.map((col: KanbanColumn) => {
          const meta = columnMeta[col.id] || columnMeta.todo;
          return (
            <div key={col.id} style={{ flex: '1 1 220px', minWidth: 220 }}>
              <div style={{
                backgroundColor: meta.headerBg,
                borderRadius: '8px 8px 0 0',
                padding: '0.6rem 0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderBottom: `3px solid ${meta.color}`,
              }}>
                <span style={{ color: meta.color }}>{meta.icon}</span>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{col.title}</span>
                <Label isCompact variant="outline" style={{ marginLeft: 'auto' }}>{col.tasks.length}</Label>
              </div>
              <div style={{
                backgroundColor: '#FAFAFA',
                borderRadius: '0 0 8px 8px',
                padding: '0.6rem',
                minHeight: compact ? 200 : 280,
                maxHeight: compact ? 360 : 520,
                overflowY: 'auto',
              }}>
                {col.tasks.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#6A6E73', padding: '1.5rem', fontSize: '0.8rem' }}>
                    No tasks
                  </p>
                ) : (
                  col.tasks.map((task) => {
                    const phaseColor = phaseColors[task.phase] || '#6A6E73';
                    const err = (task as Task & { error?: string }).error;
                    return (
                      <div
                        key={task.task_id}
                        style={{
                          backgroundColor: '#fff',
                          borderRadius: 8,
                          borderLeft: `4px solid ${phaseColor}`,
                          padding: '0.6rem 0.75rem',
                          marginBottom: '0.6rem',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                          fontSize: '0.8rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <CodeIcon style={{ color: phaseColor, fontSize: '0.85rem' }} />
                          <Label isCompact color="grey">{task.phase.replace(/_/g, ' ')}</Label>
                          {task.task_type && (
                            <Label isCompact color="blue">{task.task_type}</Label>
                          )}
                        </div>
                        <div style={{
                          fontFamily: '"Red Hat Mono", monospace',
                          fontSize: '0.75rem',
                          color: '#151515',
                          wordBreak: 'break-all',
                          marginBottom: 4,
                        }}>
                          {task.description}
                        </div>
                        {task.status === 'in_progress' && (
                          <Progress
                            value={task.progress}
                            measureLocation={ProgressMeasureLocation.inside}
                            size="sm"
                            aria-label="Task progress"
                            style={{ '--pf-v5-c-progress__bar--before--BackgroundColor': phaseColor } as React.CSSProperties}
                          />
                        )}
                        {task.status === 'completed' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#3E8635', fontSize: '0.7rem' }}>
                            <CheckCircleIcon /> Done
                          </div>
                        )}
                        {task.status === 'failed' && (
                          <div style={{ color: '#C9190B', fontSize: '0.7rem' }}>
                            <ExclamationCircleIcon /> {err || 'Failed'}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GranularTaskBoard;
