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

// === 한글 자모 분해 및 발음 유사도 판정 엔진 알고리즘 ===
const CHOSUNG = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
const JUNGSEONG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
const JONGSEONG = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄴㅈ","ㄴㅎ","ㄷ","ㄹ","ㄹㄱ","ㄹㅁ","ㄹㅂ","ㄹㅅ","ㄹㅌ","ㄹㅍ","ㄹㅎ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

function disassembleKorean(str) {
    let result = "";
    for (let i = 0; i < str.length; i++) {
        const charCode = str.charCodeAt(i);
        if (charCode >= 44032 && charCode <= 55203) {
            const hangulCode = charCode - 44032;
            const choIndex = Math.floor(hangulCode / 588);
            const jungIndex = Math.floor((hangulCode - (choIndex * 588)) / 28);
            const jongIndex = hangulCode % 28;
            result += CHOSUNG[choIndex] + JUNGSEONG[jungIndex] + JONGSEONG[jongIndex];
        } else {
            if (str[i] !== ' ') {
                result += str[i];
            }
        }
    }
    return result;
}

function getLevenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function calculatePhoneticSimilarity(wordA, wordB) {
    const jamoA = disassembleKorean(wordA);
    const jamoB = disassembleKorean(wordB);
    const maxLength = Math.max(jamoA.length, jamoB.length);
    if (maxLength === 0) return 1.0;
    const distance = getLevenshteinDistance(jamoA, jamoB);
    return 1 - (distance / maxLength);
}

// === 2. 상태 관리 ===
let activeTab = 1;
let preFavoriteTab = 1; 
let isQuizMode = false;
let micShutdownTimer = null; // 5초 Keep-Alive 대기 버퍼 제어용 전역 타이머 변수
let currentHanjaSpeechStartIndex = -1; // 현재 터치한 한자의 음성 시작 버퍼 인덱스 추적 변수

// 로컬스토리지 기반 북마크 배열
let bookmarks = JSON.parse(localStorage.getItem('hanja_bookmarks')) || [];
let activeFavoriteIndices = [...bookmarks];

let defaultHanjaSizePx = parseInt(savedHanjaSize);
let defaultHunSizePx = parseInt(savedHunSize);

let solvedHanjas = new Set();
const tabCache = {};

// 음성 제어 및 모바일 스크롤 스레스홀드 보정 변수
let pressStartTime = 0;
let evaluationTargetIndex = null;
let processingTargetIndex = null; // 비동기 음성 분석용 핵심 전용 보존 인덱스
let isListening = false;
let wasHoldAction = false;
let recognition = null;

let touchStartPos = { x: 0, y: 0 };
let holdTimer = null;
let isHolding = false;
let hasMoved = false;

// 개발자 비밀 디버그 콘솔 트리거 변수
let titleClickCount = 0;
let titleClickTimer = null;

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

    updateCellStarUI(index, !isRemoving);
    updateModalStarState(index);

    appLog('System', `즐겨찾기 토글 ➡️ #${index + 1} (${hanjaData[index].h}) : ${isRemoving ? '제거됨' : '등록됨'}`);
}

// [그룹 4] 개별 한자 셀 내부의 즐겨찾기 별표 상태 제어 컴포넌트 클래스 스왑 처리
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

// [그룹 5] 모달 팝업 내부의 상단 즐겨찾기 아이콘 상태 제어 컴포넌트 클래스 스왑 처리
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
            <div class="bg-white border border-slate-100 rounded-xl p-3 flex flex-col items-center relative hover:bg-slate-50 transition-all shadow-sm">
                <div data-action="toggle-bookmark" data-index="${globalIdx}" 
                     class="w-full flex justify-between items-center mb-1 cursor-pointer bg-transparent select-none">
                    <span class="text-[10px] font-mono font-bold text-slate-400 leading-none flex items-center justify-center h-4 min-w-[24px]">
                        <i class="fa-solid fa-microphone text-red-500 text-base recording-icon hidden animate-pulse"></i>
                        <span class="number-label">#${globalIdx + 1}</span>
                    </span>
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

