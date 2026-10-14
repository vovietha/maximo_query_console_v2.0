import { state } from './state.js';
import { invokeTauri } from './tauri.js';
import { openConfigModal } from './connection.js';
import { renderResults } from './results.js';
import { addHistory } from './sidebar.js';
import { isReadOnlyQuery } from './utils.js';
import { getActiveConnection } from './connections.js';

export function changePage(delta) {
    const targetPage = state.currentPage + delta;
    if (targetPage >= 1) {
        runQuery(targetPage);
    }
}

export function updatePaginationButtons() {
    document.getElementById('pageLabel').innerText = `Trang ${state.currentPage}`;
    document.getElementById('btnPrev').disabled = (state.currentPage <= 1);
    document.getElementById('btnNext').disabled = !state.hasMore;
}



// 1. Tự động loại bỏ Comment ở đầu câu lệnh & Dấu ';' thừa ở cuối

export function cleanSqlStatement(sql) {
    if (!sql) return '';
    let cleaned = sql.trim();

    // Xóa dấu ';' ở cuối câu lệnh
    cleaned = cleaned.replace(/;+$/, '').trim();

    // Xóa comment nằm ở đầu câu lệnh để Backend & Maximo nhận diện đúng từ khóa SELECT/WITH
    while (true) {
        if (cleaned.startsWith('/*')) {
            const endIdx = cleaned.indexOf('*/');
            if (endIdx !== -1) {
                cleaned = cleaned.substring(endIdx + 2).trim();
                continue;
            }
        }
        if (cleaned.startsWith('--')) {
            const endLine = cleaned.indexOf('\n');
            if (endLine !== -1) {
                cleaned = cleaned.substring(endLine + 1).trim();
                continue;
            } else {
                cleaned = '';
            }
        }
        break;
    }

    return cleaned;
}

// 2. Tự động xác định câu lệnh chứa con trỏ (Bỏ qua dấu ';' nằm trong Comment và Nháy đơn)

export function getCurrentStatementAtCursor(cm) {
    if (!cm) return '';

    const selectedText = cm.getSelection().trim();
    if (selectedText) return selectedText;

    const fullText = cm.getValue();
    if (!fullText.trim()) return '';

    const cursorPos = cm.getCursor();
    const cursorIndex = cm.indexFromPos(cursorPos);

    // Phân tích cú pháp để tìm các dấu ';' hợp lệ (không nằm trong comment hay chuỗi '...')
    let inString = false;
    let inSingleComment = false;
    let inMultiComment = false;
    const semicolonIndices = [];

    for (let i = 0; i < fullText.length; i++) {
        const char = fullText[i];
        const nextChar = fullText[i + 1];

        if (inSingleComment) {
            if (char === '\n') inSingleComment = false;
            continue;
        }
        if (inMultiComment) {
            if (char === '*' && nextChar === '/') {
                inMultiComment = false;
                i++;
            }
            continue;
        }
        if (inString) {
            if (char === "'") {
                if (nextChar === "'") i++; // Bỏ qua nháy đơn thoát ''
                else inString = false;
            }
            continue;
        }

        if (char === '-' && nextChar === '-') { inSingleComment = true; i++; continue; }
        if (char === '/' && nextChar === '*') { inMultiComment = true; i++; continue; }
        if (char === "'") { inString = true; continue; }

        if (char === ';') semicolonIndices.push(i);
    }

    // Tìm phạm vi câu lệnh chứa con trỏ hiện tại
    let lastSemi = -1;
    let nextSemi = fullText.length;

    for (const idx of semicolonIndices) {
        if (idx < cursorIndex) lastSemi = idx;
        else { nextSemi = idx; break; }
    }

    let currentSql = fullText.substring(lastSemi + 1, nextSemi).trim();

    if (!currentSql && lastSemi > 0) {
        let prevSemi = -1;
        for (const idx of semicolonIndices) {
            if (idx < lastSemi) prevSemi = idx;
            else break;
        }
        currentSql = fullText.substring(prevSemi + 1, lastSemi).trim();
    }

    return currentSql;
}

//run Query

