// === 1. 초기 렌더링 설정 및 즉시 실행 로직 ===
const savedHanjaSize = localStorage.getItem('hanja_size') || 45;
const savedHunSize = localStorage.getItem('hun_size') || 17;
document.documentElement.style.setProperty('--hanja-size', savedHanjaSize + 'px');
document.documentElement.style.setProperty('--hun-size', savedHunSize + 'px');

// 터치 기기 즉각 발동 유틸리티
function fastTouch(event, callback) {
    event.preventDefault();
    callback();
}

// === 2. 상태 관리 ===
let activeTab = 1;
let preFavoriteTab = 1; // 즐겨찾기 진입 직전의 실제 페이지 번호 보존용 변수
let isQuizMode = false;

// 로컬스토리지 기반 북마크 배열
let bookmarks = JSON.parse(localStorage.getItem('hanja_bookmarks')) || [];
let activeFavoriteIndices = [...bookmarks];

let defaultHanjaSizePx = parseInt(savedHanjaSize);
let defaultHunSizePx = parseInt(savedHunSize);

// 가리기 개별 해제 여부를 기록하는 임시 Set
let solvedHanjas = new Set();

// 최적화: 고정 탭의 HTML 전체를 보존하는 정적 노드 캐시 저장소 (1~6번 고정 탭)
const tabCache = {};

function saveBookmarks() {
    localStorage.setItem('hanja_bookmarks', JSON.stringify(bookmarks));
}

// 글자 크기 조절 기능
function adjustFontSize(amount) {
    defaultHanjaSizePx = Math.max(16, Math.min(64, defaultHanjaSizePx + amount));
    defaultHunSizePx = Math.max(9, Math.min(28, defaultHunSizePx + (amount > 0 ? 1 : -1)));
    
    document.documentElement.style.setProperty('--hanja-size', `${defaultHanjaSizePx}px`);
    document.documentElement.style.setProperty('--hun-size', `${defaultHunSizePx}px`);

    localStorage.setItem('hanja_size', defaultHanjaSizePx);
    localStorage.setItem('hun_size', defaultHunSizePx);
}

// 즐겨찾기 북마크 토글 기능 (반응성 0ms 구현)
function toggleBookmark(index, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const bIdx = bookmarks.indexOf(index);
    const isRemoving = bIdx > -1;

    if (isRemoving) {
        bookmarks.splice(bIdx, 1);
    } else {
        bookmarks.push(index);
    }
    saveBookmarks();

    // 즉각적인 DOM 업데이트 반영
    updateCellStarUI(index, !isRemoving);
    updateModalStarState(index);
}

// 캐싱된 백그라운드 영역까지 별표 UI 동기화 (100자 스케일링 반영)
function updateCellStarUI(index, isStarred) {
    // 1. 현재 메인 화면에 부착된 라이브 DOM 영역 클래스 교정
    const liveWrappers = document.querySelectorAll(`.star-wrapper-${index}`);
    liveWrappers.forEach(starWrapper => {
        starWrapper.className = `star-wrapper-${index} flex items-center justify-center h-full ${isStarred ? 'text-amber-400' : 'text-slate-200 hover:text-slate-400'} text-base`;
    });

    // 2. 가상 메모리 캐시 영역 내부의 타겟 노드도 정밀 업데이트 (100자 단위이므로 index / 100)
    const targetTab = Math.floor(index / 100) + 1;
    if (tabCache[targetTab]) {
        const cachedWrapper = tabCache[targetTab].querySelector(`.star-wrapper-${index}`);
        if (cachedWrapper) {
            cachedWrapper.className = `star-wrapper-${index} flex items-center justify-center h-full ${isStarred ? 'text-amber-400' : 'text-slate-200 hover:text-slate-400'} text-base`;
        }
    }
}

