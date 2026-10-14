import { state } from './state.js';
import { invokeTauri } from './tauri.js';
import { loadDynamicSchema } from './schema.js';
import { updateStatusBar } from './sidebar.js';
import { activateConnection, createConnectionId, persistConnections } from './connections.js';

function renderConnectionProfiles(selectedId = state.editingConnectionId) {
    const select = document.getElementById('cfgProfileSelect');
    if (!select) return;
    select.innerHTML = state.connections.map(profile => {
        const activeLabel = profile.id === state.activeConnectionId ? ' (đang kết nối)' : '';
        const label = `${profile.name || profile.host || 'Cấu hình mới'}${activeLabel}`;
        return `<option value="${escapeAttribute(profile.id)}">${escapeHtml(label)}</option>`;
    }).join('');
    if (selectedId && state.connections.some(profile => profile.id === selectedId)) {
        select.value = selectedId;
    }
    const deleteButton = document.getElementById('btnDeleteConnection');
    if (deleteButton) deleteButton.disabled = state.connections.length === 0;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function escapeAttribute(value) {
    return escapeHtml(value);
}

function populateConnectionForm(profile) {
    document.getElementById('cfgName').value = profile?.name || '';
    document.getElementById('cfgHost').value = profile?.host || '';
    document.getElementById('cfgContext').value = profile?.context || 'maximo';
    document.getElementById('cfgUser').value = profile?.username || '';
    const password = document.getElementById('cfgPass');
    password.value = '';
    password.placeholder = profile?.draft ? 'Nhập mật khẩu Maximo' : 'Để trống nếu muốn giữ mật khẩu đã lưu';
}

export function openConfigModal() {
    if (state.connections.length === 0) newConnectionProfile();
    state.editingConnectionId = state.activeConnectionId || state.connections[0]?.id;
    renderConnectionProfiles();
    populateConnectionForm(state.connections.find(profile => profile.id === state.editingConnectionId));
    document.getElementById('configModal').style.display = 'flex';
}

export function closeConfigModal() {
    document.getElementById('configModal').style.display = 'none';
}

export function selectConnectionProfile(profileId) {
    state.editingConnectionId = profileId;
    renderConnectionProfiles(profileId);
    populateConnectionForm(state.connections.find(profile => profile.id === profileId));
}

export function newConnectionProfile() {
    const profile = {
        id: createConnectionId(),
        name: '',
        host: '',
        context: 'maximo',
        username: '',
        draft: true
    };
    state.connections.push(profile);
    state.editingConnectionId = profile.id;
    renderConnectionProfiles(profile.id);
    populateConnectionForm(profile);
    document.getElementById('cfgName').focus();
}

export async function deleteConnectionProfile() {
    const profile = state.connections.find(item => item.id === state.editingConnectionId);
    if (!profile) return;
    if (!confirm(`Xóa cấu hình “${profile.name || profile.host || 'chưa đặt tên'}”?`)) return;

    if (!profile.draft) {
        try {
            await invokeTauri('delete_connection_password', { profileId: profile.id });
        } catch (error) {
            alert('Không thể xóa mật khẩu đã lưu an toàn: ' + error);
            return;
        }
    }

    state.connections = state.connections.filter(item => item.id !== profile.id);
    persistConnections();
    if (state.activeConnectionId === profile.id) {
        const nextProfile = state.connections.find(item => !item.draft);
        if (nextProfile) activateConnection(nextProfile.id);
        else {
            state.activeConnectionId = null;
            localStorage.removeItem('maximo_active_connection_id');
            for (const key of ['maximo_host', 'maximo_context', 'maximo_user']) localStorage.removeItem(key);
        }
    }

    if (state.connections.length === 0) {
        newConnectionProfile();
    } else {
        selectConnectionProfile(state.connections[0].id);
    }
    updateStatusBar();
}

export async function saveConfig() {
    const profileId = state.editingConnectionId;
    const profile = state.connections.find(item => item.id === profileId);
    if (!profile) {
        alert('Hãy chọn hoặc tạo cấu hình kết nối.');
        return;
    }

    const name = document.getElementById('cfgName').value.trim();
    const host = document.getElementById('cfgHost').value.trim();
    const context = (document.getElementById('cfgContext').value.trim() || 'maximo').replace(/^\/+|\/+$/g, '');
    const username = document.getElementById('cfgUser').value.trim();
    const password = document.getElementById('cfgPass').value;

    if (!name || !host || !username) {
        alert('Vui lòng nhập Tên cấu hình, Host và Username!');
        return;
    }

    try {
        await state.credentialMigrationPromise;
        if (password) {
            await invokeTauri('save_connection_password', { profileId, password });
        } else if (!await invokeTauri('has_connection_password', { profileId })) {
            alert('Hãy nhập mật khẩu Maximo cho cấu hình này.');
            return;
        }
    } catch (error) {
        alert('Không thể lưu mật khẩu an toàn: ' + error);
        return;
    }

    Object.assign(profile, { name, host, context, username, draft: false });
    persistConnections();
    activateConnection(profileId);
    state.editingConnectionId = profileId;
    renderConnectionProfiles(profileId);
    alert(`Đã kết nối với “${name}”.`);
    closeConfigModal();
    updateStatusBar();
    await loadDynamicSchema(true);
}
