import { useRef } from 'react';

export default function SearchBar({ value = '', onChange, placeholder = 'Search by station name or address…', resultsCount, totalCount }) {
  const inputRef = useRef(null);

  const handleChange = (e) => {
    onChange(e.target.value.trimStart());
  };

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  const showCount = typeof resultsCount === 'number' && typeof totalCount === 'number' && value.length > 0;

  return (
    <div className="search-bar">
      <span className="search-bar__icon" aria-hidden="true">🔍</span>
      <input
        ref={inputRef}
        type="search"
        className="search-bar__input"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        aria-label="Search stations by name or address"
        autoComplete="off"
      />
      {value.length > 0 && (
        <button
          type="button"
          className="search-bar__clear"
          onClick={handleClear}
          aria-label="Clear search"
        >
          ×
        </button>
      )}
      {showCount && (
        <span className="search-bar__count">
          {resultsCount === totalCount ? `${totalCount} stations` : `${resultsCount} of ${totalCount}`}
        </span>
      )}
    </div>
  );
}
