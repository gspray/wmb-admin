'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    buildIntegrityTableRows,
} = require('../../public/author/desk-draft-integrity.js');

test('buildIntegrityTableRows surfaces AI editorial guidance columns', () => {
    const rows = buildIntegrityTableRows({
        findings: {
            duplication: [{
                kind: 'cross_chapter_reuse',
                severity: 'medium',
                materialId: 'mat-a',
                allocatedChapter: 8,
                chapters: [3, 5],
            }],
        },
        aiEvaluation: {
            items: [{
                materialId: 'mat-a',
                verdict: 'real_issue',
                nature: 'verbatim_repeat',
                recommendedAction: 'trim_to_callback',
            }],
        },
    }, new Map([
        ['mat-a', { id: 'mat-a', title: 'Pool story', questionText: 'Tell me about the pool.' }],
    ]));

    assert.equal(rows.length, 1);
    assert.equal(rows[0].topic, 'Pool story');
    assert.equal(rows[0].reviewedBy, 'AI');
    assert.equal(rows[0].nature, 'Verbatim repeat');
    assert.equal(rows[0].suggestedAction, 'Trim to callback');
});
