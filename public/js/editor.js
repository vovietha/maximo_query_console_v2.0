import { state } from './state.js';

export function formatSql() {
    if (!state.editor) return;
    const text = state.editor.getValue();
    if (!text.trim()) return;

    const lines = text.split(/\r?\n/);
    const formattedLines = [];
    
    const keywords = [
        "SELECT", "FROM", "WHERE", "AND", "OR", "GROUP BY", "ORDER BY",
        "HAVING", "LIMIT", "OFFSET", "JOIN", "LEFT JOIN", "RIGHT JOIN",
        "INNER JOIN", "OUTER JOIN", "UPDATE", "SET", "INSERT INTO",
        "VALUES", "DELETE FROM", "DELETE"
    ];

    for (let line of lines) {
        let trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('--')) {
            formattedLines.push(trimmed);
            continue;
        }

        let codePart = trimmed;
        let commentPart = '';
        const commentIdx = trimmed.indexOf('--');
        
        if (commentIdx !== -1) {
            codePart = trimmed.substring(0, commentIdx).trim();
            commentPart = ' ' + trimmed.substring(commentIdx).trim();
        }

        if (codePart) {
            keywords.forEach(kw => {
                const regex = new RegExp(`(?<!^)\\b${kw}\\b`, 'gi');
                codePart = codePart.replace(regex, `\n${kw}`);
            });

            keywords.forEach(kw => {
                const regex = new RegExp(`\\b${kw}\\b`, 'gi');
                codePart = codePart.replace(regex, kw);
            });
        }

        const fullLine = (codePart + commentPart).trim();
        if (fullLine) {
            const subLines = fullLine.split('\n');
            subLines.forEach(sl => {
                if (sl.trim()) formattedLines.push(sl.trim());
            });
        }
    }

    state.editor.setValue(formattedLines.join('\n'));
}

// Modal Controls
