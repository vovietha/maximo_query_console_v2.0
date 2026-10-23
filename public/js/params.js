import { escapeHtml, escapeHtmlAttribute } from './utils.js';

const PARAM_CACHE_KEY = 'maximo_query_param_cache';

/**
 * Trích xuất các tham số dạng :param_name trong câu lệnh SQL.
 * Bỏ qua các ký tự ':' nằm trong string literal ('...'), quoted identifier ("..."),
 * comment (-- ... hoặc /* ... *\/), và double colon (::).
 *
 * @param {string} sql
 * @returns {string[]} Danh sách tên tham số duy nhất theo thứ tự xuất hiện
 */
export function extractSqlParameters(sql) {
    if (!sql || typeof sql !== 'string') return [];
    const params = new Set();
    let i = 0;
    const len = sql.length;

    while (i < len) {
        const char = sql[i];
        const next = sql[i + 1];

        // 1. Single-line comment: -- ...
        if (char === '-' && next === '-') {
            i += 2;
            while (i < len && sql[i] !== '\n') i++;
            continue;
        }

        // 2. Multi-line comment: /* ... */
        if (char === '/' && next === '*') {
            i += 2;
            const end = sql.indexOf('*/', i);
            if (end === -1) break;
            i = end + 2;
            continue;
        }

        // 3. String literal: '...'
        if (char === "'") {
            i++;
            while (i < len) {
                if (sql[i] === "'") {
                    if (sql[i + 1] === "'") {
                        i += 2;
                    } else {
                        i++;
                        break;
                    }
                } else {
                    i++;
                }
            }
            continue;
        }

        // 4. Quoted identifier: "..."
        if (char === '"') {
            i++;
            while (i < len) {
                if (sql[i] === '"') {
                    if (sql[i + 1] === '"') {
                        i += 2;
                    } else {
                        i++;
                        break;
                    }
                } else {
                    i++;
                }
            }
            continue;
        }

        // 5. Double colon :: (type cast trong một số CSDL)
        if (char === ':' && next === ':') {
            i += 2;
            continue;
        }

        // 6. Named parameter: :paramName
        if (char === ':' && /[a-zA-Z_]/.test(next || '')) {
            const start = i + 1;
            i += 2;
            while (i < len && /[a-zA-Z0-9_$#]/.test(sql[i])) {
                i++;
            }
            const paramName = sql.slice(start, i);
            params.add(paramName);
            continue;
        }

        i++;
    }

    return Array.from(params);
}

/**
 * Định dạng giá trị tham số an toàn theo kiểu dữ liệu được chọn.
 *
 * @param {string|number|null} rawVal
 * @param {'string'|'number'|'date'|'raw'|'null'} type
 * @returns {string} Chuỗi SQL đã được escape và format an toàn
 */
export function formatParamValue(rawVal, type = 'string') {
    if (type === 'null') {
        return 'NULL';
    }

    const val = (rawVal === undefined || rawVal === null) ? '' : String(rawVal);

    if (type === 'number') {
        const trimmed = val.trim();
        if (trimmed === '') return 'NULL';
        if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
            throw new Error(`Giá trị tham số "${val}" không phải là số hợp lệ.`);
        }
        return trimmed;
    }

    if (type === 'date') {
        const trimmed = val.trim();
        if (!trimmed) return 'NULL';
        const unquoted = trimmed.replace(/^'|'$/g, '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(unquoted)) {
            return `TO_DATE('${unquoted}', 'YYYY-MM-DD')`;
        }
        if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(unquoted)) {
            return `TO_DATE('${unquoted}', 'YYYY-MM-DD HH24:MI:SS')`;
        }
        const escaped = unquoted.replace(/'/g, "''");
        return `TO_DATE('${escaped}', 'YYYY-MM-DD')`;
    }

    if (type === 'raw') {
        const trimmed = val.trim();
        return trimmed === '' ? 'NULL' : val;
    }

    // Default: 'string'
    let str = val;
    if (str.startsWith("'") && str.endsWith("'") && str.length >= 2) {
        str = str.slice(1, -1);
    }
    const escaped = str.replace(/'/g, "''");
    return `'${escaped}'`;
}

/**
 * Thay thế an toàn các :paramName trong SQL bằng giá trị từ paramMap.
 *
 * @param {string} sql
 * @param {Record<string, { value: any, type: string } | any>} paramMap
 * @returns {string}
 */
export function substituteSqlParameters(sql, paramMap) {
    if (!sql || typeof sql !== 'string') return '';
    let result = '';
    let i = 0;
    const len = sql.length;

    while (i < len) {
        const char = sql[i];
        const next = sql[i + 1];

        if (char === '-' && next === '-') {
            const start = i;
            i += 2;
            while (i < len && sql[i] !== '\n') i++;
            result += sql.slice(start, i);
            continue;
        }

        if (char === '/' && next === '*') {
            const start = i;
            i += 2;
            const end = sql.indexOf('*/', i);
            if (end === -1) {
                result += sql.slice(start);
                break;
            }
            i = end + 2;
            result += sql.slice(start, i);
            continue;
        }

        if (char === "'") {
            const start = i;
            i++;
            while (i < len) {
                if (sql[i] === "'") {
                    if (sql[i + 1] === "'") {
                        i += 2;
                    } else {
                        i++;
                        break;
                    }
                } else {
                    i++;
                }
            }
            result += sql.slice(start, i);
            continue;
        }

        if (char === '"') {
            const start = i;
            i++;
            while (i < len) {
                if (sql[i] === '"') {
                    if (sql[i + 1] === '"') {
                        i += 2;
                    } else {
                        i++;
                        break;
                    }
                } else {
                    i++;
                }
            }
            result += sql.slice(start, i);
            continue;
        }

        if (char === ':' && next === ':') {
            result += '::';
            i += 2;
            continue;
        }

        if (char === ':' && /[a-zA-Z_]/.test(next || '')) {
            const start = i + 1;
            i += 2;
            while (i < len && /[a-zA-Z0-9_$#]/.test(sql[i])) {
                i++;
            }
            const paramName = sql.slice(start, i);
            const entry = paramMap ? paramMap[paramName] : undefined;
            if (entry !== undefined) {
                const formatted = (typeof entry === 'object' && entry !== null && 'type' in entry)
                    ? formatParamValue(entry.value, entry.type)
                    : formatParamValue(entry, 'string');
                result += formatted;
            } else {
                result += ':' + paramName;
            }
            continue;
        }

        result += char;
        i++;
    }

    return result;
}

// =========================================================================
// UI MODAL & CACHE MANAGEMENT
// =========================================================================

let pendingPromptResolve = null;
let currentPromptSql = '';
let currentPromptParams = [];

export function getParamCache() {
    try {
        const raw = localStorage.getItem(PARAM_CACHE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

export function saveParamCache(cache) {
    try {
        localStorage.setItem(PARAM_CACHE_KEY, JSON.stringify(cache));
    } catch {
        // ignore storage errors
    }
}

/**
 * Hiển thị dialog nhập tham số (DataGrip style).
 * Trả về Promise resolving chuỗi SQL đã được thay thế tham số, hoặc null nếu người dùng đóng/hủy.
 *
 * @param {string} sql Câu SQL gốc
 * @param {string[]} paramNames Danh sách tên tham số
 * @returns {Promise<{ resolvedSql: string, paramValues: Record<string, { value: string, type: string }> } | null>}
 */
export function promptQueryParameters(sql, paramNames) {
    // Nếu có prompt đang mở, hủy prompt trước
    if (pendingPromptResolve) {
        pendingPromptResolve(null);
        pendingPromptResolve = null;
    }

    currentPromptSql = sql;
    currentPromptParams = paramNames;

    const modal = document.getElementById('paramModal');
    const container = document.getElementById('paramListContainer');
    if (!modal || !container) {
        return Promise.resolve(null);
    }

    const cache = getParamCache();

    // Render danh sách các hàng tham số
    container.innerHTML = paramNames.map((name) => {
        const cached = cache[name] || { value: '', type: 'string' };
        const safeName = escapeHtml(name);
        const attrName = escapeHtmlAttribute(name);
        const safeVal = escapeHtml(cached.value || '');
        const currentType = cached.type || 'string';

        return `
            <div class="param-row" data-param-name="${attrName}">
                <div class="param-label-col">
                    <span class="param-badge">:${safeName}</span>
                </div>
                <div class="param-type-col">
                    <select class="param-type-select" data-param="${attrName}" data-change-action="onParamTypeChange">
                        <option value="string" ${currentType === 'string' ? 'selected' : ''}>String ('text')</option>
                        <option value="number" ${currentType === 'number' ? 'selected' : ''}>Number (123)</option>
                        <option value="date" ${currentType === 'date' ? 'selected' : ''}>Date (TO_DATE)</option>
                        <option value="raw" ${currentType === 'raw' ? 'selected' : ''}>Raw SQL</option>
                        <option value="null" ${currentType === 'null' ? 'selected' : ''}>NULL</option>
                    </select>
                </div>
                <div class="param-val-col">
                    <input type="text" 
                           class="param-value-input" 
                           data-param="${attrName}" 
                           placeholder="Nhập giá trị..." 
                           value="${safeVal}" 
                           ${currentType === 'null' ? 'disabled' : ''} />
                </div>
            </div>
        `;
    }).join('');

    modal.style.display = 'flex';

    // Focus vào input đầu tiên
    setTimeout(() => {
        const firstInput = container.querySelector('.param-value-input:not([disabled])');
        if (firstInput) {
            firstInput.focus();
            firstInput.select();
        }
    }, 50);

    return new Promise((resolve) => {
        pendingPromptResolve = resolve;
    });
}

export function closeParamModal() {
    const modal = document.getElementById('paramModal');
    if (modal) modal.style.display = 'none';

    if (pendingPromptResolve) {
        const resolve = pendingPromptResolve;
        pendingPromptResolve = null;
        resolve(null);
    }
}

export function submitParams() {
    const container = document.getElementById('paramListContainer');
    if (!container) return;

    const rows = container.querySelectorAll('.param-row');
    const paramValues = {};
    const cache = getParamCache();

    try {
        rows.forEach((row) => {
            const name = row.dataset.paramName;
            const typeSelect = row.querySelector('.param-type-select');
            const valueInput = row.querySelector('.param-value-input');

            const type = typeSelect ? typeSelect.value : 'string';
            const value = valueInput ? valueInput.value : '';

            // Kiểm tra format trước khi submit
            formatParamValue(value, type);

            paramValues[name] = { value, type };
            cache[name] = { value, type };
        });

        saveParamCache(cache);

        const resolvedSql = substituteSqlParameters(currentPromptSql, paramValues);

        const modal = document.getElementById('paramModal');
        if (modal) modal.style.display = 'none';

        if (pendingPromptResolve) {
            const resolve = pendingPromptResolve;
            pendingPromptResolve = null;
            resolve({ resolvedSql, paramValues });
        }
    } catch (err) {
        alert(err.message || 'Lỗi định dạng tham số!');
    }
}

export function onParamTypeChange(element) {
    if (!element) return;
    const paramName = element.dataset.param;
    const row = element.closest('.param-row');
    if (!row) return;

    const input = row.querySelector('.param-value-input');
    if (!input) return;

    if (element.value === 'null') {
        input.disabled = true;
        input.placeholder = 'NULL';
    } else {
        input.disabled = false;
        input.placeholder = element.value === 'date' ? 'YYYY-MM-DD' : 'Nhập giá trị...';
    }
}