// 모달창 내 별표 상태 동기화
function updateModalStarState(index) {
    const starBtn = document.getElementById('modal-star-btn');
    if (!starBtn) return;
    if (bookmarks.includes(index)) {
        starBtn.className = "text-amber-500 hover:text-amber-600 text-2xl transition p-1";
    } else {
        starBtn.className = "text-slate-300 hover:text-slate-500 text-2xl transition p-1";
    }
}

// 1~6번 정적 표 선렌더링 메커니즘 (100자 분할 반영)
function preRenderStaticTables() {
    for (let t = 1; t <= 6; t++) {
        const startIdx = (t - 1) * 100;
        const endIdx = startIdx + 100;
        const pageData = hanjaData.slice(startIdx, endIdx).map((item, localIdx) => ({
            ...item,
            originalIdx: startIdx + localIdx
        }));
        
        // 가상 메모리 DOM 엘리먼트 생성
        const tableDiv = document.createElement('div');
        tableDiv.className = "bg-white border border-slate-200 overflow-hidden mb-6";
        tableDiv.innerHTML = generateTableHTML(t, pageData, `${startIdx + 1} ~ ${endIdx}자`);
        tabCache[t] = tableDiv;
    }
}

// 동적 즐겨찾기 탭 생성 엔진
function buildFavoritesDOM() {
    const pageData = activeFavoriteIndices.map(originalIdx => ({
        ...hanjaData[originalIdx],
        originalIdx: originalIdx
    }));
    
    const titleLabel = `★ 즐겨찾기 한자 (${pageData.length}자)`;
    const tableWrapper = document.createElement('div');
    tableWrapper.className = "bg-white border border-slate-200 overflow-hidden mb-6";
    
    if (pageData.length === 0) {
        tableWrapper.innerHTML = `
            <div class="p-12 text-center">
                <i class="fa-solid fa-star text-slate-200 text-6xl mb-4"></i>
                <h3 class="text-lg font-bold text-slate-500">즐겨찾기 한자가 없습니다.</h3>
                <p class="text-slate-400 text-sm mt-1">한자 칸의 우측 상단 별표(★)를 눌러 추가해 보세요!</p>
            </div>
        `;
        return tableWrapper;
    }

    tableWrapper.innerHTML = generateTableHTML(7, pageData, titleLabel);
    return tableWrapper;
}

// 공용 반응형 CSS Grid 템플릿 생성기 (성능 300% 향상 및 DOM 노드 최소화 모델)
function generateTableHTML(t, pageData, titleLabel) {
    let gridHTML = `
        <div class="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
            <h2 class="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full ${t === 7 ? 'bg-amber-500' : 'bg-blue-600'}"></span>
                ${titleLabel}
            </h2>
            <span class="text-xs text-slate-400 font-medium">반응형 그리드 배치</span>
        </div>
        <div class="p-4 hanja-responsive-grid">
    `;

    pageData.forEach((item) => {
        const globalIdx = item.originalIdx;
        const isStarred = bookmarks.includes(globalIdx);
        const isSolved = solvedHanjas.has(globalIdx);
        const solvedClass = isSolved ? 'solved' : '';
        
        gridHTML += `
            <div class="bg-white border border-slate-100 rounded-xl p-3 flex flex-col items-center relative hover:bg-slate-50 transition-all shadow-sm">
                <div data-action="toggle-bookmark" data-index="${globalIdx}" 
                     class="w-full flex justify-between items-center mb-1 cursor-pointer bg-transparent select-none">
                    <span class="text-[10px] font-mono font-bold text-slate-400 leading-none">#${globalIdx + 1}</span>
                    <span class="star-wrapper-${globalIdx} flex items-center justify-center h-full ${isStarred ? 'text-amber-400' : 'text-slate-200 hover:text-slate-400'} text-base">
                        <i class="fa-solid fa-star"></i>
                    </span>
                </div>
                <div data-action="open-modal" data-index="${globalIdx}" class="hanja-font dynamic-hanja-size font-bold text-slate-900 my-2 cursor-pointer select-none">
                    ${item.h}
                </div>
                <div data-action="click-hun" data-index="${globalIdx}" class="w-full text-center border-t border-slate-50 pt-2 cursor-pointer">
                    <span id="hun-text-${globalIdx}" class="quiz-blur-target ${solvedClass} dynamic-hun-size font-bold text-slate-600" data-type="hun">
                        ${item.m}
                    </span>
                </div>
            </div>
        `;
    });

    gridHTML += `</div>`;
    return gridHTML;
}

