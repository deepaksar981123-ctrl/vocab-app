(function() {
    const views = document.querySelectorAll('.view');
    const navButtons = document.querySelectorAll('.nav-btn');
    const themeToggle = document.getElementById('theme-toggle');
    // READ: Your Google Sheet (publicly readable or accessible to your account)
    const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1eJXlxFlvBtjs28ynhjEGfs9eGGyZmUEXN9IPntjYWwc/export?format=csv&gid=0';
    // WRITE: Apps Script Web App URL (you will paste after creating it)
    const SHEET_WRITE_URL = 'https://script.google.com/macros/s/AKfycbwxb7XojgF6xSc5OpHXchve3AQn2qYoa-NwcDI82Jp9T2GuULfqCGZVxEYF_9N1BwrZ/exec';


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
        if (!q.length) return;
        const remaining = [];
        for (const op of q) {
            try {
                await fetch(SHEET_WRITE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op) });
            } catch { remaining.push(op); }
        }
        saveQueue(remaining);
        if (remaining.length === 0) toast('All pending changes synced', 'success');
        // Update badges
        setupSearch(sheetWords || []);
    }
    window.addEventListener('online', flushQueue);

    function showView(id) {
        views.forEach(v => v.classList.remove('active'));
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
        // set active button style
        navButtons.forEach(b => b.classList.toggle('active', b.dataset.target === id));
    }

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => showView(btn.dataset.target));
    });

    // Home CTA opens search list
    const homeCta = document.getElementById('home-cta');
    if (homeCta) {
        homeCta.addEventListener('click', () => showView('search'));
    }

    // theme handling
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
    
    showLoader(true);
