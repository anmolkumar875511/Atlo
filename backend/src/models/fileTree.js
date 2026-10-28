// Builds the nested folder tree from a flat list of file paths.
// One pass to insert (O(n * depth)), one pass to sort and total up (O(n log n)).
export function buildFileTree(rootName, files) {
    const root = { type: 'dir', name: rootName, path: '', size: 0, fileCount: 0, children: [] };
    const dirs = new Map([['', root]]);

    for (const file of files) {
        const parts = file.path.split('/');
        let parent = root;
        let currentPath = '';

        for (let i = 0; i < parts.length - 1; i += 1) {
            currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
            let dir = dirs.get(currentPath);
            if (!dir) {
                dir = {
                    type: 'dir',
                    name: parts[i],
                    path: currentPath,
                    size: 0,
                    fileCount: 0,
                    children: [],
                };
                dirs.set(currentPath, dir);
                parent.children.push(dir);
            }
            parent = dir;
        }

        parent.children.push({
            type: 'file',
            name: file.name,
            path: file.path,
            size: file.size,
            fileCount: 1,
            language: file.language,
        });
    }

    finalize(root);
    return root;
}

// Sorts folders first, then A-Z, and fills in size/fileCount totals bottom-up.
function finalize(dir) {
    const children = dir.children;
    children.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    for (const child of children) {
        if (child.type === 'dir') finalize(child);
        dir.size += child.size;
        dir.fileCount += child.fileCount;
    }
}

export function countDirs(node) {
    if (node.type === 'file') return 0;
    return (node.children ?? []).reduce(
        (total, child) => total + (child.type === 'dir' ? 1 + countDirs(child) : 0),
        0
    );
}
