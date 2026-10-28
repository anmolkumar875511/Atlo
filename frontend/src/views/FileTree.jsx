import { useMemo, useState } from 'react';
import { filterTree } from '../models/fileTree.js';
import { formatBytes, plural } from '../models/format.js';
import './FileTree.css';

export default function FileTree({ tree }) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => filterTree(tree, query), [tree, query]);
  const filtering = query.trim().length > 0;

  return (
    <section className="tree" aria-label="File tree">
      <div className="tree__toolbar">
        <label className="sr-only" htmlFor="tree-filter">
          Filter files
        </label>
        <input
          id="tree-filter"
          className="tree__filter"
          type="search"
          placeholder="Filter files by path…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="tree__count">
          {visible ? plural(visible.fileCount, 'file') : '0 files'}
          {filtering && ` of ${tree.fileCount.toLocaleString('en-US')}`}
        </span>
      </div>

      {visible ? (
        <ul className="tree__list" role="tree">
          <TreeNode
            key={filtering ? 'filtered' : 'plain'}
            node={visible}
            depth={0}
            defaultOpen
            expandAll={filtering}
          />
        </ul>
      ) : (
        <p className="tree__empty">No files match “{query}”.</p>
      )}
    </section>
  );
}

function TreeNode({ node, depth, defaultOpen, expandAll }) {
  const [open, setOpen] = useState(defaultOpen);
  const indent = { paddingLeft: `${depth * 16}px` };

  if (node.type === 'file') {
    return (
      <li
        role="treeitem"
        aria-selected="false"
        className="tree__row tree__row--file"
        style={indent}
      >
        <span className="tree__icon" aria-hidden="true">
          ·
        </span>
        <span className="tree__name">{node.name}</span>
        <span className={`tree__lang tree__lang--${node.language}`}>{node.language}</span>
        <span className="tree__size">{formatBytes(node.size)}</span>
      </li>
    );
  }

  return (
    <li role="treeitem" aria-expanded={open} aria-selected="false">
      <button
        type="button"
        className="tree__row tree__row--dir"
        style={indent}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="tree__icon" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="tree__name">{node.name}/</span>
        <span className="tree__meta">{plural(node.fileCount, 'file')}</span>
        <span className="tree__size">{formatBytes(node.size)}</span>
      </button>
      {open && (
        <ul role="group" className="tree__list">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              defaultOpen={expandAll}
              expandAll={expandAll}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
