const TYPE_ORDER = { file: 0, class: 1, function: 2 };

// Built once per snapshot from file names and the functions and classes found by the parser.
export function buildSearchIndex({ files, analyses }) {
    const entries = [];
    const add = (type, name, file, line) => {
        entries.push({
            type,
            name,
            file,
            line,
            nameKey: name.toLowerCase(),
            pathKey: file.toLowerCase(),
        });
    };

    for (const file of files) add('file', file.name, file.path, null);
    for (const [path, analysis] of analyses) {
        for (const cls of analysis.classes) add('class', cls.name, path, cls.line);
        for (const fn of analysis.functions) add('function', fn.name, path, fn.line);
    }
    return entries;
}

// "gb" matches "GraphBuilder": letters in order, gaps allowed. Tighter matches score higher.
function subsequenceScore(query, text) {
    let first = -1;
    let last = -1;
    let from = 0;
    for (const ch of query) {
        const at = text.indexOf(ch, from);
        if (at === -1) return -1;
        if (first === -1) first = at;
        last = at;
        from = at + 1;
    }
    const gaps = last - first + 1 - query.length;
    return Math.max(1, 30 - Math.min(29, gaps));
}

function scoreEntry(entry, query) {
    const name = entry.nameKey;
    // For "Class.method" also compare the part after the last dot, which is what people type.
    const tail = name.slice(name.lastIndexOf('.') + 1);

    if (name === query) return 100;
    if (tail === query) return 95;
    if (name.startsWith(query)) return 90 - Math.min(10, name.length - query.length);
    if (tail.startsWith(query)) return 82;
    const at = name.indexOf(query);
    if (at !== -1) return 70 - Math.min(20, at);
    if (entry.type === 'file') {
        const inPath = entry.pathKey.indexOf(query);
        if (inPath !== -1) return 50 - Math.min(20, Math.floor(inPath / 4));
    }
    return subsequenceScore(query, name);
}

export function searchIndex(entries, rawQuery, limit = 20) {
    const query = rawQuery.trim().toLowerCase();
    if (!query) return [];

    const scored = [];
    for (const entry of entries) {
        const score = scoreEntry(entry, query);
        if (score > 0) scored.push({ entry, score });
    }

    scored.sort(
        (a, b) =>
            b.score - a.score ||
            TYPE_ORDER[a.entry.type] - TYPE_ORDER[b.entry.type] ||
            a.entry.name.length - b.entry.name.length ||
            a.entry.file.localeCompare(b.entry.file) ||
            (a.entry.line ?? 0) - (b.entry.line ?? 0)
    );

    return scored.slice(0, limit).map(({ entry, score }) => ({
        type: entry.type,
        name: entry.name,
        file: entry.file,
        line: entry.line,
        score,
    }));
}
