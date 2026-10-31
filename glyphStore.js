// Static, content-addressed batches. Only visible cards are hydrated; no per-card network requests.
(function () {
    const index = window.GLYPH_INDEX;
    const charactersByGrade = Object.fromEntries(Object.entries(index.grades).map(([grade, batches]) =>
        [grade, Object.fromEntries(batches.flatMap(n => index.members[n].map(id => [id, n]))) ]));
    const batchFor = node => charactersByGrade[node.dataset.grade][node.dataset.glyph];
    const cache = new Map();
    const pending = new Map();
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const code = c => c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    function markup(character, grade) {
        const id = code(character);
        return `<svg class="hanja-outline" data-glyph="${id}" data-grade="${grade}" data-state="loading" viewBox="0 0 1024 1024" aria-hidden="true" focusable="false"><rect x="160" y="160" width="704" height="704" rx="60" fill="#e2e8f0" opacity=".35"/></svg><span class="sr-only">${character}</span>`;
    }
    function valid(batch, number) {
        const ids = index.members[number];
        return ids.every(id => Array.isArray(batch[id]) && batch[id].length && batch[id].every(p => typeof p === 'string' && p.length && !/[<>"&]/.test(p)));
    }
    function load(number) {
        if (cache.has(number)) return Promise.resolve(cache.get(number));
        if (pending.has(number)) return pending.get(number);
        const task = (async () => {
            for (let attempt = 0; attempt < 3; attempt++) {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 8000);
                try {
                    const response = await fetch(`assets/glyphs/${index.files[number]}`, {
                        signal: controller.signal, cache: attempt ? 'reload' : 'default'
                    });
                    if (!response.ok) throw new Error('Glyph HTTP ' + response.status);
                    const batch = await response.json();
                    if (!valid(batch, number)) throw new Error('Invalid glyph batch');
                    cache.set(number, batch);
                    return batch;
                } catch (error) {
                    if (attempt === 2) throw error;
                    await sleep(250 * (attempt + 1));
                } finally { clearTimeout(timer); }
            }
        })().finally(() => pending.delete(number));
        pending.set(number, task);
        return task;
    }
    async function hydrate(root = document) {
        const nodes = [...root.querySelectorAll('.hanja-outline[data-glyph]:not([data-state="ready"])')];
        const numbers = [...new Set(nodes.map(node => batchFor(node)))];
        // Wait for all batches before a single synchronous DOM update, avoiding one-by-one illumination.
        const results = new Map(await Promise.all(numbers.map(async n => {
            try { return [n, await load(n)]; } catch (_) { return [n, null]; }
        })));
        for (const node of nodes) {
            const id = node.dataset.glyph, paths = results.get(batchFor(node))?.[id];
            if (paths) {
                node.innerHTML = `<g fill="#0f172a" transform="translate(0 900) scale(1 -1)">${paths.map(p => `<path d="${p}"/>`).join('')}</g>`;
                node.dataset.state = 'ready';
            } else {
                // Last-resort readable character, not a broken-image icon. Later online/tab revisit retries.
                node.innerHTML = `<text x="512" y="800" text-anchor="middle" font-size="850" fill="#0f172a" font-family="serif">${String.fromCodePoint(parseInt(id, 16))}</text>`;
                node.dataset.state = 'fallback';
            }
        }
    }
    window.addEventListener('online', () => hydrate());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) hydrate(); });
    window.GlyphStore = {markup, hydrate};
})();