// [그룹 1] 헤더 제어 컴포넌트 상태 스위칭 연동 로직
function switchTab(tabNum) {
    activeTab = tabNum;
    const container = document.getElementById('table-view-container');
    container.innerHTML = ''; 

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
        // 즐겨찾기 화면 진입 시 버튼 반전 및 페이지네이션 제어 불능 상태(disabled) 처리
        if (tabBtn7) tabBtn7.className = "btn-header-ctrl active";
        if (pagerWrapper) {
            pagerWrapper.className = "flex items-center gap-1 bg-slate-700/40 p-1 rounded-lg h-10 text-slate-400 shadow-none shrink-0 select-none pointer-events-none opacity-50";
        }
        if (btnPrev) btnPrev.className = "btn-header-ctrl disabled";
        if (btnNext) btnNext.className = "btn-header-ctrl disabled";
        if (pageIndicator) pageIndicator.innerText = "★ / 6";
    } else {
        // 일반 페이지 구동 상태 복구 복원
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

// [그룹 2] 자가 테스트 모드 토글 컴포넌트 스위칭 로직 연동
function toggleQuizMode() {
    isQuizMode = !isQuizMode;
    const btn = document.getElementById('btn-toggle-quiz');
    
    if (isQuizMode) {
        document.body.classList.add('quiz-mode');
        btn.className = "btn-quiz-toggle theme-emerald"; // 에메랄드 테마 스왑
        btn.querySelector('span').innerText = "훈음 보이기";
        btn.querySelector('i').className = "fa-solid fa-eye w-4 text-center";
    } else {
        document.body.classList.remove('quiz-mode');
        btn.className = "btn-quiz-toggle theme-yellow";  // 옐로우 테마 스왑
        btn.querySelector('span').innerText = "훈음 가리기";
        btn.querySelector('i').className = "fa-solid fa-eye-slash w-4 text-center";
    }

    solvedHanjas.clear();

    const liveElements = document.querySelectorAll('.quiz-blur-target');
    liveElements.forEach(el => el.classList.remove('solved'));

    for (let t = 1; t <= 6; t++) {
        if (tabCache[t]) {
            const cachedElements = tabCache[t].querySelectorAll('.quiz-blur-target');
            cachedElements.forEach(el => el.classList.remove('solved'));
        }
    }

    appLog('System', `훈음 가리기 상태 전환 ➡️ 현재: ${isQuizMode ? 'ON (블러 마스킹 수립)' : 'OFF (일반 가동)'}`);
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

// ==========================================================================
// === 음성 입력 시작, 이동, 종료 제어 및 5초 웜업 대기 풀 엔진 ===
// ==========================================================================

// 5초 자동 자원 회수(마이크 오프) 제어 헬퍼 함수
function startMicShutdownTimer() {
    if (micShutdownTimer) clearTimeout(micShutdownTimer);
    micShutdownTimer = setTimeout(() => {
        if (recognition && isListening) {
            try {
                recognition.stop();
                appLog('System', '⏱️ 5초간 후속 입력이 없어 대기 중이던 마이크 세션을 안전하게 닫았습니다.');
            } catch (err) {
                console.error(err);
            }
            isListening = false;
        }
        micShutdownTimer = null;
        processingTargetIndex = null;
    }, 5000); // 5초 연속 입력 임계치 설정
}

function handleVoiceStart(e) {
    if (!isQuizMode) return; 

    const hanjaCell = e.target.closest('[data-action="open-modal"]');
    if (!hanjaCell) return;
    
    const touch = e.touches ? e.touches[0] : e;
    touchStartPos = { x: touch.clientX, y: touch.clientY };
    hasMoved = false;
    isHolding = false;

    pressStartTime = Date.now();
    evaluationTargetIndex = parseInt(hanjaCell.getAttribute('data-index'), 10);
    processingTargetIndex = evaluationTargetIndex; 
    currentHanjaSpeechStartIndex = -1; // 신규 한자 입력 진입 시 인덱스 리셋
    wasHoldAction = false;

    appLog('System', `한자 터치 감지 ➡️ #${evaluationTargetIndex + 1} (${hanjaData[evaluationTargetIndex].h})`);

    // 연속 입력 감지 시: 기존에 돌고 있던 5초 Shutdown 백그라운드 타이머를 즉시 파괴
    if (micShutdownTimer) {
        clearTimeout(micShutdownTimer);
        micShutdownTimer = null;
    }

    // [0ms 반응 성능 핵심] 마이크가 이미 세션을 유지하고 있다면(isListening === true) 구글 커넥션을 생략하고 즉시 UI 기동
    if (isListening) {
        const cardWrapper = hanjaCell.closest('.bg-white.border.border-slate-100');
        if (cardWrapper) {
            cardWrapper.classList.add('mic-pulse-active', 'recording-active');
        }
        appLog('System', '🎙️ 마이크가 이미 열려 있습니다. 딜레이 없이 즉시 실시간 음성 매칭 가동.');
    } else {
        // 완전 처음 누른 것이라면 온전하게 최초 커넥션 빌드 시동 (onstart 이벤트에서 연결 완료 확인 후 불빛이 켜집니다)
        if (recognition) {
            try {
                recognition.start();
                appLog('System', '오디오 인프라 게이트웨이 개방 대기 중 (최초 연결)...');
            } catch (err) {
                appLog('Error', `마이크 시동 오류: ${err.message}`);
            }
        }
    }

    holdTimer = setTimeout(() => {
        isHolding = true;
    }, 300);
}

function handleVoiceMove(e) {
    if (!isQuizMode || evaluationTargetIndex === null) return;

    const touch = e.touches ? e.touches[0] : e;
    const dx = touch.clientX - touchStartPos.x;
    const dy = touch.clientY - touchStartPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 10) {
        hasMoved = true;
        clearTimeout(holdTimer); 

        // 스크롤 감지 시 마이크를 강제 종료(abort)하지 않고, 해당 카드의 빨간 불빛만 끄고 타겟 바인딩만 해제
        const targetElement = document.querySelector(`[data-action="open-modal"][data-index="${evaluationTargetIndex}"]`);
        if (targetElement) {
            const cardWrapper = targetElement.closest('.bg-white.border.border-slate-100');
            if (cardWrapper) {
                cardWrapper.classList.remove('mic-pulse-active', 'recording-active');
            }
        }

        isHolding = false;
        wasHoldAction = true; 
        
        // 마이크 스트림은 살려둔 채, 연속 입력을 대기하는 5초 셧다운 타이머 가동
        startMicShutdownTimer();
        
        evaluationTargetIndex = null;
        appLog('System', `스크롤 이탈 감지 (평가 대상 해제) ➡️ 마이크 인프라는 5초 연속 입력을 위해 유지`);
    }
}

function handleVoiceEnd(e) {
    if (!isQuizMode) return; 

    clearTimeout(holdTimer);
    if (evaluationTargetIndex === null) return;
    const duration = Date.now() - pressStartTime;
    
    // 손가락을 떼는 순간 타겟 카드의 가시적인 녹음 중 UI는 즉시 선제 회수하여 렉 현상 방지
    const targetElement = document.querySelector(`[data-action="open-modal"][data-index="${evaluationTargetIndex}"]`);
    if (targetElement) {
        const cardWrapper = targetElement.closest('.bg-white.border.border-slate-100');
        if (cardWrapper) {
            cardWrapper.classList.remove('mic-pulse-active', 'recording-active');
        }
    }

    if (duration >= 300) {
        wasHoldAction = true;
        appLog('System', `꾹 누르기 종료 ➡️ 마이크 웜업 유지를 위해 5초 대기 세션 기동`);
        
        // 손을 떼도 마이크 채널을 파괴하지 않고 5초 Keep-Alive 풀로 인계
        startMicShutdownTimer();
    } else {
        wasHoldAction = true; 
        if (!isListening) {
            processingTargetIndex = null; 
            appLog('System', `단순 단발성 클릭 터치 다운 감지. 상세 팝업 모달창 호출`);
            if (e.type === 'touchend' || e.type === 'mouseup') {
                openModal(evaluationTargetIndex);
            }
        } else {
            // 마이크가 이미 켜진 대기 상태에서 가볍게 클릭만 하고 손을 뗀 경우에도 5초 타이머 연장 가동
            startMicShutdownTimer();
        }
    }

    setTimeout(() => {
        evaluationTargetIndex = null;
    }, 100);
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
        modal.classList.remove('flex');
    }, 300);

    appLog('System', '상세 모달 팝업 닫힘');
}

