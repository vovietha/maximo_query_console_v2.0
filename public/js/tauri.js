import { state } from './state.js';

export function invokeTauri(command, args = {}) {
    const api = window.__TAURI__?.core;
    if (typeof api?.invoke !== 'function') {
        throw new Error('Trang này đang chạy ngoài ứng dụng Tauri. Hãy đóng trang và mở app bằng lệnh `npm run tauri dev` từ thư mục D:\\maximo_query_tauri.');
    }
    return api.invoke(command, args);
}


export async function checkForAppUpdates() {
    const hostname = window.location.hostname;
    if (hostname === '127.0.0.1' || hostname === 'localhost') return;
    const updater = window.__TAURI__?.updater;
    if (typeof updater?.check !== 'function') return;

    try {
        const update = await updater.check();
        if (!update) return;
        const shouldInstall = window.confirm(`Đã có phiên bản ${update.version}. Cài đặt và khởi động lại ứng dụng ngay?`);
        if (!shouldInstall) {
            await update.close();
            return;
        }

        const msgBox = document.getElementById('msgBox');
        if (msgBox) {
            msgBox.className = 'msg-box success';
            msgBox.style.display = 'block';
            msgBox.innerText = `Đang tải bản cập nhật ${update.version}...`;
        }
        await update.downloadAndInstall((event) => {
            if (event.event === 'Progress' && msgBox) {
                msgBox.innerText = `Đang tải bản cập nhật ${update.version}...`;
            }
        });
    } catch (error) {
        console.warn('Không thể kiểm tra hoặc cài đặt bản cập nhật:', error);
    }
}

export async function migrateLegacyPassword() {
    const legacyPassword = localStorage.getItem('maximo_pass');
    if (!legacyPassword) return;
    try {
        await invokeTauri('save_connection_password', { password: legacyPassword });
        localStorage.removeItem('maximo_pass');
    } catch (error) {
        console.error('Could not migrate the saved Maximo password:', error);
    }
}

// dark/light mode
