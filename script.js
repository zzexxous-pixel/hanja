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

// Web Audio API 0ms 즉시 재생 주파수 합성 및 하이브리드 제어 변수셋
let audioCtx = null;
let forcedTimeoutTimer = null; // 1.2초 강제 채점 만료 처리를 위한 타이머 변수
let isPressing = false;        // 현재 마우스/터치가 다운 스택 상태인지 보존하는 플래그
let speechBaselineText = "";   // 격리 세션용 직전 누적 문자열 스냅샷 저장소
let lastTranscriptPerIndex = {}; // 오디오 인덱스 보관 버퍼 객체
let latestRawTranscript = "";  // 가용한 최신 음성 데이터 임시 소유권 변수

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
            <div class="hanja-card-wrapper bg-white border border-slate-100 rounded-xl p-3 flex flex-col items-center relative hover:bg-slate-50 transition-all shadow-sm" data-index="${globalIdx}">
                <div class="w-full flex justify-between items-center mb-1 select-none">
                    <span class="card-status-label text-[10px] font-mono font-bold text-slate-400 leading-none flex items-center justify-center h-4 min-w-[24px]">#${globalIdx + 1}</span>
                    
                    <span data-action="toggle-bookmark" data-index="${globalIdx}" class="star-wrapper-${globalIdx} btn-mini-icon type-star ${isStarred ? 'starred' : 'unstarred'}">
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

// [그룹 2] 자가 테스트 모드 토글 컴포넌트 스위칭 로직 연동
function toggleQuizMode() {
    isQuizMode = !isQuizMode;
    const btn = document.getElementById('btn-toggle-quiz');
    
    if (isQuizMode) {
        document.body.classList.add('quiz-mode');
        btn.className = "btn-quiz-toggle theme-emerald"; 
        btn.querySelector('span').innerText = "훈음 보이기";
        btn.querySelector('i').className = "fa-solid fa-eye w-4 text-center";
    } else {
        document.body.classList.remove('quiz-mode');
        btn.className = "btn-quiz-toggle theme-yellow";  
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

// === Web Audio API 0ms 즉시 재생 주파수 이펙터 스크립트 ===
function playSound(type) {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const now = audioCtx.currentTime;
        
        if (type === 'correct') {
            // 정답음: 짧게 '띵동' -Sine 파형 상행 아르페지오 (C5 ➡️ E5 변이 가속)
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now); // 도 (C5)
            osc.frequency.setValueAtTime(659.25, now + 0.1); // 미 (E5)
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.005, now + 0.3);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'incorrect') {
            // 오답음: 짧게 낮은음으로 '삐빕' - Triangle 파형을 이용한 2회 단발 버스트 신호
            // 1타 삐
            const osc1 = audioCtx.createOscillator();
            const gain1 = audioCtx.createGain();
            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(160, now);
            gain1.gain.setValueAtTime(0.25, now);
            gain1.gain.exponentialRampToValueAtTime(0.005, now + 0.08);
            osc1.connect(gain1);
            gain1.connect(audioCtx.destination);
            osc1.start(now);
            osc1.stop(now + 0.09);
            // 2타 삐
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(160, now + 0.11);
            gain2.gain.setValueAtTime(0.25, now + 0.11);
            gain2.gain.exponentialRampToValueAtTime(0.005, now + 0.19);
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.start(now + 0.11);
            osc2.stop(now + 0.2);
        }
    } catch (err) {
        console.error("오디오 노드 합성 장애:", err);
    }
}