function speakHanja() {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(currentVoiceHun);
        utterance.lang = 'ko-KR';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
        appLog('System', `TTS 훈음 음성 재생 ➡️ "${currentVoiceHun}"`);
    } else {
        console.warn('Speech synthesis is not supported on this browser.');
    }
}

// 비밀 개발용 콘솔창 제어 유틸리티
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
    const isHidden = consoleEl.classList.contains('hidden');
    if (isHidden) {
        consoleEl.classList.remove('hidden');
        appLog('System', '디버그 콘솔 인스턴스가 성공적으로 가시화되었습니다.');
    } else {
        consoleEl.classList.add('hidden');
    }
}

function clearDevConsole() {
    const consoleBody = document.getElementById('dev-console-body');
    if (consoleBody) {
        consoleBody.innerHTML = '<div class="text-slate-500">// 디버그 터미널 로그 스트림이 초기화되었습니다.</div>';
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
    if (category === 'Speech') colorClass = 'text-indigo-400';

    logLine.innerHTML = `<span class="text-slate-600">[${time}]</span> <span class="${colorClass} font-bold">[${category}]</span> ${message}`;
    
    consoleBody.appendChild(logLine);
    
    // 저사양 태블릿 힙 메모리 고갈 누수 완전 차단: 로그 50개 초과 시 최선행 노드 영구 폐기
    if (consoleBody.children.length > 50) {
        consoleBody.removeChild(consoleBody.firstChild);
    }

    consoleBody.scrollTop = consoleBody.scrollHeight;
}

const cleanupActiveUI = () => {
    const activeCards = document.querySelectorAll('.mic-pulse-active, .recording-active');
    activeCards.forEach(card => {
        card.classList.remove('mic-pulse-active', 'recording-active');
    });
};

// ==========================================================================
// === SpeechRecognition 실시간 가속 분석 및 이벤트 동기화 엔진 ===
// ==========================================================================
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;     // ➡️ [필수 변경] 문장이 끝나도 마이크를 자동 종료하지 않고 세션 유지
    recognition.interimResults = true;  // 실시간 중간 스트림 결과 반영 활성화
    recognition.maxAlternatives = 1;

    recognition.onstart = function() {
        isListening = true;
        if (evaluationTargetIndex !== null) {
            const targetElement = document.querySelector(`[data-action="open-modal"][data-index="${evaluationTargetIndex}"]`);
            const cardWrapper = targetElement ? targetElement.closest('.bg-white.border.border-slate-100') : null;
            if (cardWrapper) {
                cardWrapper.classList.add('mic-pulse-active', 'recording-active');
            }
            appLog('System', '🎙️ 오디오 전송 스트림 연결 완료. 지금 바로 말씀하세요!');
        }
    };

    recognition.onresult = function(event) {
        if (processingTargetIndex === null) return;
        if (solvedHanjas.has(processingTargetIndex)) return; // 중복 합격 처리 방지

        // 현재 한자를 누르고 첫 음성 프레임이 유입된 시점의 API 상대 인덱스를 박제합니다.
        if (currentHanjaSpeechStartIndex === -1) {
            currentHanjaSpeechStartIndex = event.resultIndex;
        }

        let currentTranscript = '';
        // 박제된 시작 인덱스 이후부터 현재까지 생성된 스트림 조각들만 안전하게 결합합니다 (과거 한자 발음 누적분 배제)
        for (let i = currentHanjaSpeechStartIndex; i < event.results.length; ++i) {
            currentTranscript += event.results[i][0].transcript;
        }

        // 전체 오디오 스트림 파이프라인의 가장 마지막 버퍼가 구글 클라우드에 의해 완결되었는지 검사
        let isFinalResult = event.results[event.results.length - 1].isFinal;

        if (currentTranscript) {
            const cleanSpoken = currentTranscript.replace(/[\.\?\!\,\s]+/g, '');
            const cleanTarget = hanjaData[processingTargetIndex].m.replace(/\s+/g, '');
            const similarity = calculatePhoneticSimilarity(cleanSpoken, cleanTarget);

            const targetElement = document.querySelector(`[data-action="open-modal"][data-index="${processingTargetIndex}"]`);
            const card = targetElement ? targetElement.closest('.bg-white.border.border-slate-100') : null;

            // [시나리오 1] 손가락을 대고 말하는 도중 일치율이 60%를 돌파하면 0ms 즉시 [합격] 바이패스 가동
            if (similarity >= 0.6) {
                appLog('Success', `🎉 [즉시 합격] 일치율: ${(similarity * 100).toFixed(1)}% (인식: "${cleanSpoken}")`);
                
                if (card) {
                    card.classList.remove('mic-pulse-active', 'recording-active');
                    card.classList.add('flash-correct');
                    setTimeout(() => card.classList.remove('flash-correct'), 600);
                }
                toggleSolvedState(processingTargetIndex, true);
                if (navigator.vibrate) navigator.vibrate(40);
                
                // 마이크 채널은 그대로 켜둔 채 다음 연속 입력을 위해 5초 웜업 타이머로 토스
                startMicShutdownTimer();
            } 
            // [시나리오 2] 구글 엔진이 현재 발음을 문장 단위로 완전 확정했음에도 합격 점수를 못 채운 경우 [최종 불합격]
            else if (isFinalResult) {
                appLog('Error', `❌ [불합격] 일치율: ${(similarity * 100).toFixed(1)}% (인식: "${cleanSpoken}")`);
                
                if (card) {
                    card.classList.add('flash-incorrect');
                    setTimeout(() => card.classList.remove('flash-incorrect'), 600);
                }
                if (!bookmarks.includes(processingTargetIndex)) {
                    toggleBookmark(processingTargetIndex);
                }
                if (navigator.vibrate) navigator.vibrate([40, 80, 40]);
                
                // 패배 레이블 부여 후에도 연속 도전을 위해 채널 개방 유지
                startMicShutdownTimer();
            } 
            // [시나리오 3] 실시간 파싱 도중 중간 스펙트럼 덤프 출력
            else {
                appLog('Speech', `🎙️ 실시간 분석 중: "${cleanSpoken}" (현재 일치율: ${(similarity * 100).toFixed(0)}%)`);
            }
        }
    };

    recognition.onend = function() { 
        isListening = false; 
        cleanupActiveUI();
        // 마이크 세션이 기기나 서버에 의해 완전히 내려앉은 경우 타이머 자원 완전 해제
        if (micShutdownTimer) {
            clearTimeout(micShutdownTimer);
            micShutdownTimer = null;
        }
        appLog('System', '웹 오디오 API 인프라 세션 마감 ➡️ 완전 대기(Idle) 상태 전환');
        setTimeout(() => { processingTargetIndex = null; }, 500);
    };

    recognition.onerror = function(event) { 
        isListening = false; 
        cleanupActiveUI();
        processingTargetIndex = null;
        if (micShutdownTimer) {
            clearTimeout(micShutdownTimer);
            micShutdownTimer = null;
        }
        // 사용자의 의도적인 스크롤이나 다음 한자 이동으로 인한 취소 신호(aborted)는 우회 처리
        if (event.error === 'aborted') {
            appLog('System', '사용자 조작 제어로 인해 음성 스트림 채널이 안전하게 재조정되었습니다.');
            return;
        }
        appLog('Error', '음성 인식 인프라 하드웨어 장애 감지: ' + (event.error || 'unknown'));
    };
}

