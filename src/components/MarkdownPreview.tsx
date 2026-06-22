import React, { useMemo } from 'react';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: true });

export type MarkdownPreviewVariant = 'panel' | 'document' | 'inline';

interface Props {
  content: string;
  emptyText?: string;
  maxHeight?: string | number;
  className?: string;
  variant?: MarkdownPreviewVariant;
}

const VARIANT_STYLES: Record<MarkdownPreviewVariant, React.CSSProperties> = {
  panel: {
    background: '#FFFFFF',
    border: '1px solid #E0E0E0',
    borderRadius: '10px',
    padding: '1.25rem 1.5rem',
    overflowY: 'auto',
    lineHeight: 1.65,
    fontSize: '0.875rem',
    color: '#151515',
    fontFamily: '"Red Hat Text", sans-serif',
  },
  document: {
    background: '#FAFAFA',
    border: 'none',
    borderRadius: '8px',
    padding: '1.5rem 2rem',
    overflowY: 'auto',
    lineHeight: 1.7,
    fontSize: '0.9375rem',
    color: '#151515',
    fontFamily: '"Red Hat Text", sans-serif',
    flex: 1,
    minHeight: 0,
  },
  inline: {
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
    padding: 0,
    overflowY: 'visible',
    lineHeight: 1.55,
    fontSize: '0.875rem',
    color: 'inherit',
    fontFamily: '"Red Hat Text", sans-serif',
  },
};

export const MarkdownPreview: React.FC<Props> = ({
  content,
  emptyText = 'No content available.',
  maxHeight = '480px',
  className,
  variant = 'panel',
}) => {
  const html = useMemo(() => {
    const trimmed = content.trim();
    if (!trimmed) return null;
    return marked.parse(trimmed) as string;
  }, [content]);

  const resolvedClass = className ?? `markdown-preview markdown-preview--${variant}`;

  const panelStyle: React.CSSProperties = {
    ...VARIANT_STYLES[variant],
    ...(variant === 'panel' ? { maxHeight } : {}),
    ...(variant === 'document' && maxHeight !== '480px' ? { maxHeight } : {}),
  };

  if (!html) {
    return (
      <div className={resolvedClass} style={panelStyle}>
        <span style={{ color: '#6A6E73' }}>{emptyText}</span>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .markdown-preview h1,
        .markdown-preview h2,
        .markdown-preview h3,
        .markdown-preview h4 {
          color: #151515;
          line-height: 1.3;
          margin: 1.25rem 0 0.5rem;
        }
        .markdown-preview h1:first-child,
        .markdown-preview h2:first-child,
        .markdown-preview h3:first-child {
          margin-top: 0;
        }
        .markdown-preview--panel h1 { font-size: 1.25rem; font-weight: 700; }
        .markdown-preview--panel h2 { font-size: 1.0625rem; font-weight: 600; }
        .markdown-preview--panel h3 { font-size: 0.9375rem; font-weight: 600; }
        .markdown-preview--document h1 { font-size: 1.75rem; font-weight: 700; }
        .markdown-preview--document h2 {
          font-size: 1.3125rem;
          font-weight: 600;
          border-bottom: 1px solid #E0E0E0;
          padding-bottom: 0.35rem;
        }
        .markdown-preview--document h3 { font-size: 1.0625rem; font-weight: 600; }
        .markdown-preview--inline h1,
        .markdown-preview--inline h2,
        .markdown-preview--inline h3 { font-size: inherit; font-weight: 600; }
        .markdown-preview p,
        .markdown-preview ul,
        .markdown-preview ol { margin: 0.65rem 0; }
        .markdown-preview ul,
        .markdown-preview ol { padding-left: 1.5rem; }
        .markdown-preview li { margin: 0.35rem 0; }
        .markdown-preview li > p { margin: 0.25rem 0; }
        .markdown-preview code {
          font-family: "Red Hat Mono", monospace;
          font-size: 0.85em;
          background: #F0F0F0;
          padding: 0.1rem 0.35rem;
          border-radius: 4px;
        }
        .markdown-preview pre {
          background: #F5F5F5;
          border: 1px solid #E0E0E0;
          border-radius: 8px;
          padding: 0.75rem 1rem;
          overflow-x: auto;
          margin: 0.75rem 0;
        }
        .markdown-preview pre code { background: none; padding: 0; }
        .markdown-preview strong { font-weight: 600; }
        .markdown-preview blockquote {
          margin: 0.75rem 0;
          padding-left: 0.75rem;
          border-left: 3px solid #E0E0E0;
          color: #4A4A4A;
        }
        .markdown-preview table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.75rem 0;
          font-size: 0.875rem;
        }
        .markdown-preview th,
        .markdown-preview td {
          border: 1px solid #E0E0E0;
          padding: 0.35rem 0.6rem;
          text-align: left;
        }
        .markdown-preview th { background: #F8F8F8; font-weight: 600; }
      `}</style>
      <div
        className={resolvedClass}
        style={panelStyle}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
};

export default MarkdownPreview;
