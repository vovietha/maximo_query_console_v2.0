import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { getActiveConnection } from './connections.js';

export function switchSidebarTab(tabName) {
    const sidebar = document.getElementById('sidebar');
    
    // Nếu Sidebar đang ở trạng thái Thu gọn -> Tự động mở rộng ra
    if (sidebar && sidebar.classList.contains('collapsed')) {
        toggleSidebar();
    }

    const schemaTab = document.getElementById('sbTabSchema');
    const historyTab = document.getElementById('sbTabHistory');
    const favTab = document.getElementById('sbTabFav');

    const schemaPanel = document.getElementById('panelSchema');
    const historyPanel = document.getElementById('panelHistory');
    const favPanel = document.getElementById('panelFav');

    if (!schemaTab || !historyTab || !favTab) return;

    schemaTab.classList.toggle('active', tabName === 'SCHEMA');
    historyTab.classList.toggle('active', tabName === 'HISTORY');
    favTab.classList.toggle('active', tabName === 'FAV');

    schemaPanel.style.display = tabName === 'SCHEMA' ? 'flex' : 'none';
    historyPanel.style.display = tabName === 'HISTORY' ? 'flex' : 'none';
    favPanel.style.display = tabName === 'FAV' ? 'flex' : 'none';

    if (tabName === 'HISTORY') renderHistory();
    if (tabName === 'FAV') renderFavorites();
}

// Quản lý Lịch sử Query

export function addHistory(sql) {
    state.history = state.history.filter(h => h !== sql);
    state.history.unshift(sql);
    if (state.history.length > 30) state.history.pop();
    localStorage.setItem('maximo_sql_history', JSON.stringify(state.history));
    renderHistory();
}

export function loadHistory() {
    state.history = JSON.parse(localStorage.getItem('maximo_sql_history') || '[]');
    renderHistory();
}

export function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;

    list.innerHTML = '';
    
    if (!state.history || state.history.length === 0) {
        list.innerHTML = '<div style="font-size:12px; color:#888; padding: 10px;">Chưa có lịch sử query.</div>';
        return;
    }

    state.history.forEach(sql => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerText = sql;
        item.title = "Click để nạp câu lệnh vào Editor";
        item.onclick = () => {
            if (state.editor) {
                state.editor.setValue(sql);
                state.editor.focus();
            }
        };
        list.appendChild(item);
    });
}

// Lưu Query hiện tại vào Yêu thích

export function saveCurrentQueryToFavorites() {
    if (!state.editor) return;
    const selectedSql = state.editor.getSelection().trim();
    const sql = selectedSql || state.editor.getValue().trim();

    if (!sql) {
        alert("Khung gõ SQL đang rỗng!");
        return;
    }

    const title = prompt("Nhập tên gợi nhớ cho câu lệnh SQL này:", "Query " + (state.favorites.length + 1));
    if (!title || !title.trim()) return;

    const newFav = {
        id: Date.now(),
        title: title.trim(),
        sql: sql
    };

    state.favorites.unshift(newFav);
    localStorage.setItem('maximo_sql_favs', JSON.stringify(state.favorites));
    
    switchSidebarTab('FAV');
    renderFavorites();
}

// Xóa 1 Query khỏi Yêu thích

export function deleteFavorite(id, event) {
    event.stopPropagation();
    if (!confirm("Bạn có chắc muốn xóa Query này khỏi danh sách Yêu thích?")) return;

    state.favorites = state.favorites.filter(f => f.id !== id);
    localStorage.setItem('maximo_sql_favs', JSON.stringify(state.favorites));
    renderFavorites();
}

export function loadFavorites() {
    state.favorites = JSON.parse(localStorage.getItem('maximo_sql_favs') || '[]');
    renderFavorites();
}

// Render danh sách Query Yêu thích

export function renderFavorites() {
    const list = document.getElementById('favList');
    if (!list) return;

    list.innerHTML = '';

    if (!state.favorites || state.favorites.length === 0) {
        list.innerHTML = '<div style="font-size:12px; color:#888; padding: 10px;">Chưa có Query nào được lưu. Bấm "⭐ Lưu Query" trên Toolbar để thêm.</div>';
        return;
    }

    state.favorites.forEach(fav => {
        const item = document.createElement('div');
        item.className = 'fav-item';
        item.onclick = () => {
            if (state.editor) {
                state.editor.setValue(fav.sql);
                state.editor.focus();
            }
        };

        item.innerHTML = `
            <div class="fav-header">
                <span>⭐ ${escapeHtml(fav.title)}</span>
            <span class="fav-del-btn" data-action="deleteFavorite" data-favorite-id="${fav.id}" title="Xóa">&times;</span>
            </div>
            <div class="fav-sql">${escapeHtml(fav.sql)}</div>
        `;

        list.appendChild(item);
    });
}


// Hàm tự động thêm ROWNUM theo tham số tùy chỉnh
// Hàm tự động thêm ROWNUM thông minh (Xử lý chuẩn ngoặc lồng (), CTE, Subquery & ORDER BY)
// Hàm tự động thêm ROWNUM an toàn (Chuẩn hóa cho Oracle DB, bảo toàn ORDER BY & CTE)

export function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('btnToggleSidebar');
    if (!sidebar || !toggleBtn) return;

    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    
    // Đổi icon mũi tên
    toggleBtn.innerText = isCollapsed ? '►' : '◄';

    // Refresh lại CodeMirror IDE để tự giãn chiều rộng
    setTimeout(() => {
        if (state.editor) state.editor.refresh();
    }, 200);
}

// Hàm cập nhật Thanh Trạng Thái (Status Bar Footer)

export function updateStatusBar() {
    const connection = getActiveConnection();
    const host = connection?.host;
    const context = connection?.context || 'maximo';
    const configButton = document.getElementById('btn-config');
    if (configButton) configButton.textContent = connection ? `⚙️ ${connection.name}` : '⚙️ Cấu hình kết nối';

    const limitCheck = document.getElementById('autoLimitCheck');
    const limitInput = document.getElementById('autoLimitValue');

    const statusDot = document.getElementById('statusDot');
    const statusHostText = document.getElementById('statusHostText');
    const statusContextText = document.getElementById('statusContextText');
    const statusLimitText = document.getElementById('statusLimitText');

    if (host) {
        if (statusDot) statusDot.className = 'status-dot connected';
        if (statusHostText) statusHostText.innerText = host;
    } else {
        if (statusDot) statusDot.className = 'status-dot disconnected';
        if (statusHostText) statusHostText.innerText = 'Chưa kết nối Maximo';
    }

    if (statusContextText) statusContextText.innerText = `Context: /${context}`;

    // Xử lý hiển thị động cho Limit
    if (statusLimitText) {
        if (limitCheck && !limitCheck.checked) {
            statusLimitText.innerText = 'Limit: OFF';
            statusLimitText.style.color = '#e57373'; // Màu đỏ nhạt khi TẮT
        } else {
            const limitVal = limitInput ? limitInput.value : '200';
            statusLimitText.innerText = `Limit: ${limitVal}`;
            statusLimitText.style.color = '#888';
        }
    }
}


// =========================================================================
// DATAGRIP-LIKE FIND & REPLACE ENGINE
// =========================================================================
// Đăng ký sự kiện Enter / Esc cho ô Input Search & Replace