export async function runQuery(page = 1) {
    await state.credentialMigrationPromise;
    state.currentPage = page;

    const msgBox = document.getElementById('msgBox');
    const resContainer = document.getElementById('resultsContainer');
    const statsBox = document.getElementById('queryStats');

    msgBox.className = 'msg-box';
    msgBox.style.display = 'none';
    if (statsBox) statsBox.style.display = 'none';
    document.getElementById('filterInput').value = '';

    // 1. Trích xuất câu lệnh tại con trỏ và làm sạch comment đầu câu
    const rawSql = getCurrentStatementAtCursor(state.editor);
    let sql = cleanSqlStatement(rawSql);

    if (!sql) {
        msgBox.className = 'msg-box error';
        msgBox.style.display = 'block';
        msgBox.innerText = '⚠️ Không tìm thấy câu lệnh SQL hợp lệ tại vị trí con trỏ!';
        return;
    }

    const isSafeMode = document.getElementById('safeModeCheck')?.checked ?? true;
    const isAutoLimit = document.getElementById('autoLimitCheck')?.checked ?? true;
    const autoLimitVal = parseInt(document.getElementById('autoLimitValue')?.value) || 1000;

    // 2. Kiểm tra Safe Mode
    if (isSafeMode && !isReadOnlyQuery(sql)) {
        msgBox.className = 'msg-box error';
        msgBox.style.display = 'block';
        msgBox.innerText = '🛡️ [SAFE MODE ACTIVE] Chỉ cho phép một câu SELECT/CTE chỉ đọc.';
        return;
    }

    // 3. Áp dụng Auto Limit dựa trên tham số từ ô Input
    if (isAutoLimit) {
        sql = applyAutoLimit(sql, autoLimitVal);
    }

    const config = getActiveConnection();
    if (!config) {
        openConfigModal();
        return;
    }

    resContainer.innerHTML = `<div style="color: #61dafb; text-align: center; margin-top: 50px;">⏳ Đang thực thi câu lệnh SQL...</div>`;

    const startTime = performance.now();

    try {
        const result = await invokeTauri('execute_sql', {
            config,
            sql,
            page: state.currentPage,
            safeMode: isSafeMode
        });

        const duration = Math.round(performance.now() - startTime);

        addHistory(sql);

        if (result.action === 'SELECT') {
            state.currentData = result.data || [];
            state.hasMore = result.hasMore || false;
            updatePaginationButtons();
            renderResults();

            if (statsBox) {
                statsBox.style.display = 'block';
                statsBox.innerText = `⚡ ${state.currentData.length} bản ghi | 🕒 ${duration} ms`;
            }
        } else {
            state.currentData = [];
            state.filteredData = [];
            state.hasMore = false;
            updatePaginationButtons();
            resContainer.innerHTML = '';

            msgBox.className = 'msg-box success';
            msgBox.style.display = 'block';
            msgBox.innerText = `${result.message || 'Thực thi thành công!'} (Thời gian: ${duration} ms)`;
        }

    } catch (err) {
        resContainer.innerHTML = '';
        msgBox.className = 'msg-box error';
        msgBox.style.display = 'block';
        msgBox.innerText = 'Lỗi: ' + err.message;
    }
}


// Commit / Rollback Command

export async function executeCommand(cmd) {
    await state.credentialMigrationPromise;
    const msgBox = document.getElementById('msgBox');
    const resContainer = document.getElementById('resultsContainer');

    msgBox.className = 'msg-box';
    msgBox.style.display = 'none';

    const config = getActiveConnection();
    if (!config) {
        openConfigModal();
        return;
    }

    try {
        const result = await invokeTauri('execute_sql', {
            config,
            sql: cmd,
            page: 1,
            safeMode: false
        });

        addHistory(cmd);
        resContainer.innerHTML = '';
        msgBox.className = 'msg-box success';
        msgBox.style.display = 'block';
        msgBox.innerText = result.message || `Đã gửi lệnh ${cmd} thành công!`;

    } catch (err) {
        resContainer.innerHTML = '';
        msgBox.className = 'msg-box error';
        msgBox.style.display = 'block';
        msgBox.innerText = 'Lỗi: ' + err.message;
    }
    state.lastExecutedSql = cmd;
}



// Render Results

export function applyAutoLimit(sql, limitValue = 200) {
    if (!sql) return '';

    // 1. Dọn dẹp khoảng trắng và loại bỏ các dấu ';' thừa ở cuối câu
    let cleanSql = sql.trim().replace(/;+$/, '');
    const limit = parseInt(limitValue) || 200;

    // 2. Loại bỏ tạm thời Comment để kiểm tra chính xác từ khóa khởi đầu
    const codeOnly = cleanSql
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/--.*$/gm, '')
        .trim();

    const upperCode = codeOnly.toUpperCase();

    // 3. Kiểm tra xem có phải câu lệnh SELECT hoặc WITH (CTE) chưa có điều kiện giới hạn
    const isSelectOrWith = upperCode.startsWith("SELECT") || upperCode.startsWith("WITH");
    const hasLimitAlready = upperCode.includes("ROWNUM") || 
                            upperCode.includes("FETCH FIRST") || 
                            upperCode.includes("TOP ");

    if (isSelectOrWith && !hasLimitAlready) {
        // Bọc toàn bộ câu SQL gốc vào trong 1 Subquery ngoài cùng.
        // Giải pháp này đảm bảo:
        // - Lọc đúng top 200 bản ghi SAU KHI đã ORDER BY.
        // - Không bao giờ bị vỡ cú pháp do ngoặc lồng (), Subquery hay chuỗi String.
        return `SELECT * FROM (\n  ${cleanSql}\n) WHERE ROWNUM <= ${limit}`;
    }

    return cleanSql;
}


// Hàm thu gọn / Mở rộng Sidebar
