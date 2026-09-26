import { useConfig } from '../context/ConfigContext';

/** Displays integer cents. tone="auto" colors negatives red. */
export default function Money({ cents, tone, className = '', signed = false }) {
  const { money } = useConfig();
  let cls = '';
  if (tone === 'auto') cls = cents < 0 ? 'text-danger' : cents > 0 ? 'text-success' : '';
  else if (tone) cls = `text-${tone}`;
  const text = signed && cents > 0 ? `+${money(cents)}` : money(cents);
  return <span className={`rl-money ${cls} ${className}`}>{text}</span>;
}
