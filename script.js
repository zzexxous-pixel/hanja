// === 1. 초기 렌더링 설정 및 즉시 실행 로직 ===
const savedHanjaSize = localStorage.getItem('hanja_size') || 45;
const savedHunSize = localStorage.getItem('hun_size') || 17;
document.documentElement.style.setProperty('--hanja-size', savedHanjaSize + 'px');
document.documentElement.style.setProperty('--hun-size', savedHunSize + 'px');

// === 2. 상태 관리 ===
let activeTab = 1;
let preFavoriteTab = 1; 
let isQuizMode = false;

// 로컬스토리지 기반 북마크 배열
let bookmarks = JSON.parse(localStorage.getItem('hanja_bookmarks')) || [];
let activeFavoriteIndices = [...bookmarks];

let defaultHanjaSizePx = parseInt(savedHanjaSize);
let defaultHunSizePx = parseInt(savedHunSize);

let solvedHanjas = new Set();
const tabCache = {};
let isFavoritesDirty = true; // 즐겨찾기 무한 Reflow 방지용 Dirty 플래그

// 음성 제어 매핑용 백업 포인터 변수
let evaluationTargetIndex = null;
let processingTargetIndex = null; 
let isListening = false;

// 개발자 비밀 디버그 콘솔 트리거 변수
let titleClickCount = 0;
let titleClickTimer = null;

// 카드별 인터랙션 동기화 전역 락 플래그
let isCardLock = false;        

function saveBookmarks() {
    localStorage.setItem('hanja_bookmarks', JSON.stringify(bookmarks));
}

function adjustFontSize(amount) {
    defaultHanjaSizePx = Math.max(16, Math.min(64, defaultHanjaSizePx + amount));
    defaultHunSizePx = Math.max(9, Math.min(28, defaultHunSizePx + (amount > 0 ? 1 : -1)));
    
    document.documentElement.style.setProperty('--hanja-size', `${defaultHanjaSizePx}px`);
    document.documentElement.style.setProperty('--hun-size', `${defaultHunSizePx}px`);

    localStorage.setItem('hanja_size', defaultHanjaSizePx);
    localStorage.setItem('hun_size', defaultHunSizePx);

    appLog('System', `글꼴 변경 ➡️ 한자: ${defaultHanjaSizePx}px / 훈음: ${defaultHunSizePx}px`);
}

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

    isFavoritesDirty = true; // 데이터 변동 시 즐겨찾기 DOM 재생성 트리거

    updateCellStarUI(index, !isRemoving);
    updateModalStarState(index);

    appLog('System', `즐겨찾기 토글 ➡️ #${index + 1} (${hanjaData[index].h}) : ${isRemoving ? '제거됨' : '등록됨'}`);
}

function updateCellStarUI(index, isStarred) {
    const liveWrappers = document.querySelectorAll(`.star-wrapper-${index}`);
    liveWrappers.forEach(starWrapper => {
        starWrapper.className = `star-wrapper-${index} btn-mini-icon type-star ${isStarred ? 'starred' : 'unstarred'}`;
    });

    const targetTab = Math.floor(index / 100) + 1;
    if (tabCache[targetTab]) {
        const cachedWrapper = tabCache[targetTab].querySelector(`.star-wrapper-${index}`);
        if (cachedWrapper) {
            cachedWrapper.className = `star-wrapper-${index} btn-mini-icon type-star ${isStarred ? 'starred' : 'unstarred'}`;
        }
    }
}

function updateModalStarState(index) {
    const starBtn = document.getElementById('modal-star-btn');
    if (!starBtn) return;
    if (bookmarks.includes(index)) {
        starBtn.className = "btn-popup-top-icon theme-star starred";
    } else {
        starBtn.className = "btn-popup-top-icon theme-star unstarred";
    }
}

function preRenderStaticTables() {
    for (let t = 1; t <= 6; t++) {
        const startIdx = (t - 1) * 100;
        const startIdxText = startIdx + 1;
        const endIdx = startIdx + 100;
        const pageData = hanjaData.slice(startIdx, endIdx).map((item, localIdx) => ({
            ...item,
            originalIdx: startIdx + localIdx
        }));
        
        const tableDiv = document.createElement('div');
        tableDiv.className = "bg-white border border-slate-200 overflow-hidden mb-6";
        tableDiv.innerHTML = generateTableHTML(t, pageData, `${startIdxText} ~ ${endIdx}자`);
        tabCache[t] = tableDiv;
    }
    appLog('System', '고정 탭 1 ~ 6 선행 렌더링 캐싱 엔진 수립 완료');
}

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