// === 6단계 동적 카드 상태 머신 시각 조작 엔진 ===
function updateCardUIState(index, state, passType) {
    const cardWrapper = document.querySelector(`.hanja-card-wrapper[data-index="${index}"]`);
    if (!cardWrapper) return;
    const statusLabel = cardWrapper.querySelector('.card-status-label');
    if (!statusLabel) return;

    // 기 가동 중이던 모든 동적 CSS 클래스 믹싱 선제 리셋 회수
    cardWrapper.classList.remove('mic-pulse-active', 'recording-active', 'checking-pulse-active', 'card-final-correct', 'card-final-incorrect');
    
    if (state === 'idle') {
        statusLabel.innerHTML = `#${index + 1}`;
    } else if (state === 'touch') {
        // State 1: 터치 대기 중 노란 모래시계
        statusLabel.innerHTML = `<span class="text-amber-500 font-bold">⏳</span>`;
    } else if (state === 'active') {
        // State 2, 3: 가동 및 말하기 상태의 빨간 마이크 아이콘 점등
        statusLabel.innerHTML = `<i class="fa-solid fa-microphone text-red-500 text-sm animate-pulse"></i>`;
        cardWrapper.classList.add('mic-pulse-active', 'recording-active');
    } else if (state === 'checking') {
        // State 4: 채점 연필 아이콘 및 노란 펄스 바인딩
        statusLabel.innerHTML = `<i class="fa-solid fa-pen text-amber-500 text-sm animate-pulse"></i>`;
        cardWrapper.classList.add('checking-pulse-active');
    } else if (state === 'final') {
        // State 5: 추가 텍스트를 제거하고 요청하신 단독 아이콘 배치 규격 준수
        if (passType === 'correct') {
            statusLabel.innerHTML = `<span class="text-emerald-500 text-xs font-black">⭕</span>`;
            cardWrapper.classList.add('card-final-correct');
        } else if (passType === 'incorrect') {
            statusLabel.innerHTML = `<span class="text-rose-500 text-xs font-black">❌</span>`;
            cardWrapper.classList.add('card-final-incorrect');
        }
    }
}