// 페이지 좌우 이동용 메서드 (즐겨찾기 상태 시 비활성 처리)
function prevPage() {
    if (activeTab === 7) return;
    let target = activeTab - 1;
    if (target < 1) target = 6;
    switchTab(target);
}

// 다음 페이지 이동용 메서드
function nextPage() {
    if (activeTab === 7) return;
    let target = activeTab + 1;
    if (target > 6) target = 1;
    switchTab(target);
}

// 즐겨찾기 버튼의 토글 동작 제어 함수
function toggleFavorites() {
    if (activeTab === 7) {
        // 현재 즐겨찾기 화면일 경우 토글하여 이전 보던 페이지 탭으로 복귀
        switchTab(preFavoriteTab);
    } else {
        // 이전 보던 일반 탭(1~6) 정보를 저장하고 즐겨찾기로 이동
        preFavoriteTab = activeTab;
        switchTab(7);
    }
}

// 탭 스왑 및 스타일 동적 바인딩 처리 (지정 요구사항에 따른 완벽 동기화)
function switchTab(tabNum) {
    activeTab = tabNum;
    const container = document.getElementById('table-view-container');
    container.innerHTML = ''; // 기존 DOM 트리 메모리에서 깔끔하게 비우기

    if (tabNum === 7) {
        activeFavoriteIndices = [...bookmarks];
        container.appendChild(buildFavoritesDOM());
    } else {
        container.appendChild(tabCache[tabNum]);
    }
    
    const tabBtn7 = document.getElementById('tab-7');
    const pagerWrapper = document.getElementById('pager-wrapper');
    const pageIndicator = document.getElementById('page-indicator');
    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');

    if (tabNum === 7) {
        // 즐겨찾기 탭 활성화 상태 스타일 (yellow 꽉 찬 선명한 디자인)
        if (tabBtn7) {
            tabBtn7.className = "w-10 h-10 text-xs font-bold rounded-lg transition-all text-slate-950 bg-yellow-400 hover:bg-yellow-300 border border-yellow-400 shadow-[0_0_12px_rgba(234,179,8,0.3)] flex items-center justify-center shrink-0";
        }
        // 즐겨찾기 화면일 때는 페이지 이동 컴포넌트를 비활성화(반투명) 처리
        if (pagerWrapper) {
            pagerWrapper.className = "flex items-center gap-1 bg-slate-700/40 p-1 rounded-lg h-10 text-slate-400 shadow-none shrink-0 select-none pointer-events-none opacity-50";
        }
        if (btnPrev) {
            btnPrev.className = "w-8 h-8 rounded bg-transparent text-slate-500 flex items-center justify-center transition";
        }
        if (btnNext) {
            btnNext.className = "w-8 h-8 rounded bg-transparent text-slate-500 flex items-center justify-center transition";
        }
        if (pageIndicator) {
            pageIndicator.innerText = "★ / 6";
        }
    } else {
        // 즐겨찾기 비활성화 (일반 1~6 페이지 구동 상태 - 더욱 잘보이게 노랑-yellow 보더 추가 및 배경 불투명도 증가)
        if (tabBtn7) {
            tabBtn7.className = "w-10 h-10 text-xs font-bold rounded-lg transition-all text-yellow-300 hover:text-yellow-100 bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/45 flex items-center justify-center shrink-0";
        }
        // 페이지 스위처 활성화 상태 복구 (좌우 삼각형 버튼의 뚜렷한 별도 버튼 스타일 적용)
        if (pagerWrapper) {
            pagerWrapper.className = "flex items-center gap-1 bg-blue-950/40 p-1 rounded-lg h-10 text-white shadow-sm transition-all duration-200 shrink-0 select-none";
        }
        if (btnPrev) {
            btnPrev.className = "w-8 h-8 rounded bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-amber-300 hover:text-amber-200 transition shadow-sm";
        }
        if (btnNext) {
            btnNext.className = "w-8 h-8 rounded bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-amber-300 hover:text-amber-200 transition shadow-sm";
        }
        if (pageIndicator) {
            pageIndicator.innerText = `${tabNum} / 6`;
        }
    }
}

