import { useState } from 'react';
import { useToast } from './Toast';

/** The shareable address of a review: the app URL plus #<review id>. Anyone with a walaplus.com account can open it. */
export function reviewLink(id: string): string {
  return `${location.origin}${location.pathname}#${id}`;
}

export function CopyLink({ id, small }: { id: string; small?: boolean }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const url = reviewLink(id);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
      toast('Link copied. Anyone at WalaPlus can open it.');
    } catch {
      toast('Copy this link: ' + url);
    }
  };
  return (
    <button type="button" className={'btn' + (small ? ' sm' : '')} onClick={copy} title={reviewLink(id)} aria-label="Copy the link to this review">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
      </svg>
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}