window.onload = function() {
    document.documentElement.style.setProperty('--hanja-size', `${defaultHanjaSizePx}px`);
    document.documentElement.style.setProperty('--hun-size', `${defaultHunSizePx}px`);
    
    appLog('System', '4급 배정한자 플랫폼 학습 엔진 초기화 가동 (공식 버전: {{APP_VERSION}})');
    preRenderStaticTables();
    activeFavoriteIndices = [...bookmarks];
    switchTab(1);

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        appLog('System', '저사양 모바일 마이크 하드웨어 사전 액세스 시도');
        navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => { 
            appLog('System', '마이크 하드웨어 가용 권한 획득 성공');
            stream.getTracks().forEach(track => track.stop()); 
        })
        .catch(err => {
            appLog('Error', '마이크 권한 요청이 시스템에서 거부되었거나 사용 불가능 상태입니다.');
        });
    }

    const mainContainer = document.getElementById('table-view-container');
    
    mainContainer.addEventListener('mousedown', handleVoiceStart);
    mainContainer.addEventListener('touchstart', handleVoiceStart, { passive: false });
    
    mainContainer.addEventListener('mousemove', handleVoiceMove);
    mainContainer.addEventListener('touchmove', handleVoiceMove, { passive: true }); 
    
    mainContainer.addEventListener('mouseup', handleVoiceEnd);
    mainContainer.addEventListener('touchend', handleVoiceEnd);
    mainContainer.addEventListener('mouseleave', handleVoiceEnd);

    mainContainer.addEventListener('click', function(event) {
        const bookmarkBtn = event.target.closest('[data-action="toggle-bookmark"]');
        if (bookmarkBtn) {
            event.stopPropagation();
            event.preventDefault();
            const index = parseInt(bookmarkBtn.getAttribute('data-index'), 10);
            toggleBookmark(index);
            return;
        }

        const hunCell = event.target.closest('[data-action="click-hun"]');
        if (hunCell) {
            event.stopPropagation();
            const index = parseInt(hunCell.getAttribute('data-index'), 10);
            handleHunClick(hunCell, index);
            return;
        }

        const hanjaCell = event.target.closest('[data-action="open-modal"]');
        if (hanjaCell) {
            event.stopPropagation();
            if (wasHoldAction) {
                wasHoldAction = false;
                return;
            }
            const index = parseInt(hanjaCell.getAttribute('data-index'), 10);
            openModal(index);
            return;
        }
    });

    document.getElementById('detail-modal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modal = document.getElementById('detail-modal');
            if (!modal.classList.contains('hidden')) closeModal();
        }
    });
};