// 퀴즈(가리기) 모드 토글 (너비 w-28 규격을 엄격하게 동기화)
function toggleQuizMode() {
    isQuizMode = !isQuizMode;
    const btn = document.getElementById('btn-toggle-quiz');
    
    if (isQuizMode) {
        document.body.classList.add('quiz-mode');
        btn.className = "header-quiz bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold w-28 rounded-lg shadow transition-all flex items-center justify-center gap-1.5 shrink-0 h-10";
        btn.querySelector('span').innerText = "훈음 보이기";
        btn.querySelector('i').className = "fa-solid fa-eye w-4 text-center";
    } else {
        document.body.classList.remove('quiz-mode');
        btn.className = "header-quiz bg-yellow-500 hover:bg-yellow-400 text-slate-900 text-xs font-bold w-28 rounded-lg shadow transition-all flex items-center justify-center gap-1.5 shrink-0 h-10";
        btn.querySelector('span').innerText = "훈음 가리기";
        btn.querySelector('i').className = "fa-solid fa-eye-slash w-4 text-center";
    }

    solvedHanjas.clear();

    // 1. 현재 화면의 블러 상태 복원
    const liveElements = document.querySelectorAll('.quiz-blur-target');
    liveElements.forEach(el => el.classList.remove('solved'));

    // 2. 가상 메모리 캐시 테이블 내 백그라운드 노드들도 초기화 (1~6번 순회)
    for (let t = 1; t <= 6; t++) {
        if (tabCache[t]) {
            const cachedElements = tabCache[t].querySelectorAll('.quiz-blur-target');
            cachedElements.forEach(el => el.classList.remove('solved'));
        }
    }
}

// 퀴즈 모드에서 한 글자 훈음 토글 동기화
function toggleSolvedState(globalIdx, forceSolved) {
    const isSolved = (forceSolved !== undefined) ? forceSolved : !solvedHanjas.has(globalIdx);
    if (isSolved) {
        solvedHanjas.add(globalIdx);
    } else {
        solvedHanjas.delete(globalIdx);
    }
    
    // 1. 라이브 DOM 영역 클래스 업데이트
    const liveSpans = document.querySelectorAll(`#hun-text-${globalIdx}`);
    liveSpans.forEach(span => {
        span.classList.toggle('solved', isSolved);
    });

    // 2. 가상 메모리 캐시 탭 동기화 (100자 기준)
    const targetTab = Math.floor(globalIdx / 100) + 1;
    if (tabCache[targetTab]) {
        const cachedSpan = tabCache[targetTab].querySelector(`#hun-text-${globalIdx}`);
        if (cachedSpan) {
            cachedSpan.classList.toggle('solved', isSolved);
        }
    }
}

// 훈음 클릭 처리 핸들러
function handleHunClick(tdElement, globalIdx) {
    if (isQuizMode) {
        toggleSolvedState(globalIdx);
    } else {
        openModal(globalIdx);
    }
}

let currentVoiceHanja = '';
let currentVoiceHun = '';
let currentActiveModalIdx = 0;

