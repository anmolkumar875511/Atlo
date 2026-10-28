import { useId, useState } from 'react';
import { useSearch } from '../../controllers/useSearch.js';
import './SearchBar.css';

const TYPE_LABEL = { file: 'file', class: 'class', function: 'fn' };

export default function SearchBar({ snapshotId, onPick }) {
  const { query, setQuery, status, results, error } = useSearch(snapshotId);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const showList = open && query.trim().length > 0;

  function pick(result) {
    onPick(result);
    setOpen(false);
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && showList && results[active]) {
      event.preventDefault();
      pick(results[active]);
    } else if (event.key === 'Escape') {
      if (open) setOpen(false);
      else setQuery('');
    }
  }

  return (
    <div className="search">
      <label className="sr-only" htmlFor={`${listId}-input`}>
        Search files, functions and classes
      </label>
      <input
        id={`${listId}-input`}
        className="search__input"
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="Search files, functions, classes…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />

      {showList && (
        <ul id={listId} className="search__list" role="listbox">
          {status === 'error' && <li className="search__note">{error.message}</li>}
          {status === 'done' && results.length === 0 && (
            <li className="search__note">No matches for “{query.trim()}”.</li>
          )}
          {results.map((result, index) => (
            <li
              key={`${result.type}:${result.file}:${result.line}:${result.name}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={`search__item${index === active ? ' search__item--active' : ''}`}
              // mousedown, not click: the input would lose focus and close the list first
              onMouseDown={(event) => {
                event.preventDefault();
                pick(result);
              }}
              onMouseEnter={() => setActive(index)}
            >
              <span className={`search__type search__type--${result.type}`}>
                {TYPE_LABEL[result.type]}
              </span>
              <span className="search__name">{result.name}</span>
              <span className="search__where">
                {result.file}
                {result.line ? `:${result.line}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
