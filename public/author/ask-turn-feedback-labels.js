'use strict';

/** Shared labels for Ask turn feedback issue categories (author + admin). */
export const ISSUE_CATEGORY_LABELS = Object.freeze({
    misunderstood: 'Misunderstood my request',
    wrong_action: 'Did the wrong thing',
    wrong_entity: 'Used the wrong chapter, assignment, or material',
    missing_information: 'Missing information',
    unclear_answer: 'Answer was unclear',
    something_else: 'Something else',
    failed_execution: 'Could not complete that action',
});

/** Author-selectable thumbs-down categories (excludes automatic downs). */
export const USER_ISSUE_CATEGORY_LABELS = Object.freeze(
    Object.fromEntries(
        Object.entries(ISSUE_CATEGORY_LABELS).filter(([id]) => id !== 'failed_execution'),
    ),
);

export const DISPOSITION_LABELS = Object.freeze({
    expected_behavior: 'Expected behavior',
    routing_problem: 'Routing problem',
    parameter_extraction_problem: 'Parameter extraction problem',
    capability_problem: 'Capability problem',
    response_quality_problem: 'Response quality problem',
    product_gap: 'Product gap',
    duplicate: 'Duplicate',
    insufficient_information: 'Insufficient information',
});