function generateTableHTML(t, pageData, titleLabel) {
    let gridHTML = `
        <div class="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
            <h2 class="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full ${t === 7 ? 'bg-amber-500' : 'bg-blue-600'}"></span>
                ${titleLabel}
            </h2>
            <span class="quiz-guide-text text-xs text-slate-500 font-medium hidden items-center gap-1.5 select-none">
                <i class="fa-solid fa-microphone text-red-500 animate-pulse"></i> 한자를 누르고 읽어보세요.
            </span>
        </div>
        <div class="p-4 hanja-responsive-grid">
    `;

    pageData.forEach((item) => {
        const globalIdx = item.originalIdx;
        const isStarred = bookmarks.includes(globalIdx);
        const isSolved = solvedHanjas.has(globalIdx);
        const solvedClass = isSolved ? 'solved' : '';
        
        gridHTML += `
            <div class="hanja-card-wrapper bg-white border border-slate-100 rounded-xl p-3 flex flex-col items-center relative hover:bg-slate-50 transition-all shadow-sm" data-index="${globalIdx}">
                <div data-action="toggle-bookmark" data-index="${globalIdx}" class="w-full flex justify-between items-center mb-1 cursor-pointer bg-transparent select-none">
                    <span class="card-status-label text-[10px] font-mono font-bold text-slate-400 leading-none flex items-center justify-center h-4 min-w-[24px]">#${globalIdx + 1}</span>
                    <span class="star-wrapper-${globalIdx} btn-mini-icon type-star ${isStarred ? 'starred' : 'unstarred'}">
                        <i class="fa-solid fa-star"></i>
                    </span>
                </div>
                <div data-action="open-modal" data-index="${globalIdx}" class="w-full flex justify-center items-center my-2 cursor-pointer select-none">
                    <span class="hanja-font dynamic-hanja-size font-bold text-slate-900 leading-none">
                        ${item.h}
                    </span>
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

function prevPage() {
    if (activeTab === 7) return;
    let target = activeTab - 1;
    if (target < 1) target = 6;
    switchTab(target);
}

function nextPage() {
    if (activeTab === 7) return;
    let target = activeTab + 1;
    if (target > 6) target = 1;
    switchTab(target);
}

function toggleFavorites() {
    if (activeTab === 7) {
        switchTab(preFavoriteTab);
    } else {
        preFavoriteTab = activeTab;
        switchTab(7);
    }
}

function switchTab(tabNum) {
    activeTab = tabNum;
    const container = document.getElementById('table-view-container');
    if (!container) return;
    container.innerHTML = ''; 

    if (tabNum === 7) {
        if (isFavoritesDirty || !tabCache[7]) {
            activeFavoriteIndices = [...bookmarks];
            tabCache[7] = buildFavoritesDOM();
            isFavoritesDirty = false;
        }
        container.appendChild(tabCache[7]);
    } else {
        container.appendChild(tabCache[tabNum]);
    }
    
    const tabBtn7 = document.getElementById('tab-7');
    const pagerWrapper = document.getElementById('pager-wrapper');
    const pageIndicator = document.getElementById('page-indicator');
    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');

    if (tabNum === 7) {
        if (tabBtn7) tabBtn7.className = "btn-header-ctrl active";
        if (pagerWrapper) {
            pagerWrapper.className = "flex items-center gap-1 bg-slate-700/40 p-1 rounded-lg h-10 text-slate-400 shadow-none shrink-0 select-none pointer-events-none opacity-50";
        }
        if (btnPrev) btnPrev.className = "btn-header-ctrl disabled";
        if (btnNext) btnNext.className = "btn-header-ctrl disabled";
        if (pageIndicator) pageIndicator.innerText = "★ / 6";
    } else {
        if (tabBtn7) tabBtn7.className = "btn-header-ctrl";
        if (pagerWrapper) {
            pagerWrapper.className = "flex items-center gap-1 bg-blue-950/40 p-1 rounded-lg h-10 text-white shadow-sm transition-all duration-200 shrink-0 select-none";
        }
        if (btnPrev) btnPrev.className = "btn-header-ctrl";
        if (btnNext) btnNext.className = "btn-header-ctrl";
        if (pageIndicator) pageIndicator.innerText = `${tabNum} / 6`;
    }

    appLog('System', `화면 탭 전환 ➡️ 대상 탭: ${tabNum === 7 ? '★ 즐겨찾기' : tabNum + '페이지'}`);
}

function toggleSolvedState(globalIdx, forceSolved) {
    const isSolved = (forceSolved !== undefined) ? forceSolved : !solvedHanjas.has(globalIdx);
    if (isSolved) {
        solvedHanjas.add(globalIdx);
    } else {
        solvedHanjas.delete(globalIdx);
    }
    
    const liveSpans = document.querySelectorAll(`#hun-text-${globalIdx}`);
    liveSpans.forEach(span => {
        span.classList.toggle('solved', isSolved);
    });

    const targetTab = Math.floor(globalIdx / 100) + 1;
    if (tabCache[targetTab]) {
        const cachedSpan = tabCache[targetTab].querySelector(`#hun-text-${globalIdx}`);
        if (cachedSpan) {
            cachedSpan.classList.toggle('solved', isSolved);
        }
    }
}

function handleHunClick(tdElement, globalIdx) {
    if (isQuizMode) {
        toggleSolvedState(globalIdx);
    } else {
        openModal(globalIdx);
    }
}

function updateCardUIState(index, state, passType) {
    const cardWrapper = document.querySelector(`.hanja-card-wrapper[data-index="${index}"]`);
    if (!cardWrapper) return;
    const statusLabel = cardWrapper.querySelector('.card-status-label');
    if (!statusLabel) return;

    cardWrapper.classList.remove('mic-pulse-active', 'recording-active', 'checking-pulse-active', 'card-final-correct', 'card-final-incorrect');
    
    if (state === 'idle') {
        statusLabel.innerHTML = `#${index + 1}`;
    } else if (state === 'touch') {
        statusLabel.innerHTML = `<span class="text-amber-500 font-bold">⏳</span>`;
    } else if (state === 'active') {
        statusLabel.innerHTML = `<i class="fa-solid fa-microphone text-red-500 text-sm animate-pulse"></i>`;
        cardWrapper.classList.add('mic-pulse-active', 'recording-active');
    } else if (state === 'checking') {
        statusLabel.innerHTML = `<i class="fa-solid fa-pen text-amber-500 text-sm animate-pulse"></i>`;
        cardWrapper.classList.add('checking-pulse-active');
    } else if (state === 'final') {
        if (passType === 'correct') {
            statusLabel.innerHTML = `<span class="text-emerald-500 text-xs font-black">⭕</span>`;
            cardWrapper.classList.add('card-final-correct');
        } else if (passType === 'incorrect') {
            statusLabel.innerHTML = `<span class="text-rose-500 text-xs font-black">❌</span>`;
            cardWrapper.classList.add('card-final-incorrect');
        }
    }
}

// 순수 전경 UI 결과 도출 및 오디오 매핑용 결산 유닛 핸들러
function executeFinalJudgment(index, isCorrect) {
    if (isCorrect) {
        audioEngine.playCorrect(); 
        updateCardUIState(index, 'final', 'correct');
        toggleSolvedState(index, true);
    } else {
        audioEngine.playIncorrect(); 
        updateCardUIState(index, 'final', 'incorrect');
    }

    // 카드 한 판의 상태 표출이 종결되었으므로 제어 변수 초기화 해제
    isCardLock = false;
    processingTargetIndex = null;
    evaluationTargetIndex = null;
}

// ==========================================================================
// === [UX 개편 완료] v2.4 동적 주입 스펙 연동 토글 클릭형 입력 라이브러리 ===
// ==========================================================================

function handleToggleVoiceQuiz(index) {
    if (solvedHanjas.has(index)) return;

    // [취소 분기] 녹음 가동 중 동일 한자 카드 재클릭 시, 수동 파괴 콜백 위임 호출
    if (isCardLock && processingTargetIndex === index) {
        appLog('System', `#${index + 1} 재클릭 취소 요구 수용 ➡️ 마이크 무력화 가동`);
        speechEngine.cancel();
        return;
    }

    // 다른 한자 카드가 수집 채널을 점유하고 있다면 연타 완전 차단 가드
    if (isCardLock) return;

    // 정상 상태 카드의 단발성 토글 클릭 성공에 따른 타겟 스코프 락인 획정
    isCardLock = true;
    processingTargetIndex = index;
    evaluationTargetIndex = index;

    updateCardUIState(index, 'touch');
    appLog('System', `한자 터치 토글 시동 ➡️ #${index + 1}`);

    // [v2.4 개정] Stateless 채점 모듈 사양에 따른 비즈니스 요건 동적 주입 및 기동
    speechEngine.start({
        targetText: hanjaData[index].m, // 정답 대조용 텍스트 주입
        threshold: 0.6,                // 통과 비율 60% 주입
        timeoutMs: 5000,               // 5초 타임아웃 주입
        onStart: function() {
            isListening = true;
            updateCardUIState(index, 'active');
            appLog('System', `🎙️ 마이크 세션 독립 시동 완료 ➡️ #${index + 1}`);
        },
        onSuccess: function() {
            appLog('System', `#${index + 1} 정답 판정 임계치 통과 수신 완료`);
            executeFinalJudgment(index, true);
        },
        onFail: function() {
            appLog('System', `#${index + 1} 무음 시간만료 또는 불일치 최종 오답 수신 완료`);
            executeFinalJudgment(index, false);
        },
        onCancel: function() {
            appLog('System', `#${index + 1} 사용자 수동 취소 인지 원복 완료`);
            updateCardUIState(index, 'idle');
            isCardLock = false;
            processingTargetIndex = null;
            evaluationTargetIndex = null;
        }
    });
}

let currentVoiceHanja = '';
let currentVoiceHun = '';
let currentActiveModalIdx = 0;

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

    appLog('System', `상세 모달 팝업 열림 ➡️ #${index + 1} (${data.h} : ${data.m})`);
}

function closeModal() {
    const modal = document.getElementById('detail-modal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    
    const transformTarget = modal.querySelector('.transform');
    if (transformTarget) {
        transformTarget.classList.add('scale-95');
        transformTarget.classList.remove('scale-100');
    }
    
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);

    appLog('System', '상세 모달 팝업 닫힘');
}

function handleTitleClick(e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    titleClickCount++;
    clearTimeout(titleClickTimer);
    
    if (titleClickCount >= 5) {
        toggleDevConsole();
        titleClickCount = 0;
    } else {
        titleClickTimer = setTimeout(() => {
            titleClickCount = 0;
        }, 2500);
    }
}

function toggleDevConsole() {
    const consoleEl = document.getElementById('dev-console');
    if (!consoleEl) return;
    if (consoleEl.classList.contains('hidden')) {
        consoleEl.classList.remove('hidden');
        appLog('System', '디버그 콘솔 인스턴스가 활성화되었습니다.');
    } else {
        consoleEl.classList.add('hidden');
    }
}

function appLog(category, message) {
    const consoleBody = document.getElementById('dev-console-body');
    if (!consoleBody) return;

    const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    const logLine = document.createElement('div');
    logLine.className = 'py-0.5 border-b border-slate-900/30 break-all text-[11px] leading-relaxed';
    
    let colorClass = 'text-emerald-400';
    if (category === 'Error') colorClass = 'text-rose-400';
    if (category === 'Success') colorClass = 'text-cyan-400';
    if (category === 'System') colorClass = 'text-amber-400';
    if (category === 'Speech') colorClass = 'text-fuchsia-400 font-bold';

    logLine.innerHTML = `<span class="text-slate-600">[${time}]</span> <span class="${colorClass}">[${category}]</span> ${message}`;
    consoleBody.appendChild(logLine);
    
    if (consoleBody.children.length > 50) {
        consoleBody.removeChild(consoleBody.firstChild);
    }
    consoleBody.scrollTop = consoleBody.scrollHeight;
}

// === 4. 부팅 통합 바인딩 관리자 ===
window.onload = function() {
    appLog('System', '4급 배정한자 플랫폼 학습 엔진 초기화 가동 (공식 버전: {{APP_VERSION}})');
    preRenderStaticTables();
    activeFavoriteIndices = [...bookmarks];
    
    // [인프라 드라이버 활성화] 부팅 시 스피치 엔진 고유의 내부 인터페이스 선행 할당 빌드
    speechEngine.init();
    
    switchTab(1);

    const mainContainer = document.getElementById('table-view-container');
    if (!mainContainer) return;

    mainContainer.addEventListener('click', function(event) {
        const bookmarkBtn = event.target.closest('[data-action="toggle-bookmark"]');
        if (bookmarkBtn) {
            event.stopPropagation();
            event.preventDefault();
            const index = parseInt(bookmarkBtn.getAttribute('data-index'), 10);
            toggleBookmark(index);
            if (activeTab === 7) {
                switchTab(7);
            }
            return;
        }

        const hunCell = event.target.closest('[data-action="click-hun"]');
        if (hunCell) {
            event.stopPropagation();
            if (!isQuizMode) {
                return;
            }
            const index = parseInt(hunCell.getAttribute('data-index'), 10);
            handleHunClick(hunCell, index);
            return;
        }

        const hanjaCell = event.target.closest('[data-action="open-modal"]');
        if (hanjaCell) {
            event.stopPropagation();
            const index = parseInt(hanjaCell.getAttribute('data-index'), 10);
            
            if (isQuizMode) {
                // [기획 스펙 기동] 퀴즈 모드일 때 가볍게 한 번 클릭하면 단발성 토글 제어 파이프 연결
                handleToggleVoiceQuiz(index);
                return; 
            }
            openModal(index);
            return;
        }
    });

    document.addEventListener('click', function(e) {
        const actionBtn = e.target.closest('[data-action]');
        if (!actionBtn) return;
        const action = actionBtn.getAttribute('data-action');
        
        if (action === 'toggle-quiz') {
            isQuizMode = !isQuizMode;
            if (isQuizMode) {
                document.body.classList.add('quiz-mode');
                actionBtn.className = "btn-quiz-toggle theme-emerald";
                actionBtn.innerHTML = `<i class="fa-solid fa-eye"></i> <span>훈음 보이기</span>`;
                appLog('System', '자가 테스트 퀴즈 모드 가동 (음성 학습 준비 완료)');
            } else {
                document.body.classList.remove('quiz-mode');
                actionBtn.className = "btn-quiz-toggle theme-yellow";
                actionBtn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> <span>훈음 가리기</span>`;
                appLog('System', '퀴즈 모드 해제 ➡️ 일반 열람 대기 상태');
                
                solvedHanjas.clear();
                isCardLock = false; 

                // 인프라 강제 중단 및 잔여 스레드 동시 일제 파괴
                speechEngine.abort();

                // 저사양 하드웨어 배치 최적화 리셋 가속화
                for (let t = 1; t <= 6; t++) {
                    if (tabCache[t]) {
                        tabCache[t].querySelectorAll('.hanja-card-wrapper').forEach(cell => {
                            cell.classList.remove('card-final-correct', 'card-final-incorrect');
                            const idx = cell.getAttribute('data-index');
                            const statusLabel = cell.querySelector('.card-status-label');
                            if (statusLabel) statusLabel.innerHTML = `#${parseInt(idx, 10) + 1}`;
                        });
                        tabCache[t].querySelectorAll('.quiz-blur-target').forEach(span => {
                            span.classList.remove('solved');
                        });
                    }
                }
                processingTargetIndex = null;
                evaluationTargetIndex = null;
                switchTab(activeTab);
            }
        } else if (action === 'close-modal') {
            closeModal();
        } else if (action === 'modal-tts') {
            audioEngine.speak(currentVoiceHun); 
        }
    });

    document.getElementById('detail-modal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeModal();
    });

    document.getElementById('console-clear-btn').addEventListener('click', () => {
        const consoleBody = document.getElementById('dev-console-body');
        if (consoleBody) consoleBody.innerHTML = '';
    });
    document.getElementById('console-close-btn').addEventListener('click', () => {
        document.getElementById('dev-console').classList.add('hidden');
    });
};