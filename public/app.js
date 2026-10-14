import { state } from './js/state.js';
import { checkForAppUpdates, migrateLegacyPassword } from './js/tauri.js';
import { initTheme, toggleTheme } from './js/theme.js';
import { loadDynamicSchema, filterSchemaTree, insertTextToEditor } from './js/schema.js';
import { toggleSafeMode, addTab, switchTab, closeTab } from './js/tabs.js';
import { formatSql } from './js/editor.js';
import { openConfigModal, closeConfigModal, saveConfig, selectConnectionProfile, newConnectionProfile, deleteConnectionProfile } from './js/connection.js';
import { initializeConnections } from './js/connections.js';
import { changePage, runQuery, executeCommand } from './js/query.js';
import { renderResults, makeCellEditable, toggleView, exportExcel } from './js/results.js';
import { switchSidebarTab, loadHistory, saveCurrentQueryToFavorites, deleteFavorite, loadFavorites, toggleSidebar, updateStatusBar } from './js/sidebar.js';
import { showSearchBar, closeSearchBar, toggleReplaceRow, toggleSearchOption, performSearch, findNext, findPrev, doReplace, doReplaceAll } from './js/search.js';

const codeMirrorScripts = [
    './vendor/codemirror/lib/codemirror.js',
    './vendor/codemirror/mode/sql/sql.js',
    './vendor/codemirror/addon/hint/show-hint.js',
    './vendor/codemirror/addon/hint/sql-hint.js',
    './vendor/codemirror/addon/comment/comment.js'
];
const codeMirrorStyles = [
    './vendor/codemirror/lib/codemirror.css',
    './vendor/codemirror/theme/dracula.css',
    './vendor/codemirror/theme/eclipse.css',
    './vendor/codemirror/addon/hint/show-hint.css'
];

codeMirrorStyles.forEach((href) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
});

