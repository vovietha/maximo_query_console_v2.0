export function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export const escapeHtmlAttribute = escapeHtml;

export function isReadOnlyQuery(sql) {
    const tokens = [];
    let index = 0;
    while (index < sql.length) {
        const char = sql[index];
        const next = sql[index + 1];
        if (/\s/.test(char)) { index++; continue; }
        if (char === ';') return false;
        if (char === '-' && next === '-') {
            index += 2;
            while (index < sql.length && sql[index] !== '\n') index++;
            continue;
        }
        if (char === '/' && next === '*') {
            const end = sql.indexOf('*/', index + 2);
            if (end < 0) return false;
            index = end + 2;
            continue;
        }
        if (char === "'" || char === '"') {
            const quote = char;
            index++;
            let closed = false;
            while (index < sql.length) {
                if (sql[index] === quote) {
                    if (sql[index + 1] === quote) index += 2;
                    else { index++; closed = true; break; }
                } else index++;
            }
            if (!closed) return false;
            tokens.push('');
            continue;
        }
        if (/[A-Za-z_]/.test(char)) {
            const start = index++;
            while (index < sql.length && /[A-Za-z0-9_$#]/.test(sql[index])) index++;
            tokens.push(sql.slice(start, index).toUpperCase());
            continue;
        }
        index++;
    }

    const first = tokens.find(Boolean);
    if (first !== 'SELECT' && first !== 'WITH') return false;
    const blocked = new Set(['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'GRANT', 'REVOKE', 'CALL', 'EXEC', 'EXECUTE', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'BEGIN']);
    return !tokens.some(token => blocked.has(token));
}
