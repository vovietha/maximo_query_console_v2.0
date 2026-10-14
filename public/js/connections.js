import { state } from './state.js';

const CONNECTIONS_KEY = 'maximo_connection_profiles';
const ACTIVE_CONNECTION_KEY = 'maximo_active_connection_id';

function mirrorActiveConnection(profile) {
    if (!profile) {
        localStorage.removeItem('maximo_host');
        localStorage.removeItem('maximo_context');
        localStorage.removeItem('maximo_user');
        return;
    }
    localStorage.setItem('maximo_host', profile.host);
    localStorage.setItem('maximo_context', profile.context || 'maximo');
    localStorage.setItem('maximo_user', profile.username);
}

export function initializeConnections() {
    let profiles = [];
    try {
        const stored = JSON.parse(localStorage.getItem(CONNECTIONS_KEY) || '[]');
        if (Array.isArray(stored)) {
            profiles = stored.filter(profile => profile && typeof profile.id === 'string');
        }
    } catch {
        localStorage.removeItem(CONNECTIONS_KEY);
    }

    // Migrate the previous single-connection settings without moving its secret
    // out of Windows Credential Manager.
    if (profiles.length === 0) {
        const host = localStorage.getItem('maximo_host');
        const username = localStorage.getItem('maximo_user');
        if (host && username) {
            profiles.push({
                id: 'default',
                name: 'Maximo',
                host,
                context: localStorage.getItem('maximo_context') || 'maximo',
                username
            });
        }
    }

    state.connections = profiles;
    const savedActiveId = localStorage.getItem(ACTIVE_CONNECTION_KEY);
    const active = profiles.find(profile => profile.id === savedActiveId) || profiles[0] || null;
    state.activeConnectionId = active?.id || null;
    if (active) localStorage.setItem(ACTIVE_CONNECTION_KEY, active.id);
    localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(profiles));
    mirrorActiveConnection(active);
}

export function getActiveConnection() {
    const profile = state.connections.find(item => item.id === state.activeConnectionId);
    return profile ? { ...profile, profileId: profile.id } : null;
}

export function persistConnections() {
    localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(state.connections.filter(profile => !profile.draft)));
}

export function activateConnection(profileId) {
    const profile = state.connections.find(item => item.id === profileId);
    if (!profile) throw new Error('Không tìm thấy cấu hình kết nối đã chọn.');
    state.activeConnectionId = profile.id;
    localStorage.setItem(ACTIVE_CONNECTION_KEY, profile.id);
    mirrorActiveConnection(profile);
    return getActiveConnection();
}

export function createConnectionId() {
    return globalThis.crypto?.randomUUID?.() || `connection-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
