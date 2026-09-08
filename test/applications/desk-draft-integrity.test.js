'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    buildIntegrityTableRows,
    resolveIntegrityGuidance,
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

test('resolveIntegrityGuidance infers nature and action from legacy AI verdicts', () => {
    const guidance = resolveIntegrityGuidance(
        { aiReview: { disposition: 'legitimate_callback' } },
        { verdict: 'false_positive' },
    );
    assert.equal(guidance.nature, 'thematic_callback');
    assert.equal(guidance.recommendedAction, 'keep');
});

test('buildIntegrityTableRows fills guidance for legacy saved audits', () => {
    const rows = buildIntegrityTableRows({
        findings: {
            duplication: [{
                kind: 'cross_chapter_reuse',
                severity: 'high',
                materialId: 'mat-b',
                allocatedChapter: 12,
                chapters: [0, 1, 3],
                aiReview: { disposition: 'accidental_repetition', rationale: 'Repeated story.' },
            }],
        },
        aiEvaluation: {
            items: [{
                materialId: 'mat-b',
                verdict: 'real_issue',
                rationale: 'Repeated story.',
            }],
        },
    }, new Map([
        ['mat-b', { id: 'mat-b', title: 'Fear story' }],
    ]));

    assert.equal(rows[0].nature, 'Verbatim repeat');
    assert.equal(rows[0].suggestedAction, 'Trim to callback');
});
