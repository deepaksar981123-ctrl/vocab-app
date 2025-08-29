(function() {
    const views = document.querySelectorAll('.view');
    const navButtons = document.querySelectorAll('.nav-btn');
    const themeToggle = document.getElementById('theme-toggle');

    // ✅ Correct URLs
    const SHEET_WRITE_URL = 'https://script.google.com/macros/s/AKfycbwwA0PAmRZQxtM_mBS6t3E9pwBzOzOWiFsyTtFC9Hymz5oyw_lMXdn-h1Rth8Fszko/exec';
    const SHEET_CSV_URL = SHEET_WRITE_URL; // Now reading from the same Apps Script endpoint

    let sheetWords = null;

    // Queue for offline/failed operations
    const QUEUE_KEY = 'pendingOps';
    function loadQueue() {
        try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
    }
    function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
    async function flushQueue() {
        if (!SHEET_WRITE_URL) return;
        let q = loadQueue();
        if (!q.length) {
            console.log('flushQueue: Queue is empty, nothing to sync.');
            return;
        }
        console.log(`flushQueue: Attempting to sync ${q.length} pending operations.`);
        const remaining = [];
        for (const op of q) {
            try {
                console.log('flushQueue: Sending operation:', op);
                await fetch(SHEET_WRITE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op) });
                console.log('flushQueue: Operation sent successfully:', op);
            } catch (error) {
                console.error('flushQueue: Failed to send operation:', op, error);
                remaining.push(op);
            }
        }
        saveQueue(remaining);
        if (remaining.length === 0) toast('All pending changes synced', 'success');
        else toast(`${remaining.length} changes still pending sync`, 'error');
        setupSearch(sheetWords || []);
    }
    window.addEventListener('online', flushQueue);

    function showView(id) {
        views.forEach(v => v.classList.remove('active'));
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
        navButtons.forEach(b => b.classList.toggle('active', b.dataset.target === id));
    }

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => showView(btn.dataset.target));
    });

    const homeCta = document.getElementById('home-cta');
    if (homeCta) {
        homeCta.addEventListener('click', () => showView('search'));
    }

    initTheme();
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const next = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
            setTheme(next);
        });
    }

    // Load order: Google Sheet + local cache merge
    const localCache = loadLocalCache();
    showLoader(true);
    loadFromSheetCsv()
        .then(words => {
            sheetWords = mergeUniqueByWord(localCache.concat(words));
            setupSearch(sheetWords);
            showLoader(false);
            toast('Loaded words from Google Sheet', 'success');
        })
        .catch(() => {
            sheetWords = localCache;
            setupSearch(sheetWords);
            showLoader(false);
            toast('Offline mode — showing saved words', 'error');
        });

    function setupSearch(words) {
        const input = document.getElementById('search-input');
        const results = document.getElementById('search-results');
        const render = items => {
            results.innerHTML = '';
            items.slice(0, 50).forEach((w, i) => {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.style.setProperty('--stagger', `${i * 40}ms`);
                const status = getSyncStatus(w.word);
                div.innerHTML = `
                    <div class="word-header">
                        <div class="word">${w.word}</div>
                        <span class="badge">${w.pos || ''}</span>
                        <span class="sync ${status}">${status === 'synced' ? '✅' : '🔄'}</span>
                    </div>
                `;
                div.addEventListener('click', () => showWordPopup(w));
                results.appendChild(div);
            });
        };
        render(words);

        input.addEventListener('input', () => {
            const q = input.value.trim().toLowerCase();
            if (!q) return render(words);
            const filtered = words.filter(w =>
                (w.word && w.word.toLowerCase().includes(q)) ||
                (w.meaning && w.meaning.toLowerCase().includes(q)) ||
                (Array.isArray(w.synonyms) && w.synonyms.some(s => s.toLowerCase().includes(q)))
            );
            render(filtered);
        });

        // Event listener for delete buttons
        // Removed delete buttons from here as per user request
    }

    function loadFromSheetCsv() {
        return new Promise(async (resolve, reject) => {
            if (!SHEET_CSV_URL) return reject('Sheet URL not available');

            try {
                const response = await fetch(SHEET_CSV_URL);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const json = await response.json();
                if (json.result === 'success' && Array.isArray(json.words)) {
                    const words = json.words.map(r => ({
                        word: r.word || '',
                        synonyms: Array.isArray(r.synonyms) ? r.synonyms : (r.synonyms || '').split(',').map(s => s.trim()).filter(Boolean),
                        pronunciation: r.pronunciation || '',
                        hindiMeaning: r.hindiMeaning || '',
                        meaning: r.meaning || '',
                        example: r.example || '',
                        mnemonic: r.mnemonic || '',
                        oneLiner: r.oneLiner || '',
                        uses: r.uses || '',
                        pos: r.pos || '',
                    })).filter(x => x.word);
                    resolve(words);
                } else {
                    reject('Invalid data format from Google Sheet');
                }
            } catch (err) {
                console.error('Error loading words from Apps Script:', err);
                reject(err);
            }
        });
    }

    function showLoader(flag) {
        const el = document.getElementById('loader');
        if (!el) return;
        if (flag) { el.classList.remove('hidden'); el.setAttribute('aria-hidden','false'); }
        else { el.classList.add('hidden'); el.setAttribute('aria-hidden','true'); }
    }

    function toast(msg, type) {
        const host = document.getElementById('toasts');
        if (!host) return;
        const t = document.createElement('div');
        t.className = `toast ${type||''}`;
        t.textContent = msg;
        host.appendChild(t);
        setTimeout(() => { t.remove(); }, 3000);
    }

    function loadLocalCache() {
        try {
            const raw = localStorage.getItem('userWords');
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function saveLocalCache(words) {
        localStorage.setItem('userWords', JSON.stringify(words));
    }

    function mergeUniqueByWord(list) {
        const seen = new Set();
        const result = [];
        for (const w of list) {
            const key = (w.word || '').toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            result.push(w);
        }
        return result;
    }

    function enqueueOp(op) {
        const q = loadQueue();
        q.push(op);
        saveQueue(q);
    }

    function getSyncStatus(word) {
        const q = loadQueue();
        const pending = q.some(op => (op.word || '').toLowerCase() === (word || '').toLowerCase());
        return pending ? 'pending' : 'synced';
    }

    // New Beautiful Word Popup Logic
    const wordPopup = document.getElementById('word-popup');
    const popupWord = document.getElementById('popup-word');
    const popupPos = document.getElementById('popup-pos');
    const popupPronunciation = document.getElementById('popup-pronunciation');
    const popupHindiMeaning = document.getElementById('popup-hindi-meaning');
    const popupEnglishMeaning = document.getElementById('popup-english-meaning');
    const popupSynonyms = document.getElementById('popup-synonyms');
    const popupExample = document.getElementById('popup-example');
    const popupMnemonic = document.getElementById('popup-mnemonic');
    const popupDelete = document.getElementById('popup-delete');
    const popupEdit = document.getElementById('popup-edit');

    function showWordPopup(wordData) {
        if (!wordPopup) return;
        
        popupWord.textContent = wordData.word || '—';
        popupPos.textContent = wordData.pos || '—';
        popupPronunciation.textContent = wordData.pronunciation || '—';
        popupHindiMeaning.textContent = wordData.hindiMeaning || '—';
        popupEnglishMeaning.textContent = wordData.meaning || '—';
        popupSynonyms.textContent = (wordData.synonyms && wordData.synonyms.length > 0) ? wordData.synonyms.join(', ') : '—';
        popupExample.textContent = wordData.example || '—';
        popupMnemonic.textContent = wordData.mnemonic || '—';

        wordPopup.classList.add('show');
        wordPopup.setAttribute('aria-hidden', 'false');

        // Store current word for edit/delete operations
        window._currentWordData = wordData;
    }

    function closeWordPopup() {
        if (!wordPopup) return;
        wordPopup.classList.remove('show');
        wordPopup.setAttribute('aria-hidden', 'true');
        window._currentWordData = null; // Clear stored word data
    }

    async function deleteWord(wordToDelete) {
        if (!confirm(`Are you sure you want to delete "${wordToDelete}"?`)) {
            return;
        }

        showLoader(true);
        const payload = { action: 'delete', word: wordToDelete };
        console.log('deleteWord: Sending delete payload:', payload); // Added console.log
        
        try {
            const response = await fetch(SHEET_WRITE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            console.log('deleteWord: Received response:', result); // Added console.log

            if (result.result === 'success') {
                toast(`"${wordToDelete}" deleted successfully from Google Sheet`, 'success');
                // Remove from local cache and sheetWords array
                let cache = loadLocalCache();
                cache = cache.filter(w => (w.word || '').toLowerCase() !== wordToDelete.toLowerCase());
                saveLocalCache(cache);

                if (Array.isArray(sheetWords)) {
                    sheetWords = sheetWords.filter(w => (w.word || '').toLowerCase() !== wordToDelete.toLowerCase());
                }
                setupSearch(sheetWords); // Re-render the list
            } else {
                toast(`Failed to delete "${wordToDelete}": ${result.message}`, 'error');
                enqueueOp(payload); // Enqueue for retry if deletion failed on server
            }
        } catch (error) {
            console.error('Error deleting word:', error);
            toast(`Failed to delete "${wordToDelete}" (offline/network error)`, 'error');
            enqueueOp(payload); // Enqueue for retry
        }
        showLoader(false);
        closeWordPopup();
    }


    // Add event listeners for closing the popup
    document.querySelectorAll('[data-close-popup]').forEach(btn => {
        btn.addEventListener('click', closeWordPopup);
    });

    // Add event listener for the popup delete button
    if (popupDelete) {
        popupDelete.addEventListener('click', () => {
            if (window._currentWordData && window._currentWordData.word) {
                deleteWord(window._currentWordData.word);
            }
        });
    }

    // Add Word Form Handling
    const wordForm = document.getElementById('word-form');
    if (wordForm) {
        wordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const newWord = {
                word: document.getElementById('new-word').value.trim(),
                pronunciation: document.getElementById('new-pronunciation').value.trim(),
                hindiMeaning: document.getElementById('new-hindi-meaning').value.trim(),
                meaning: document.getElementById('new-english-meaning').value.trim(),
                example: document.getElementById('new-example').value.trim(),
                pos: document.getElementById('new-pos').value,
                synonyms: document.getElementById('new-synonyms').value.split(',').map(s => s.trim()).filter(Boolean),
                mnemonic: document.getElementById('new-mnemonic').value.trim()
            };
            const isUpdate = !!window._editingWord;
            if (!newWord.word) { toast('Please enter a word', 'error'); return; }
            if (!isUpdate) {
                const exists = (sheetWords||[]).some(w => (w.word||'').toLowerCase() === newWord.word.toLowerCase());
                if (exists) { toast('This word already exists', 'error'); return; }
            }
            let cache = loadLocalCache();
            if (isUpdate) {
                cache = cache.filter(w => (w.word || '').toLowerCase() !== (window._editingWord || '').toLowerCase());
            }
            cache = [newWord].concat(cache.filter(w => (w.word || '').toLowerCase() !== newWord.word.toLowerCase()));
            saveLocalCache(cache);
            if (!Array.isArray(sheetWords)) sheetWords = [];
            if (isUpdate) {
                sheetWords = sheetWords.filter(w => (w.word || '').toLowerCase() !== (window._editingWord || '').toLowerCase());
            }
            sheetWords = mergeUniqueByWord([newWord].concat(sheetWords));
            if (SHEET_WRITE_URL) {
                showLoader(true);
                const payload = isUpdate ? { action: 'update', oldWord: window._editingWord, ...newWord } : { action: 'create', ...newWord };
                fetch(SHEET_WRITE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' }, // Changed from application/json
                    body: JSON.stringify(payload)
                }).then(() => { toast(isUpdate ? 'Updated in Google Sheet' : 'Saved to Google Sheet', 'success'); showLoader(false); flushQueue(); })
                  .catch(() => { enqueueOp(payload); toast(isUpdate ? 'Updated locally (pending sync)' : 'Saved locally (pending sync)', 'error'); showLoader(false); });
            } else {
                const payload = isUpdate ? { action: 'update', oldWord: window._editingWord, ...newWord } : { action: 'create', ...newWord };
                enqueueOp(payload);
            }
            window._editingWord = null;
            setupSearch(sheetWords);
            const successMsg = document.getElementById('add-word-success');
            successMsg.style.display = 'block';
            wordForm.reset();
            setTimeout(() => { successMsg.style.display = 'none'; }, 3000);
            showView('search');
        });
    }
})();

function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
        setTheme(saved);
        return;
    }
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
}

function setTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem('theme', mode);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = (mode === 'dark') ? '☀️' : '🌙';
}