fetch(SHEET_WRITE_URL)
    .then(res => res.json())
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
    }

    // fallback chips removed; app now relies only on Google Sheet

    function openDetails(wordOrObj) {
        const clicked = typeof wordOrObj === 'string' ? { word: wordOrObj } : (wordOrObj || {});
        const source = sheetWords || [];
        const fromSheet = source.find(x => (x.word || '').toLowerCase() === (clicked.word || '').toLowerCase());
        const data = Object.assign({
            pos: '',
            pronunciation: '',
            hindiMeaning: clicked.hindiMeaning || clicked.meaning || '',
            meaning: clicked.meaning || '',
            examples: clicked.example || '',
            mnemonic: '',
            oneLiner: '',
            uses: '',
            synonyms: clicked.synonyms || []
        }, clicked, fromSheet || {});

        document.getElementById('detail-title').textContent = data.word || '';
        document.getElementById('detail-pos').textContent = data.pos || '';
        document.getElementById('detail-pron').textContent = data.pronunciation || '';
        document.getElementById('detail-hi').textContent = data.hindiMeaning || '';
        document.getElementById('detail-en').textContent = data.meaning || '';
        document.getElementById('detail-syn').textContent = (data.synonyms && data.synonyms.length) ? `Synonyms: ${data.synonyms.join(', ')}` : '';
        document.getElementById('detail-ex').textContent = data.examples || '';
        document.getElementById('detail-mn').textContent = data.mnemonic || '';
        document.getElementById('detail-one').textContent = data.oneLiner || '';
        document.getElementById('detail-uses').textContent = data.uses || '';
        const modal = document.getElementById('detail-modal');
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        modal.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', closeDetails, { once: true }));
    }

    // New beautiful popup function
    function showWordPopup(wordOrObj) {
        const clicked = typeof wordOrObj === 'string' ? { word: wordOrObj } : (wordOrObj || {});
        const source = sheetWords || [];
        const fromSheet = source.find(x => (x.word || '').toLowerCase() === (clicked.word || '').toLowerCase());
        const data = Object.assign({
            pronunciation: '',
            hindiMeaning: clicked.hindiMeaning || clicked.meaning || '',
            meaning: clicked.meaning || '',
            example: clicked.example || '',
            synonyms: clicked.synonyms || [],
            mnemonic: clicked.mnemonic || ''
        }, clicked, fromSheet || {});

        // Set popup content
        document.getElementById('popup-word').textContent = data.word || '';
        document.getElementById('popup-pronunciation').textContent = data.pronunciation || 'Pronunciation not available';
        document.getElementById('popup-pos').textContent = data.pos || '—';
        document.getElementById('popup-hindi-meaning').textContent = data.hindiMeaning || 'Hindi meaning not available';
        document.getElementById('popup-english-meaning').textContent = data.meaning || 'English meaning not available';
        document.getElementById('popup-synonyms').textContent = (data.synonyms && data.synonyms.length) ? data.synonyms.join(', ') : 'Synonyms not available';
        document.getElementById('popup-example').textContent = data.example || 'Example not available';
        document.getElementById('popup-mnemonic').textContent = data.mnemonic || 'Mnemonic story not available';

        // Set data labels for the ::before pseudo-elements
        document.getElementById('popup-pronunciation').setAttribute('data-label', 'Pronunciation');
        document.getElementById('popup-pos').setAttribute('data-label', '');
        document.getElementById('popup-hindi-meaning').setAttribute('data-label', 'Hindi Meaning');
        document.getElementById('popup-english-meaning').setAttribute('data-label', 'English Meaning');
        document.getElementById('popup-synonyms').setAttribute('data-label', 'Synonyms');
        document.getElementById('popup-example').setAttribute('data-label', 'Example');
        document.getElementById('popup-mnemonic').setAttribute('data-label', 'Mnemonic Story');

        // Show popup
        const popup = document.getElementById('word-popup');
        popup.classList.add('show');
        popup.setAttribute('aria-hidden', 'false');

        // Enable edit/delete only for locally added words (from local cache)
        const cache = loadLocalCache();
        const isLocal = cache.some(w => (w.word || '').toLowerCase() === (data.word || '').toLowerCase());
        const deleteBtn = document.getElementById('popup-delete');
        const editBtn = document.getElementById('popup-edit');
        if (deleteBtn) deleteBtn.style.display = isLocal ? 'flex' : 'none';
        if (editBtn) editBtn.style.display = isLocal ? 'flex' : 'none';
        if (isLocal && deleteBtn) {
            deleteBtn.onclick = () => {
                const updated = cache.filter(w => (w.word || '').toLowerCase() !== (data.word || '').toLowerCase());
                saveLocalCache(updated);
                sheetWords = mergeUniqueByWord(updated.concat(sheetWords || []));
                setupSearch(sheetWords);
                closeWordPopup();
                // Queue delete for sheet
                enqueueOp({ action: 'delete', word: data.word });
                flushQueue();
            };
        }
        if (isLocal && editBtn) {
            editBtn.onclick = () => {
                // Prefill form and switch to Add Word view
                showView('add-word');
                document.getElementById('new-word').value = data.word || '';
                document.getElementById('new-pronunciation').value = data.pronunciation || '';
                document.getElementById('new-hindi-meaning').value = data.hindiMeaning || '';
                document.getElementById('new-english-meaning').value = data.meaning || '';
                document.getElementById('new-example').value = data.example || '';
                document.getElementById('new-pos').value = data.pos || '';
                document.getElementById('new-synonyms').value = (data.synonyms || []).join(', ');
                document.getElementById('new-mnemonic').value = data.mnemonic || '';

                // Store the original word to identify for update
                window._editingWord = data.word;
                closeWordPopup();
            };
        }

        // Add close event listeners
        popup.querySelectorAll('[data-close-popup]').forEach(el => {
            el.addEventListener('click', closeWordPopup, { once: true });
        });
    }

    function closeWordPopup() {
        const popup = document.getElementById('word-popup');
        popup.classList.remove('show');
        popup.setAttribute('aria-hidden', 'true');
    }

    function closeDetails() {
        const modal = document.getElementById('detail-modal');
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
    }

    function loadFromSheetCsv() {
        return new Promise((resolve, reject) => {
            if (!window.Papa || !SHEET_CSV_URL) return reject('CSV not available');
            Papa.parse(SHEET_CSV_URL, {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    const rows = results.data || [];
                    const words = rows.map(r => ({
                        word: (r['Main Word'] || '').trim(),
                        synonyms: (r['Synonyms (Comma Separated)'] || '').split(',').map(s => s.trim()).filter(Boolean),
                        pronunciation: (r['Pronunciation (उच्चारण)'] || '').trim(),
                        hindiMeaning: (r['Hindi Meaning'] || '').trim(),
                        meaning: (r['English Meaning'] || '').trim(),
                        examples: (r['Examples (Daily Life)'] || '').trim(),
                        mnemonic: (r['Mnemonic Story'] || '').trim(),
                        oneLiner: (r['One-Liner'] || '').trim(),
                        uses: (r['Uses'] || '').trim(),
                        pos: (r['Part of Speech'] || '').trim(),
                        example: (r['Examples (Daily Life)'] || '').trim()
                    })).filter(x => x.word);
                    resolve(words);
                },
                error: (err) => reject(err)
            });
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

            // Validation: prevent duplicates (only for new words, not updates)
            const isUpdate = !!window._editingWord;
            if (!newWord.word) { toast('Please enter a word', 'error'); return; }
            if (!isUpdate) {
                const exists = (sheetWords||[]).some(w => (w.word||'').toLowerCase() === newWord.word.toLowerCase());
                if (exists) { toast('This word already exists', 'error'); return; }
            }
            
            // Add to local cache and in-memory list for instant UI
            let cache = loadLocalCache();
            // If updating, remove the old version from cache first
            if (isUpdate) {
                cache = cache.filter(w => (w.word || '').toLowerCase() !== (window._editingWord || '').toLowerCase());
            }
            cache = [newWord].concat(cache.filter(w => (w.word || '').toLowerCase() !== newWord.word.toLowerCase()));
            saveLocalCache(cache);
            if (!Array.isArray(sheetWords)) sheetWords = [];
            // If updating, remove the old version from sheetWords first
            if (isUpdate) {
                sheetWords = sheetWords.filter(w => (w.word || '').toLowerCase() !== (window._editingWord || '').toLowerCase());
            }
            sheetWords = mergeUniqueByWord([newWord].concat(sheetWords));
            
            // Also persist to Google Sheet (if write endpoint configured)
            if (SHEET_WRITE_URL) {
                showLoader(true);
                const payload = isUpdate ? { action: 'update', oldWord: window._editingWord, ...newWord } : { action: 'create', ...newWord };
                fetch(SHEET_WRITE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).then(() => { toast(isUpdate ? 'Updated in Google Sheet' : 'Saved to Google Sheet', 'success'); showLoader(false); flushQueue(); })
                  .catch(() => { enqueueOp(payload); toast(isUpdate ? 'Updated locally (pending sync)' : 'Saved locally (pending sync)', 'error'); showLoader(false); });
            } else {
                const payload = isUpdate ? { action: 'update', oldWord: window._editingWord, ...newWord } : { action: 'create', ...newWord };
                enqueueOp(payload);
            }
            
            // Clear editing state
            window._editingWord = null;
            
            // Refresh search results
            setupSearch(sheetWords);
            
            // Show success message
            const successMsg = document.getElementById('add-word-success');
            successMsg.style.display = 'block';
            
            // Reset form
            wordForm.reset();
            
            // Hide success message after 3 seconds
            setTimeout(() => {
                successMsg.style.display = 'none';
            }, 3000);
            
            // Switch to search view to show the new word
            showView('search');
        });
    }
    
    // Delete support not implemented for Google Sheet; can be added via Apps Script later
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



