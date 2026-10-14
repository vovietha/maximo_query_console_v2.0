import { state } from './state.js';
import { invokeTauri } from './tauri.js';
import { escapeHtml, escapeHtmlAttribute } from './utils.js';
import { getActiveConnection } from './connections.js';

export async function loadDynamicSchema(forceRefresh = false) {
    const treeContainer = document.getElementById('schemaTreeList');
    if (!treeContainer) return;

    const CACHE_KEY = 'MAXIMO_SCHEMA_CACHE';

    if (!forceRefresh) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            try {
                state.MAXIMO_SCHEMA = JSON.parse(cached);
                if (state.editor) state.editor.setOption("hintOptions", { tables: state.MAXIMO_SCHEMA });
                renderSchemaTree();
                return;
            } catch (e) {
                localStorage.removeItem(CACHE_KEY);
            }
        }
    }

    try {
        const config = getActiveConnection();
        if (!config) {
            treeContainer.innerHTML = '<div style="color: #888; padding: 10px; font-size: 11px;">Bấm "Cấu hình kết nối" để tải Schema.</div>';
            return;
        }

        treeContainer.innerHTML = '<div style="color: #61dafb; padding: 10px; font-size: 12px;">⏳ Đang tải CSDL từ Maximo...</div>';

        const result = await invokeTauri('get_schema', {
            config
        });

        if (result.success && result.schema) {
            state.MAXIMO_SCHEMA = result.schema;
            localStorage.setItem(CACHE_KEY, JSON.stringify(state.MAXIMO_SCHEMA));

            if (state.editor) state.editor.setOption("hintOptions", { tables: state.MAXIMO_SCHEMA });
            renderSchemaTree();
        } else {
            // In ra chi tiết lỗi từ backend trả về
        treeContainer.innerHTML = `<div style="color: #f88080; padding: 10px; font-size: 11px;">Lỗi: ${escapeHtml(result.error || 'Không thể kết nối Server')}</div>`;
        }
    } catch (err) {
        // In ra lỗi fetch/network
        treeContainer.innerHTML = `<div style="color: #f88080; padding: 10px; font-size: 11px;">Lỗi kết nối: ${escapeHtml(err.message)}</div>`;
    }
}

//
// Render Cây thư mục Bảng & Cột ra Sidebar CSDL

export function renderSchemaTree(filterKeyword = '') {
    const treeContainer = document.getElementById('schemaTreeList');
    if (!treeContainer) return;

    const tables = Object.keys(state.MAXIMO_SCHEMA).sort();
    if (tables.length === 0) {
        treeContainer.innerHTML = '<div style="color: #888; padding: 10px; font-size: 11px;">Chưa có dữ liệu Schema.</div>';
        return;
    }

    const keyword = filterKeyword.trim().toLowerCase();
    let html = '';

    tables.forEach(table => {
        const cols = state.MAXIMO_SCHEMA[table] || [];
        const matchTable = table.toLowerCase().includes(keyword);
        const matchingCols = cols.filter(c => c.toLowerCase().includes(keyword));

        if (!keyword || matchTable || matchingCols.length > 0) {
            const displayCols = (keyword && !matchTable) ? matchingCols : cols;
            const openAttr = keyword ? 'open' : '';

            html += `
                <details ${openAttr} style="margin-bottom: 4px; font-size: 11px;">
                    <summary style="cursor: pointer; color: #4ec9b0; font-weight: bold; padding: 2px 0;">
                        📁 ${escapeHtml(table.toUpperCase())} <span style="color: #888; font-weight: normal;">(${cols.length})</span>
                    </summary>

                    <ul style="list-style: none; padding-left: 14px; margin: 2px 0;">
                        ${displayCols.map(col => `
                            <li style="color: #9cdcfe; cursor: pointer; padding: 1px 0;" 
                                title="Click để chèn vào Editor" data-action="insertTextToEditor" data-value="${escapeHtmlAttribute(col)}">
                                🔹 ${escapeHtml(col)}
                            </li>
                        `).join('')}
                    </ul>
                </details>
            `;
        }
    });

    treeContainer.innerHTML = html || '<div style="color: #888; padding: 10px; font-size: 11px;">Không tìm thấy bảng/cột phù hợp.</div>';
}

// Lọc cây CSDL khi gõ vào ô tìm kiếm

export function filterSchemaTree() {
    const input = document.getElementById('schemaSearchInput');
    const keyword = input ? input.value : '';
    renderSchemaTree(keyword);
}

// Click vào tên cột để tự chèn vào vị trí con trỏ trong CodeMirror Editor

export function insertTextToEditor(text) {
    if (state.editor) {
        const doc = state.editor.getDoc();
        const cursor = doc.getCursor();
        doc.replaceRange(text, cursor);
        state.editor.focus();
    }
}