async function loadCodeMirrorAssets() {
    for (const src of codeMirrorScripts) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Không tải được ${src}`));
            document.head.appendChild(script);
        });
    }
}

function startApp() {
    bindActionHandlers();
    initializeConnections();

    // Khởi tạo CodeMirror IDE
    state.editor = CodeMirror.fromTextArea(document.getElementById('sqlEditor'), {
        mode: 'text/x-sql',
        theme: 'dracula',
        lineNumbers: true,
        indentWithTabs: true,
        smartIndent: true,
        lineWrapping: true,
        // extraKeys: {
        //     "Ctrl-Space": "autocomplete",
        //     "Ctrl-Enter": () => { runQuery(1); },
        //     "Ctrl-/": (cm) => { cm.toggleComment({ lineComment: "-- " }); },
        //     "Cmd-/": (cm) => { cm.toggleComment({ lineComment: "-- " }); }
        // },
        extraKeys: {
            "Ctrl-Space": "autocomplete",
            "Ctrl-Enter": () => { runQuery(1); },
            "Ctrl-F": () => { showSearchBar(false); },
            "Cmd-F": () => { showSearchBar(false); },
            "Ctrl-R": () => { showSearchBar(true); },
            "Cmd-R": () => { showSearchBar(true); },
            "Ctrl-H": () => { showSearchBar(true); },
            "Cmd-H": () => { showSearchBar(true); },
            "Esc": () => { closeSearchBar(); },
            "Ctrl-/": (cm) => { cm.toggleComment({ lineComment: "-- " }); },
            "Cmd-/": (cm) => { cm.toggleComment({ lineComment: "-- " }); }
        },
        hintOptions: {
            tables: {
                workorder: ["wonum", "description", "status", "siteid", "worktype", "assetnum", "location", "reportdate", "historyflag"],
                asset: ["assetnum", "description", "siteid", "status", "location"]
            }
        }
    });

    // Tải Safe Mode state
    const savedSafeMode = localStorage.getItem('maximo_safe_mode');
    const safeCheck = document.getElementById('safeModeCheck');
    if (safeCheck && savedSafeMode !== null) {
        safeCheck.checked = (savedSafeMode === 'true');
    }

    // Tự động lưu nội dung SQL vào Tab đang active
    state.editor.on("change", () => {
        const currentTab = state.tabs.find(t => t.id === state.activeTabId);
        if (currentTab) {
            currentTab.sql = state.editor.getValue();
        }
    });

    // Tự động gợi ý từ khóa khi gõ
    state.editor.on("inputRead", (cm, change) => {
        if (change.origin !== '+delete' && /[a-zA-Z._]/.test(change.text[0])) {
            CodeMirror.commands.autocomplete(cm, null, { completeSingle: false });
        }
    });

    // Theo dõi kích thước Editor
    const resizer = new ResizeObserver(() => {
        if (state.editor) state.editor.refresh();
    });
    resizer.observe(document.querySelector('.editor-container'));

    // Đăng ký sự kiện cập nhật Status Bar real-time khi gõ số hoặc tích chọn Limit
    const limitCheck = document.getElementById('autoLimitCheck');
    const limitInput = document.getElementById('autoLimitValue');

    if (limitCheck) limitCheck.addEventListener('change', updateStatusBar);
    if (limitInput) limitInput.addEventListener('input', updateStatusBar);


    // Khởi tạo Tab & Lịch sử
    addTab("SELECT wonum, description, status, siteid FROM workorder WHERE siteid='BEDFORD'");
    loadHistory();
    state.credentialMigrationPromise = migrateLegacyPassword();
    state.credentialMigrationPromise.finally(() => loadDynamicSchema());
    loadFavorites();
    updateStatusBar();
    initTheme();
    window.setTimeout(checkForAppUpdates, 3000);
}

function bindActionHandlers() {
    const actions = {
        toggleTheme: () => toggleTheme(),
        reloadSchema: () => loadDynamicSchema(true),
        openConfigModal: () => openConfigModal(),
        addTab: () => addTab(),
        toggleReplaceRow: () => toggleReplaceRow(),
        toggleSearchOption: (element) => toggleSearchOption(element.dataset.option),
        findPrev: () => findPrev(),
        findNext: () => findNext(),
        closeSearchBar: () => closeSearchBar(),
        doReplace: () => doReplace(),
        doReplaceAll: () => doReplaceAll(),
        runQuery: (element) => runQuery(Number(element.dataset.page || 1)),
        executeCommand: (element) => executeCommand(element.dataset.command),
        formatSql: () => formatSql(),
        saveCurrentQueryToFavorites: () => saveCurrentQueryToFavorites(),
        toggleView: () => toggleView(),
        exportExcel: () => exportExcel(),
        changePage: (element) => changePage(Number(element.dataset.delta)),
        switchSidebarTab: (element) => switchSidebarTab(element.dataset.tab),
        toggleSidebar: () => toggleSidebar(),
        closeConfigModal: () => closeConfigModal(),
        saveConfig: () => saveConfig(),
        selectConnectionProfile: (element) => selectConnectionProfile(element.value),
        newConnectionProfile: () => newConnectionProfile(),
        deleteConnectionProfile: () => deleteConnectionProfile(),
        toggleSafeMode: () => toggleSafeMode(),
        insertTextToEditor: (element) => insertTextToEditor(element.dataset.value),
        switchTab: (element) => switchTab(Number(element.dataset.tabId)),
        closeTab: (element, event) => closeTab(Number(element.dataset.tabId), event),
        deleteFavorite: (element, event) => deleteFavorite(Number(element.dataset.favoriteId), event),
        performSearch: () => performSearch(),
        renderResults: () => renderResults(),
        filterSchemaTree: () => filterSchemaTree()
    };

    document.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        const element = event.target.closest('[data-action]');
        if (!element || element.matches(':disabled')) return;
        const action = actions[element.dataset.action];
        if (action) action(element, event);
    });

    document.addEventListener('change', (event) => {
        if (!(event.target instanceof Element)) return;
        const action = actions[event.target.dataset.changeAction];
        if (action) action(event.target, event);
    });

    document.addEventListener('input', (event) => {
        if (!(event.target instanceof Element)) return;
        const action = actions[event.target.dataset.inputAction];
        if (action) action(event.target, event);
    });

    document.addEventListener('dblclick', (event) => {
        if (!(event.target instanceof Element)) return;
        const cell = event.target.closest('[data-action="editCell"]');
        if (cell) makeCellEditable(cell, Number(cell.dataset.rowIndex), cell.dataset.column);
    });
}

loadCodeMirrorAssets().then(() => {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startApp, { once: true });
    } else {
        startApp();
    }
}).catch((error) => {
    console.error(error);
    alert(`Không thể khởi động trình soạn SQL: ${error.message}`);
});
