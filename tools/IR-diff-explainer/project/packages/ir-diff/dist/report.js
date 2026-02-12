function riskBadge(risk) {
    return risk === 'high' ? '**[HIGH RISK]**' : '[low risk]';
}
function changeIcon(type) {
    switch (type) {
        case 'added':
            return '+';
        case 'removed':
            return '-';
        case 'changed':
            return '~';
        default:
            return '?';
    }
}
function formatChange(change) {
    const icon = changeIcon(change.changeType);
    const label = change.label ? ` (${change.label})` : '';
    const risk = riskBadge(change.risk);
    const parts = [`- \`${icon}\` \`${change.path}\`${label} ${risk}`];
    if (change.changeType === 'changed') {
        parts.push(`  - before: \`${change.beforeHash}\``);
        parts.push(`  - after:  \`${change.afterHash}\``);
    }
    else if (change.changeType === 'added') {
        parts.push(`  - hash: \`${change.afterHash}\``);
    }
    else if (change.changeType === 'removed') {
        parts.push(`  - hash: \`${change.beforeHash}\``);
    }
    return parts.join('\n');
}
function groupByLabel(changes) {
    const groups = new Map();
    for (const change of changes) {
        const key = change.label ?? 'Unlabeled';
        const list = groups.get(key) ?? [];
        list.push(change);
        groups.set(key, list);
    }
    return groups;
}
export function formatMarkdownReport(summary) {
    const lines = [];
    lines.push('# IR Diff Report');
    lines.push('');
    lines.push('## Overview');
    lines.push('');
    lines.push(`| Metric | Count |`);
    lines.push(`| --- | --- |`);
    lines.push(`| Total changes | ${summary.totalChanges} |`);
    lines.push(`| Added | ${summary.added} |`);
    lines.push(`| Removed | ${summary.removed} |`);
    lines.push(`| Changed | ${summary.changed} |`);
    lines.push(`| High risk | ${summary.highRiskCount} |`);
    lines.push('');
    if (summary.highRiskCount > 0) {
        lines.push('## High Risk Changes');
        lines.push('');
        for (const change of summary.changes.filter((c) => c.risk === 'high')) {
            lines.push(formatChange(change));
        }
        lines.push('');
    }
    lines.push('## All Changes');
    lines.push('');
    const grouped = groupByLabel(summary.changes);
    const sortedGroups = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [label, changes] of sortedGroups) {
        lines.push(`### ${label}`);
        lines.push('');
        for (const change of changes) {
            lines.push(formatChange(change));
        }
        lines.push('');
    }
    return lines.join('\n');
}
//# sourceMappingURL=report.js.map