// 최종 판단 집행 파이프라인 함수
function executeFinalJudgment(index, isCorrect) {
    if (forcedTimeoutTimer) {
        clearTimeout(forcedTimeoutTimer);
        forcedTimeoutTimer = null;
    }
    
    if (isCorrect) {
        playSound('correct');
        updateCardUIState(index, 'final', 'correct');
        toggleSolvedState(index, true);
    } else {
        playSound('incorrect');
        updateCardUIState(index, 'final', 'incorrect');
        // 오답 시 즐겨찾기(★) 목록 자동 강제 바인딩 로직 기획에 의거 완벽 제거 완료
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

    const cardWrapper = e.target.closest('.hanja-card-wrapper');
    if (!cardWrapper) return;
    
    isPressing = true;
    hasPassed = false;
    latestRawTranscript = "";
    speechBaselineText = "";

    const touch = e.touches ? e.touches[0] : e;
    touchStartPos = { x: touch.clientX, y: touch.clientY };
    hasMoved = false;
    isHolding = false;

    pressStartTime = Date.now();
    evaluationTargetIndex = parseInt(cardWrapper.getAttribute('data-index'), 10);
    processingTargetIndex = evaluationTargetIndex; 
    currentHanjaSpeechStartIndex = -1; 
    wasHoldAction = false;

    appLog('System', `한자 터치 진입 ➡️ #${evaluationTargetIndex + 1}`);

    if (micShutdownTimer) {
        clearTimeout(micShutdownTimer);
        micShutdownTimer = null;
    }
    if (forcedTimeoutTimer) {
        clearTimeout(forcedTimeoutTimer);
        forcedTimeoutTimer = null;
    }

    // 웜업 가용 판단 분기 제어
    if (isListening) {
        updateCardUIState(evaluationTargetIndex, 'active');
        appLog('System', '🚀 웜업 가동 중인 기존 채널 즉시 바인딩. (대기 지연 0ms 바이패스)');
    } else {
        updateCardUIState(evaluationTargetIndex, 'touch');
        if (recognition) {
            try {
                recognition.start();
            } catch (err) {
                console.error(err);
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
        isPressing = false;

        if (forcedTimeoutTimer) clearTimeout(forcedTimeoutTimer);
        
        // 이탈 시 UI 롤백 
        updateCardUIState(evaluationTargetIndex, 'idle');

        isHolding = false;
        wasHoldAction = true; 
        
        startMicShutdownTimer();
        evaluationTargetIndex = null;
        appLog('System', `스크롤 이탈 감지 ➡️ 자원 보존 모드로 이탈`);
    }
}

function handleVoiceEnd(e) {
    if (!isQuizMode) return; 

    clearTimeout(holdTimer);
    if (evaluationTargetIndex === null) return;
    
    isPressing = false;
    const duration = Date.now() - pressStartTime;

    if (duration >= 300) {
        wasHoldAction = true;
        
        // 손가락을 떼었을 때 아직 실시간 정답에 도달하지 못했다면 채점 대기 샌드박스 기동
        if (!hasPassed) {
            updateCardUIState(evaluationTargetIndex, 'checking');
            appLog('System', `꾹 누르기 종료 ➡️ State 4: 채점 세션 기동 (1.2초 하드웨어 만료 카운트다운)`);
            
            if (forcedTimeoutTimer) clearTimeout(forcedTimeoutTimer);
            forcedTimeoutTimer = setTimeout(() => {
                if (!hasPassed) {
                    // 1.2초 이내에 후속 클라우드 패킷이 상용 기준에 미달 시 최종 오답 처리 확정
                    executeFinalJudgment(processingTargetIndex, false);
                }
            }, 1200);
        }
        startMicShutdownTimer();
    } else {
        wasHoldAction = true; 
        if (forcedTimeoutTimer) clearTimeout(forcedTimeoutTimer);
        
        updateCardUIState(evaluationTargetIndex, 'idle');
        if (!isListening) {
            processingTargetIndex = null; 
            // 기획 변경 사항: 가리기 상태(퀴즈 모드)에서는 단발성 클릭에 대해 상세 모달 팝업 출력을 물리적으로 원천 차단
        } else {
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
        modal.classList.add('flex');
    }, 300);
}

function appLog(category, message) {
    const consoleBody = document.getElementById('dev-console-body');
    if (!consoleBody) return;

    const logLine = document.createElement('div');
    logLine.className = 'py-0.5 border-b border-slate-800 break-all';
    
    let colorClass = 'text-emerald-400';
    if (category === 'Error') colorClass = 'text-rose-400';
    if (category === 'Success') colorClass = 'text-cyan-400';
    if (category === 'System') colorClass = 'text-amber-400';
    if (category === 'Speech') colorClass = 'text-fuchsia-400 font-bold';

    logLine.innerHTML = `<span class="text-slate-500">[${new Date().toLocaleTimeString()}]</span> <span class="${colorClass}">[${category}]</span> ${message}`;
    
    consoleBody.appendChild(logLine);
    
    if (consoleBody.children.length > 50) {
        consoleBody.removeChild(consoleBody.firstChild);
    }
    consoleBody.scrollTop = consoleBody.scrollHeight;
}

// === SpeechRecognition 실시간 가속 분석 및 이벤트 동기화 엔진 ===
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;     
    recognition.interimResults = true;  
    recognition.maxAlternatives = 1;

    recognition.onstart = function() {
        isListening = true;
        if (evaluationTargetIndex !== null) {
            updateCardUIState(evaluationTargetIndex, 'active');
            appLog('System', '🎙️ 구글 클라우드 오디오 게이트웨이 개방 완료.');
        }
    };

    recognition.onresult = function(event) {
        if (processingTargetIndex === null) return;
        if (solvedHanjas.has(processingTargetIndex)) return; 

        if (currentHanjaSpeechStartIndex === -1) {
            currentHanjaSpeechStartIndex = event.resultIndex;
            speechBaselineText = lastTranscriptPerIndex[currentHanjaSpeechStartIndex] || "";
        }

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            lastTranscriptPerIndex[i] = event.results[i][0].transcript;
        }

        let localTranscript = event.results[currentHanjaSpeechStartIndex][0].transcript;
        if (speechBaselineText && localTranscript.startsWith(speechBaselineText)) {
            localTranscript = localTranscript.slice(speechBaselineText.length);
        }

        let currentTranscript = localTranscript;
        for (let i = currentHanjaSpeechStartIndex + 1; i < event.results.length; ++i) {
            currentTranscript += event.results[i][0].transcript;
        }

        currentTranscript = currentTranscript.trim();
        let isFinalResult = event.results[event.results.length - 1].isFinal;

        if (currentTranscript) {
            latestRawTranscript = currentTranscript;

            const cleanSpoken = currentTranscript.replace(/[\.\?\!\,\s]+/g, '');
            const cleanTarget = hanjaData[processingTargetIndex].m.replace(/\s+/g, '');
            const similarity = calculatePhoneticSimilarity(cleanSpoken, cleanTarget);

            if (similarity >= 0.6) {
                hasPassed = true;
                executeFinalJudgment(processingTargetIndex, true);
                startMicShutdownTimer();
            } else if (isFinalResult) {
                appLog('Speech', `클라우드 문장 마감 프레임 도착 (일치율: ${Math.round(similarity * 100)}%)`);
                if (!isPressing && !hasPassed) {
                    executeFinalJudgment(processingTargetIndex, false);
                }
            } else {
                if (isPressing) {
                    appLog('Speech', `🎙️ 실시간 분석 중: "${cleanSpoken}" (현재 일치율: ${Math.round(similarity * 100)}%)`);
                }
            }
        }
    };

    recognition.onend = function() { 
        isListening = false; 
        if (micShutdownTimer) {
            clearTimeout(micShutdownTimer);
            micShutdownTimer = null;
        }
        appLog('System', '웹 오디오 API 인프라 세션 마감 ➡️ 완전 대기(Idle) 상태 전환');
        setTimeout(() => { processingTargetIndex = null; }, 500);
    };

    recognition.onerror = function(event) { 
        isListening = false; 
        processingTargetIndex = null;
        if (micShutdownTimer) {
            clearTimeout(micShutdownTimer);
            micShutdownTimer = null;
        }
        if (event.error === 'aborted') {
            appLog('System', '사용자 조작 제어로 인해 음성 스트림 채널이 안전하게 재조정되었습니다.');
            return;
        }
        appLog('Error', '음성 인식 인프라 하드웨어 장애 감지: ' + (event.error || 'unknown'));
    };
}

// === 3. 이벤트 바인딩 및 부팅 생명주기 ===
window.onload = function() {
    preRenderStaticTables();
    
    const mainContainer = document.getElementById('hanja-table-container');
    const tabs = document.querySelectorAll('[data-tab]');
    
    function switchTabDOM(tabId) {
        mainContainer.innerHTML = '';
        if (tabId === 7) {
            mainContainer.appendChild(buildFavoritesDOM());
        } else {
            mainContainer.appendChild(tabCache[tabId]);
        }
        
        tabs.forEach(t => {
            const tNum = parseInt(t.getAttribute('data-tab'));
            if (tNum === tabId) {
                t.classList.add('active');
            } else {
                t.classList.remove('active');
            }
        });
        
        // 7번(즐겨찾기) 탭 이동 시 페이지 전환용 이전/다음 제어 컴포넌트 비활성화
        const prevBtn = document.querySelector('[data-action="prev-page"]');
        const nextBtn = document.querySelector('[data-action="next-page"]');
        if (prevBtn && nextBtn) {
            if (tabId === 7) {
                prevBtn.classList.add('disabled');
                nextBtn.classList.add('disabled');
            } else {
                prevBtn.classList.remove('disabled');
                nextBtn.classList.remove('disabled');
            }
        }
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', function(e) {
            const targetTabNum = parseInt(this.getAttribute('data-tab'));
            if (targetTabNum === 7) {
                if (activeTab !== 7) preFavoriteTab = activeTab;
                activeFavoriteIndices = [...bookmarks];
            }
            activeTab = targetTabNum;
            switchTabDOM(activeTab);
        });
    });

    // 전역 이벤트 위임 방식으로 모바일 스크롤 간섭 및 고속 연타 구조 완벽 방어
    mainContainer.addEventListener('mousedown', handleVoiceStart);
    mainContainer.addEventListener('mousemove', handleVoiceMove);
    mainContainer.addEventListener('mouseup', handleVoiceEnd);
    mainContainer.addEventListener('mouseleave', handleVoiceEnd);

    mainContainer.addEventListener('touchstart', function(e) {
        handleVoiceStart(e);
    }, { passive: true });
    
    mainContainer.addEventListener('touchmove', function(e) {
        handleVoiceMove(e);
    }, { passive: true });
    
    mainContainer.addEventListener('touchend', function(e) {
        handleVoiceEnd(e);
    }, { passive: true });

    mainContainer.addEventListener('click', function(event) {
        const target = event.target;
        
        const starBtn = target.closest('[data-action="toggle-bookmark"]');
        if (starBtn) {
            const idx = parseInt(starBtn.getAttribute('data-index'), 10);
            toggleBookmark(idx, event);
            if (activeTab === 7) {
                activeFavoriteIndices = [...bookmarks];
                switchTabDOM(7);
            }
            return;
        }

        const hanjaCell = event.target.closest('[data-action="open-modal"]');
        if (hanjaCell) {
            event.stopPropagation();
            if (wasHoldAction) {
                wasHoldAction = false;
                return;
            }
            // [기획 요구사항 반영] 훈음가리기 상태(isQuizMode === true) 시 상세 팝업창을 가동하지 않고 바이패스 무시 처리
            if (isQuizMode) {
                return;
            }
            
            const index = parseInt(hanjaCell.getAttribute('data-index'), 10);
            openModal(index);
            return;
        }
    });

    // 외부 제어 영역 클릭 이벤트 바인딩
    document.addEventListener('click', function(e) {
        const actionBtn = e.target.closest('[data-action]');
        if (!actionBtn) return;

        const action = actionBtn.getAttribute('data-action');
        
        if (action === 'prev-page' && activeTab > 1 && activeTab !== 7) {
            activeTab--;
            switchTabDOM(activeTab);
        } else if (action === 'next-page' && activeTab < 6 && activeTab !== 7) {
            activeTab++;
            switchTabDOM(activeTab);
        } else if (action === 'font-zoom-in') {
            adjustFontSize(2);
        } else if (action === 'font-zoom-out') {
            adjustFontSize(-2);
        } else if (action === 'toggle-quiz') {
            isQuizMode = !isQuizMode;
            if (isQuizMode) {
                document.body.classList.add('quiz-mode');
                actionBtn.className = "btn-quiz-toggle theme-emerald";
                actionBtn.innerHTML = `<i class="fa-solid fa-eye"></i> <span>보여주기</span>`;
                appLog('System', '자가 테스트 퀴즈 모드 가동 (음성 학습 준비 완료)');
            } else {
                document.body.classList.remove('quiz-mode');
                actionBtn.className = "btn-quiz-toggle theme-yellow";
                actionBtn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> <span>훈음 가리기</span>`;
                appLog('System', '퀴즈 모드 해제 ➡️ 일반 열람 대기 상태');
                
                // 퀴즈 모드 해제 시 모든 한자의 상태를 초기 대기 상태로 일괄 복원
                solvedHanjas.clear();
                for (let i = 0; i < hanjaData.length; i++) {
                    updateCardUIState(i, 'idle');
                    const targetTab = Math.floor(i / 100) + 1;
                    if (tabCache[targetTab]) {
                        const cell = tabCache[targetTab].querySelector(`.hanja-card-wrapper[data-index="${i}"]`);
                        if (cell) cell.classList.remove('card-final-correct', 'card-final-incorrect');
                        const textSpan = tabCache[targetTab].querySelector(`#hun-text-${i}`);
                        if (textSpan) textSpan.classList.remove('solved');
                    }
                }
                if (activeTab === 7) switchTabDOM(7);
                else switchTabDOM(activeTab);
            }
        } else if (action === 'close-modal') {
            closeModal();
        } else if (action === 'modal-tts') {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(currentVoiceHun);
                utterance.lang = 'ko-KR';
                utterance.rate = 0.85; 
                window.speechSynthesis.speak(utterance);
                appLog('System', `네이티브 TTS 발음 엔진 호출 완료: "${currentVoiceHun}"`);
            } else {
                appLog('Error', '현재 기기는 시스템 웹 브라우저 내장 TTS 기능을 지원하지 않습니다.');
            }
        }
    });

    // 비밀 콘솔 기믹 트리거 바인딩
    const titleTrigger = document.getElementById('secret-title-trigger');
    if (titleTrigger) {
        titleTrigger.addEventListener('click', function() {
            titleClickCount++;
            if (titleClickCount === 1) {
                titleClickTimer = setTimeout(() => {
                    titleClickCount = 0;
                }, 2500);
            }
            if (titleClickCount >= 5) {
                clearTimeout(titleClickTimer);
                titleClickCount = 0;
                const consoleWrapper = document.getElementById('dev-console-wrapper');
                if (consoleWrapper) {
                    consoleWrapper.classList.toggle('hidden');
                    appLog('System', '🛠️ 하이엔드 개발자 전역 이벤트 스트림 드로어가 활성화되었습니다.');
                }
            }
        });
    }

    const consoleClearBtn = document.getElementById('console-clear-btn');
    if (consoleClearBtn) {
        consoleClearBtn.addEventListener('click', function() {
            const consoleBody = document.getElementById('dev-console-body');
            if (consoleBody) consoleBody.innerHTML = '';
        });
    }

    const consoleCloseBtn = document.getElementById('console-close-btn');
    if (consoleCloseBtn) {
        consoleCloseBtn.addEventListener('click', function() {
            const consoleWrapper = document.getElementById('dev-console-wrapper');
            if (consoleWrapper) consoleWrapper.classList.add('hidden');
        });
    }

    // 기본 최초 1번 고정 탭 로드 진입
    switchTabDOM(1);
};