// 모달 다이얼로그 열기 (번호 클릭 이벤트 연결을 추가해 감지 영역 확장)
function openModal(index) {
    const data = hanjaData[index];
    currentVoiceHanja = data.h;
    currentVoiceHun = data.m;
    currentActiveModalIdx = index;
    
    document.getElementById('modal-idx').innerText = `NO. ${String(index + 1).padStart(3, '0')}`;
    document.getElementById('modal-hanja').innerText = data.h;
    document.getElementById('modal-hun').innerText = data.m;
    document.getElementById('naver-link').href = `https://hanja.dict.naver.com/#/search?query=${encodeURIComponent(data.h)}`;

    const modalStarBtn = document.getElementById('modal-star-btn');
    modalStarBtn.onclick = (e) => toggleBookmark(index, e);
    
    // 번호 레이블 영역 클릭 시에도 즐겨찾기 토글이 실행되도록 이벤트 바인딩 추가
    const modalIdx = document.getElementById('modal-idx');
    modalIdx.onclick = (e) => toggleBookmark(index, e);

    updateModalStarState(index);

    const modal = document.getElementById('detail-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('.transform').classList.remove('scale-95');
        modal.querySelector('.transform').classList.add('scale-100');
    }, 10);
}

// 모달 다이얼로그 닫기
function closeModal() {
    const modal = document.getElementById('detail-modal');
    modal.classList.add('opacity-0');
    modal.querySelector('.transform').classList.add('scale-95');
    modal.querySelector('.transform').classList.remove('scale-100');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

// Web Speech API 이용 음성 합성(TTS)으로 한자 훈음 재생
function speakHanja() {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(currentVoiceHun);
        utterance.lang = 'ko-KR';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    } else {
        console.warn('Speech synthesis is not supported on this browser.');
    }
}

// === 3. 이벤트 초기 바인딩 및 위임 허브 구현 ===
window.onload = function() {
    // 폰트 속성 초기 설정 동기화
    document.documentElement.style.setProperty('--hanja-size', `${defaultHanjaSizePx}px`);
    document.documentElement.style.setProperty('--hun-size', `${defaultHunSizePx}px`);
    
    // 정적 표 (Tab 1..6) 가상 노드로 미리 메모리에 빌드
    preRenderStaticTables();
    
    // 활성화된 북마크 인덱스 복제 후 첫 번째 탭 렌더링
    activeFavoriteIndices = [...bookmarks];
    switchTab(1);

    // 이벤트 위임 허브 구축 (모든 버블링 이벤트를 처리하여 쾌적한 렌더링 유지)
    const mainContainer = document.getElementById('table-view-container');
    mainContainer.addEventListener('click', function(event) {
        // 1) 즐겨찾기 별표 아이콘 클릭
        const bookmarkBtn = event.target.closest('[data-action="toggle-bookmark"]');
        if (bookmarkBtn) {
            event.stopPropagation();
            event.preventDefault();
            const index = parseInt(bookmarkBtn.getAttribute('data-index'), 10);
            toggleBookmark(index);
            return;
        }

        // 2) 훈음 영역 클릭 (가리기 상태 해제 혹은 상세 모달)
        const hunCell = event.target.closest('[data-action="click-hun"]');
        if (hunCell) {
            event.stopPropagation();
            const index = parseInt(hunCell.getAttribute('data-index'), 10);
            handleHunClick(hunCell, index);
            return;
        }

        // 3) 한자 영역 클릭 (상세 모달 팝업)
        const hanjaCell = event.target.closest('[data-action="open-modal"]');
        if (hanjaCell) {
            event.stopPropagation();
            const index = parseInt(hanjaCell.getAttribute('data-index'), 10);
            openModal(index);
            return;
        }
    });

    // 모달 오버레이 바깥 영역 터치/클릭 시 닫기
    document.getElementById('detail-modal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });

    // ESC 키 입력 시 상세 보기 팝업 닫기
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modal = document.getElementById('detail-modal');
            if (!modal.classList.contains('hidden')) closeModal();
        }
    });
};