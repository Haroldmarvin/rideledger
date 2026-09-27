import { useEffect, useRef, useState } from 'react';
import { MapPin, PenLine, List } from 'lucide-react';

const OTHER = '__other__';

/**
 * Destination field: pick from the saved list (managed under Settings) or choose
 * "Other location" to type a new place. Places the rider typed before are offered
 * under "Recently used".
 */
export default function DestinationPicker({ id = 'destination', value, onChange, options = [], recent = [], invalid = false }) {
  const inList = (v) => options.some((o) => o.toLowerCase() === String(v || '').trim().toLowerCase());
  const extras = recent.filter((r) => r && !inList(r)).slice(0, 8);
  const [typing, setTyping] = useState(() => Boolean(value) && !inList(value) && !extras.includes(value));
  const inputRef = useRef(null);

  // Editing an old delivery (or restoring a draft) whose place is not in the list → show the text box
  useEffect(() => {
    if (value && !inList(value) && !extras.includes(value)) setTyping(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => { if (typing) inputRef.current?.focus(); }, [typing]);

  if (typing) {
    return (
      <div>
        <div className="input-group input-group-lg">
          <span className="input-group-text"><PenLine size={18} /></span>
          <input
            id={id}
            ref={inputRef}
            className={`form-control ${invalid ? 'is-invalid' : ''}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type the location"
            maxLength={200}
            autoCapitalize="words"
          />
        </div>
        {options.length > 0 && (
          <button type="button" className="btn btn-link btn-sm px-0 mt-1 d-inline-flex align-items-center gap-1" onClick={() => { setTyping(false); onChange(''); }}>
            <List size={14} /> Choose from the list instead
          </button>
        )}
      </div>
    );
  }

  const selected = value ? (options.find((o) => o.toLowerCase() === value.trim().toLowerCase()) || value) : '';
  return (
    <div className="input-group input-group-lg">
      <span className="input-group-text"><MapPin size={18} /></span>
      <select
        id={id}
        className={`form-select ${invalid ? 'is-invalid' : ''}`}
        value={selected}
        onChange={(e) => {
          if (e.target.value === OTHER) { setTyping(true); onChange(''); } else onChange(e.target.value);
        }}
      >
        <option value="">Choose destination…</option>
        <optgroup label="Locations">
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </optgroup>
        {extras.length > 0 && (
          <optgroup label="Recently used">
            {extras.map((o) => <option key={o} value={o}>{o}</option>)}
          </optgroup>
        )}
        <option value={OTHER}>➕ Other location (type it)</option>
      </select>
    </div>
  );
}
