import { useConfig } from '../context/ConfigContext';

/** Decimal money entry. Value is a string ("12.50"); convert with toCents() before sending. */
export default function MoneyInput({ value, onChange, invalid, size = '', id, ...rest }) {
  const { symbol } = useConfig();
  return (
    <div className={`input-group ${size ? `input-group-${size}` : ''} has-validation`}>
      <span className="input-group-text">{symbol}</span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={`form-control ${invalid ? 'is-invalid' : ''}`}
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.]/g, '');
          if (/^\d*\.?\d{0,2}$/.test(v)) onChange(v);
        }}
        {...rest}
      />
    </div>
  );
}
