import { useState } from 'react';
import './RepoInput.css';

const EXAMPLES = ['expressjs/express', 'pallets/flask', 'sindresorhus/got'];

export default function RepoInput({ onSubmit, disabled, initialValue = '' }) {
  const [value, setValue] = useState(initialValue);

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  }

  function pick(example) {
    setValue(example);
    onSubmit(example);
  }

  return (
    <section className="repo-input" aria-label="Analyze a repository">
      <form className="repo-input__form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="repo-url">
          GitHub repository URL
        </label>
        <input
          id="repo-url"
          className="repo-input__field"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://github.com/owner/repository"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
        />
        <button className="repo-input__button" type="submit" disabled={disabled || !value.trim()}>
          {disabled ? 'Mapping…' : 'Analyze'}
        </button>
      </form>
      <div className="repo-input__examples">
        <span>Try:</span>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            className="repo-input__chip"
            onClick={() => pick(example)}
            disabled={disabled}
          >
            {example}
          </button>
        ))}
      </div>
    </section>
  );
}
