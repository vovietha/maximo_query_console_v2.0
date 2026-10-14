import { state } from './state.js';
import { escapeHtml } from './utils.js';

export function toggleSafeMode() {
    const isSafe = document.getElementById('safeModeCheck').checked;
    localStorage.setItem('maximo_safe_mode', isSafe);
}

// Hàm tạo Tab mới

export function addTab(initialSql = '') {
    state.tabCounter++;
    const defaultSql = initialSql || "SELECT wonum, description, status, siteid FROM workorder WHERE siteid='BEDFORD'";
    
    const newTab = {
        id: state.tabCounter,
        title: `Query ${state.tabCounter}`,
        sql: defaultSql
    };

    state.tabs.push(newTab);
    switchTab(newTab.id);
}

export function switchTab(tabId) {
    if (state.activeTabId && state.editor) {
        const currentTab = state.tabs.find(t => t.id === state.activeTabId);
        if (currentTab) currentTab.sql = state.editor.getValue();
    }

    state.activeTabId = tabId;
    const targetTab = state.tabs.find(t => t.id === tabId);

    if (targetTab && state.editor) {
        state.editor.setValue(targetTab.sql);
        state.editor.focus();
    }

    renderTabs();
}

export function closeTab(tabId, event) {
    event.stopPropagation();
    
    if (state.tabs.length === 1) {
        alert("Cần giữ lại ít nhất 1 Tab làm việc!");
        return;
    }

    state.tabs = state.tabs.filter(t => t.id !== tabId);

    if (state.activeTabId === tabId) {
        const nextTab = state.tabs[state.tabs.length - 1];
        switchTab(nextTab.id);
    } else {
        renderTabs();
    }
}

export function renderTabs() {
    const tabBar = document.getElementById('tabBar');
    if (!tabBar) return;

    tabBar.innerHTML = state.tabs.map(t => `
        <div class="tab-item ${t.id === state.activeTabId ? 'active' : ''}" data-action="switchTab" data-tab-id="${t.id}">
            <span>${escapeHtml(t.title)}</span>
            <span class="tab-close" data-action="closeTab" data-tab-id="${t.id}">&times;</span>
        </div>
    `).join('');
}

// Format SQL không vỡ comment
