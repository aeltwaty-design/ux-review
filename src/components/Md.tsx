import type { ReactNode } from 'react';

/** Renders finding text with **bold**, `code`, links and line breaks — no HTML injection. */
export function Md({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const lines = (text || '').split('\n');
  lines.forEach((line, li) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s<]+[^\s<.,;:)])/g);
    parts.forEach((p, i) => {
      if (!p) return;
      const k = `${li}-${i}`;
      if (p.startsWith('**') && p.endsWith('**')) out.push(<strong key={k}>{p.slice(2, -2)}</strong>);
      else if (p.startsWith('`') && p.endsWith('`')) out.push(<code key={k}>{p.slice(1, -1)}</code>);
      else if (/^https?:\/\//.test(p)) out.push(<a key={k} href={p} target="_blank" rel="noopener noreferrer">{p}</a>);
      else out.push(p);
    });
    if (li < lines.length - 1) out.push(<br key={`br${li}`} />);
  });
  return <>{out}</>;
}
