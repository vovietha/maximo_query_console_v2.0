import { state } from './state.js';

export function initTheme() {
    const savedTheme = localStorage.getItem('maximo_theme') || 'dark';
    applyTheme(savedTheme);
}

export function toggleTheme() {
    const isLight = document.body.classList.contains('light-mode');
    const newTheme = isLight ? 'dark' : 'light';
    applyTheme(newTheme);
}

export function applyTheme(theme) {
    const btn = document.getElementById('btnThemeToggle');
    if (theme === 'light') {
        document.body.classList.add('light-mode');
        if (btn) btn.innerHTML = '☀️';
        if (state.editor) state.editor.setOption('theme', 'eclipse');
    } else {
        document.body.classList.remove('light-mode');
        if (btn) btn.innerHTML = '🌙';
        if (state.editor) state.editor.setOption('theme', 'dracula');
    }
    localStorage.setItem('maximo_theme', theme);
}

// Nạp Schema từ Maximo
