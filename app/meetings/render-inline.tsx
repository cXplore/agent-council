/**
 * Renders inline markdown formatting (backtick code and bold) as React elements.
 * Used across meeting components to display tagged outcomes with proper formatting.
 */
export function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return <code key={i} style={{ fontSize: '0.85em', padding: '0.1em 0.3em', borderRadius: '3px', background: 'var(--bg)', color: '#93c5fd' }}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    return part;
  });
}
