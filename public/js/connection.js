import { state } from './state.js';
import { invokeTauri } from './tauri.js';
import { loadDynamicSchema } from './schema.js';
import { updateStatusBar } from './sidebar.js';

export function openConfigModal() {
    document.getElementById('cfgHost').value = localStorage.getItem('maximo_host') || '';
    document.getElementById('cfgContext').value = localStorage.getItem('maximo_context') || 'maximo';
    document.getElementById('cfgUser').value = localStorage.getItem('maximo_user') || '';
    document.getElementById('cfgPass').value = '';
    document.getElementById('cfgPass').placeholder = 'Để trống nếu muốn giữ mật khẩu đã lưu';
    document.getElementById('configModal').style.display = 'flex';
}

export function closeConfigModal() {
    document.getElementById('configModal').style.display = 'none';
}

export async function saveConfig() {
    const host = document.getElementById('cfgHost').value.trim();
    const context = (document.getElementById('cfgContext').value.trim() || 'maximo').replace(/^\/+|\/+$/g, '');
    const user = document.getElementById('cfgUser').value.trim();
    const pass = document.getElementById('cfgPass').value.trim();

    if (!host || !user) {
        alert('Vui lòng nhập Host và Username!');
        return;
    }

    try {
        await state.credentialMigrationPromise;
        if (pass) {
            await invokeTauri('save_connection_password', { password: pass });
        } else if (!await invokeTauri('has_connection_password')) {
            alert('Hãy nhập mật khẩu Maximo lần đầu.');
            return;
        }
    } catch (error) {
        alert('Không thể lưu mật khẩu an toàn: ' + error);
        return;
    }

    localStorage.setItem('maximo_host', host);
    localStorage.setItem('maximo_context', context);
    localStorage.setItem('maximo_user', user);
    localStorage.removeItem('maximo_pass');
    alert('Đã lưu cấu hình kết nối thành công!');
    closeConfigModal();
    updateStatusBar();
    // loadDynamicSchema();

    loadDynamicSchema(true);
}
