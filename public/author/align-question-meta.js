'use strict';

function normalizeText(s) {
    return String(s || '').trim();
}

function normalizeLoose(s) {
    return normalizeText(s).toLowerCase().replace(/\s+/g, ' ');
}

function normalizeStringArray(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => normalizeText(item)).filter(Boolean);
}

export function copyAlignQuestionMetaFields(source = {}, target = {}) {
    const row = { ...target };
    const decisionLabel = normalizeText(source.decisionLabel);
    if (decisionLabel) row.decisionLabel = decisionLabel;
    const progressKeyword = normalizeText(source.progressKeyword);
    if (progressKeyword) row.progressKeyword = progressKeyword;
    const whyWeAsk = normalizeText(source.whyWeAsk);
    if (whyWeAsk) row.whyWeAsk = whyWeAsk;
    const aliases = normalizeStringArray(source.aliases);
    if (aliases.length) row.aliases = aliases;
    return row;
}

export function readDecisionLabel(question) {
    const label = normalizeText(question?.decisionLabel);
    if (label) return label;
    const text = normalizeText(question?.text).replace(/\?$/, '').trim();
    return text || 'Decision';
}

export function readProgressKeyword(question) {
    const keyword = normalizeText(question?.progressKeyword);
    if (keyword) return keyword.toLowerCase();
    const short = readDecisionLabel(question);
    return String(short.split(/\s+/)[0] || 'decision').toLowerCase();
}

export function readQuestionAliases(question) {
    const terms = new Set();
    for (const alias of normalizeStringArray(question?.aliases)) {
        terms.add(normalizeLoose(alias));
    }
    const label = readDecisionLabel(question);
    if (label) terms.add(normalizeLoose(label));
    const text = normalizeLoose(String(question?.text || '').replace(/\?/g, '').trim());
    if (text) terms.add(text);
    return [...terms].filter((term) => term.length >= 3);
}
