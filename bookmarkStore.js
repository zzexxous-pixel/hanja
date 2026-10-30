// 신/구버전은 별도 키로 독립 동작합니다. migrateLegacy는 최초 복사만 수행하는 임시 호환 코드입니다.
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
            // TEMP: 신버전 값이 없을 때만 최초 복사합니다. 구버전은 읽기만 하며 삭제/수정/동기화하지 않습니다.
            // 마지막 선택 급수의 기존 정렬 순서로 인덱스를 복원합니다.
            migrateLegacy(data) {
                if (hasCurrentData) return;
                let legacy;
                try { legacy = JSON.parse(storage.getItem(LEGACY_KEY)); } catch (_) { return; }
                if (!Array.isArray(legacy)) return;
                characters = [...new Set(legacy.filter(i => Number.isInteger(i) && i >= 0 && data[i])
                    .map(i => data[i].h))];
                // 성공 여부와 관계없이 구버전 원본은 그대로 유지합니다.
                // 실패하면 다음 실행에서 복사를 재시도하고, 성공하면 v2가 독립적인 원본이 됩니다.
                persist();
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
