import { state } from './state.js';

document.addEventListener('DOMContentLoaded', () => {
    const findInput = document.getElementById('findInput');
    const replaceInput = document.getElementById('replaceInput');

    if (findInput) {
        findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) findPrev();
                else findNext();
            } else if (e.key === 'Escape') {
                closeSearchBar();
            }
        });
    }

    if (replaceInput) {
        replaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                doReplace();
            } else if (e.key === 'Escape') {
                closeSearchBar();
            }
        });
    }
});

export function showSearchBar(showReplace = false) {
    const bar = document.getElementById('searchReplaceBar');
    const replaceRow = document.getElementById('replaceRow');
    const findInput = document.getElementById('findInput');

    if (!bar) return;

    bar.style.display = 'flex';
    replaceRow.style.display = showReplace ? 'flex' : 'none';

    if (state.editor) {
        const selection = state.editor.getSelection().trim();
        if (selection && !selection.includes('\n')) {
            findInput.value = selection;
        }
    }

    findInput.focus();
    findInput.select();
    performSearch();
}

export function closeSearchBar() {
    const bar = document.getElementById('searchReplaceBar');
    if (bar) bar.style.display = 'none';
    clearSearchHighlights();
    if (state.editor) state.editor.focus();
}

export function toggleReplaceRow() {
    const replaceRow = document.getElementById('replaceRow');
    const isHidden = replaceRow.style.display === 'none';
    replaceRow.style.display = isHidden ? 'flex' : 'none';
}

export function toggleSearchOption(type) {
    if (type === 'case') {
        state.searchState.caseSensitive = !state.searchState.caseSensitive;
        document.getElementById('optMatchCase').classList.toggle('active', state.searchState.caseSensitive);
    } else if (type === 'word') {
        state.searchState.wholeWord = !state.searchState.wholeWord;
        document.getElementById('optWholeWord').classList.toggle('active', state.searchState.wholeWord);
    } else if (type === 'regex') {
        state.searchState.regex = !state.searchState.regex;
        document.getElementById('optRegex').classList.toggle('active', state.searchState.regex);
    }
    performSearch();
}

export function clearSearchHighlights() {
    state.searchState.markers.forEach(m => m.clear());
    state.searchState.markers = [];
    state.searchState.matches = [];
    state.searchState.currentIndex = -1;
}

export function performSearch() {
    clearSearchHighlights();
    const query = document.getElementById('findInput').value;
    const countLabel = document.getElementById('searchCount');

    if (!query || !state.editor) {
        if (countLabel) countLabel.innerText = '0 results';
        return;
    }

    const doc = state.editor.getDoc();
    const text = doc.getValue();
    let pattern;

    try {
        let flags = state.searchState.caseSensitive ? 'g' : 'gi';
        let escapedQuery = state.searchState.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (state.searchState.wholeWord) {
            escapedQuery = `\\b${escapedQuery}\\b`;
        }
        pattern = new RegExp(escapedQuery, flags);
    } catch (e) {
        if (countLabel) countLabel.innerText = 'Invalid Regex';
        return;
    }

    let match;
    const matches = [];

    while ((match = pattern.exec(text)) !== null) {
        if (match[0].length === 0) break;
        const from = doc.posFromIndex(match.index);
        const to = doc.posFromIndex(match.index + match[0].length);
        matches.push({ from, to });
    }

    state.searchState.matches = matches;

    if (matches.length > 0) {
        const cursor = doc.getCursor();
        const cursorIndex = doc.indexFromPos(cursor);
        let closestIdx = 0;

        for (let i = 0; i < matches.length; i++) {
            if (doc.indexFromPos(matches[i].from) >= cursorIndex) {
                closestIdx = i;
                break;
            }
        }
        state.searchState.currentIndex = closestIdx;
        updateHighlights();
    } else {
        if (countLabel) countLabel.innerText = '0 results';
    }
}

export function updateHighlights() {
    state.searchState.markers.forEach(m => m.clear());
    state.searchState.markers = [];

    const doc = state.editor.getDoc();
    const countLabel = document.getElementById('searchCount');
    const matches = state.searchState.matches;

    if (matches.length === 0) {
        if (countLabel) countLabel.innerText = '0 results';
        return;
    }

    matches.forEach((m, idx) => {
        const isCurrent = idx === state.searchState.currentIndex;
        const className = isCurrent ? 'cm-search-highlight cm-search-highlight-active' : 'cm-search-highlight';
        const marker = doc.markText(m.from, m.to, { className });
        state.searchState.markers.push(marker);
    });

    if (countLabel) {
        countLabel.innerText = `${state.searchState.currentIndex + 1} of ${matches.length}`;
    }

    if (state.searchState.currentIndex >= 0 && state.searchState.currentIndex < matches.length) {
        const currentMatch = matches[state.searchState.currentIndex];
        state.editor.scrollIntoView({ from: currentMatch.from, to: currentMatch.to }, 80);
    }
}

export function findNext() {
    if (state.searchState.matches.length === 0) return;
    state.searchState.currentIndex = (state.searchState.currentIndex + 1) % state.searchState.matches.length;
    updateHighlights();
}

export function findPrev() {
    if (state.searchState.matches.length === 0) return;
    state.searchState.currentIndex = (state.searchState.currentIndex - 1 + state.searchState.matches.length) % state.searchState.matches.length;
    updateHighlights();
}

export function doReplace() {
    if (state.searchState.currentIndex < 0 || state.searchState.matches.length === 0) return;
    const replaceText = document.getElementById('replaceInput').value;
    const match = state.searchState.matches[state.searchState.currentIndex];

    state.editor.replaceRange(replaceText, match.from, match.to);
    performSearch();
}

export function doReplaceAll() {
    if (state.searchState.matches.length === 0) return;
    const replaceText = document.getElementById('replaceInput').value;

    state.editor.operation(() => {
        for (let i = state.searchState.matches.length - 1; i >= 0; i--) {
            const m = state.searchState.matches[i];
            state.editor.replaceRange(replaceText, m.from, m.to);
        }
    });
    performSearch();
}
