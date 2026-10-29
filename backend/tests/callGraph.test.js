import { describe, expect, it } from 'vitest';
import { buildCallGraph } from '../src/models/callGraph.js';

const fn = (name, line, kind = 'function') => ({ name, line, endLine: line + 5, kind });
const call = (name, caller, line, member = false) => ({ name, caller, line, member });

describe('buildCallGraph', () => {
    const analyses = new Map([
        [
            'app.js',
            {
                functions: [fn('main', 1), fn('Server.start', 20, 'method')],
                classes: [{ name: 'Server', line: 18 }],
                calls: [
                    call('parse', 'main', 2), // defined in utils.js (imported)
                    call('main', 'Server.start', 22), // local function
                    call('render', 'main', 3, true), // member call, defined as a method in view.js
                    call('trim', 'main', 4, true), // no definition anywhere
                ],
            },
        ],
        [
            'utils.js',
            {
                functions: [fn('parse', 7), fn('helper', 30)],
                classes: [],
                calls: [call('helper', 'parse', 8)],
            },
        ],
        ['view.js', { functions: [fn('View.render', 3, 'method')], classes: [], calls: [] }],
    ]);
    const importTargets = new Map([['app.js', ['utils.js', 'view.js']]]);
    const result = buildCallGraph({ analyses, importTargets });

    it('links a call to a definition in an imported file', () => {
        const link = result.linksByFile.get('app.js').find((l) => l.name === 'parse');
        expect(link).toEqual({
            caller: 'main',
            name: 'parse',
            file: 'utils.js',
            defLine: 7,
            callLine: 2,
        });
    });

    it('links a call to a definition in the same file', () => {
        const link = result.linksByFile.get('app.js').find((l) => l.name === 'main');
        expect(link).toMatchObject({ file: 'app.js', caller: 'Server.start' });
    });

    it('lets a member call reach a method, using the full method name', () => {
        const link = result.linksByFile.get('app.js').find((l) => l.name === 'View.render');
        expect(link).toMatchObject({ file: 'view.js', defLine: 3 });
    });

    it('drops calls it cannot place', () => {
        expect(result.linksByFile.get('app.js').some((l) => l.name === 'trim')).toBe(false);
    });

    it('does not let a plain call reach a method', () => {
        const only = buildCallGraph({
            analyses: new Map([
                ['a.js', { functions: [], classes: [], calls: [call('render', 'x', 1, false)] }],
                [
                    'view.js',
                    { functions: [fn('View.render', 3, 'method')], classes: [], calls: [] },
                ],
            ]),
            importTargets: new Map([['a.js', ['view.js']]]),
        });
        expect(only.linksByFile.get('a.js')).toEqual([]);
    });

    it('aggregates file-to-file call edges and skips same-file calls', () => {
        expect(result.edges).toEqual(
            [
                { source: 'app.js', target: 'utils.js', type: 'call', count: 1, names: ['parse'] },
                {
                    source: 'app.js',
                    target: 'view.js',
                    type: 'call',
                    count: 1,
                    names: ['View.render'],
                },
                {
                    source: 'utils.js',
                    target: 'utils.js',
                    type: 'call',
                    count: 1,
                    names: ['helper'],
                },
            ].filter((e) => e.source !== e.target)
        );
    });

    it('builds a reverse index of callers', () => {
        expect(result.calledBy.get('utils.js\0parse')).toEqual([
            { file: 'app.js', caller: 'main', line: 2 },
        ]);
    });
});
