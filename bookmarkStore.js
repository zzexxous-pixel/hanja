// 문자 기반 저장소. migrateLegacy는 구버전 사용자 전환 기간 후 제거할 수 있습니다.
(function (global) {
    'use strict';
    const KEY = 'hanja_bookmarks_v2';
    const LEGACY_KEY = 'hanja_bookmarks';

    function createBookmarkStore(storage) {
        let characters = [];
        let hasCurrentData = false;
        try {
            const saved = JSON.parse(storage.getItem(KEY));
            if (saved && saved.schemaVersion === 2 && Array.isArray(saved.characters)) {
                characters = [...new Set(saved.characters.filter(c => typeof c === 'string' && Array.from(c).length === 1))];
                hasCurrentData = true;
            }
        } catch (_) { /* 손상되거나 접근할 수 없는 저장소에서도 학습은 계속합니다. */ }

        function persist() {
            try {
                storage.setItem(KEY, JSON.stringify({ schemaVersion: 2, characters }));
                hasCurrentData = true;
                return true;
            } catch (_) { return false; }
        }

        return {
            // TEMP: 마지막 선택 급수의 기존 정렬 순서로 인덱스를 복원합니다.
            migrateLegacy(data) {
                if (hasCurrentData) return;
                let legacy;
                try { legacy = JSON.parse(storage.getItem(LEGACY_KEY)); } catch (_) { return; }
                if (!Array.isArray(legacy)) return;
                characters = [...new Set(legacy.filter(i => Number.isInteger(i) && i >= 0 && data[i])
                    .map(i => data[i].h))];
                // 새 데이터 쓰기에 성공한 뒤에만 구버전 값을 제거합니다.
                if (persist()) {
                    try { storage.removeItem(LEGACY_KEY); } catch (_) { /* 새 형식이 우선됩니다. */ }
                }
            },
            has(character) { return characters.includes(character); },
            toggle(character) {
                if (this.has(character)) characters = characters.filter(c => c !== character);
                else characters.push(character);
                persist();
            },
            indices(data) {
                const indexByCharacter = new Map(data.map((item, index) => [item.h, index]));
                return characters.filter(c => indexByCharacter.has(c)).map(c => indexByCharacter.get(c));
            }
        };
    }
    global.createBookmarkStore = createBookmarkStore;
    if (typeof module !== 'undefined') module.exports = { createBookmarkStore };
})(typeof window !== 'undefined' ? window : globalThis);
