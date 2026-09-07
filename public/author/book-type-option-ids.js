'use strict';

/**
 * Client mirror of services/bookTypeOptionIds.js — keep maps in sync.
 * Canonical a_003 option values for Discover filtering + SMB editor.
 */

export const CANONICAL_BOOK_TYPE_IDS = Object.freeze([
    'memoir',
    'pets_memoir',
    'life_story',
    'novel_fiction',
]);

const VALUE_ALIASES = Object.freeze({
    memoir: 'memoir',
    career_memoir: 'memoir',
    business_memoir: 'memoir',
    pets_memoir: 'pets_memoir',
    pet_s_memoir: 'pets_memoir',
    pet_memoir: 'pets_memoir',
    pets: 'pets_memoir',
    life_story: 'life_story',
    novel_fiction: 'novel_fiction',
    novel: 'novel_fiction',
});

const LABEL_ALIASES = Object.freeze({
    'career memoir': 'memoir',
    'business memoir': 'memoir',
    'pets memoir': 'pets_memoir',
    'pet memoir': 'pets_memoir',
    'life story': 'life_story',
    'novel fiction': 'novel_fiction',
    novel: 'novel_fiction',
});

export function normalizeLooseBookTypeLabel(label) {
    return String(label || '')
        .trim()
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/\s+/g, ' ');
}

export function slugifyBookTypeLabel(label) {
    return normalizeLooseBookTypeLabel(label)
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
}

export function canonicalizeBookTypeOptionValue(value, label) {
    const rawValue = String(value != null ? value : '').trim();
    const valueKey = rawValue.toLowerCase();
    if (VALUE_ALIASES[valueKey]) return VALUE_ALIASES[valueKey];

    const looseLabel = normalizeLooseBookTypeLabel(label);
    if (LABEL_ALIASES[looseLabel]) return LABEL_ALIASES[looseLabel];

    const slug = slugifyBookTypeLabel(label || rawValue);
    if (VALUE_ALIASES[slug]) return VALUE_ALIASES[slug];

    if (CANONICAL_BOOK_TYPE_IDS.includes(valueKey)) return valueKey;
    if (CANONICAL_BOOK_TYPE_IDS.includes(slug)) return slug;

    return rawValue || slug;
}

export function isCanonicalBookTypeId(id) {
    return CANONICAL_BOOK_TYPE_IDS.includes(String(id || '').trim());
}
