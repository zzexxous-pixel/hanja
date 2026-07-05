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

// 로컬스토리지 기반 북마크 배열
let bookmarks = JSON.parse(localStorage.getItem('hanja_bookmarks')) || [];
let activeFavoriteIndices = [...bookmarks];

let defaultHanjaSizePx = parseInt(savedHanjaSize);
let defaultHunSizePx = parseInt(savedHunSize);

let solvedHanjas = new Set();
const tabCache = {};

// 음성 제어 및 모바일 스크롤 스레스홀드 보정 변수
let evaluationTargetIndex = null;
let isListening = false;
let recognition = null;

let touchStartPos = { x: 0, y: 0 };
let hasMoved = false;

// 개발자 비밀 디버그 콘솔 트리거 변수
let titleClickCount = 0;
let titleClickTimer = null;

// Web Audio API 0ms 즉시 재생 주파수 합성 및 [개정] 카드별 독립형 인프라 맵 변수
let audioCtx = null;
const forcedTimeoutTimers = {}; // 카드별 독립 만료 스케줄러 보관 맵 객체
let latestRawTranscript = "";  
let isCardLock = false;        // ➡️ [추가] 한자 카드 루틴 종결 전 연타 무력화용 전역 락 변수

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

// === Web Audio API 주파수 오디오 합성기 ===
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
            // 새롭게 매립된 볼륨 최대화 엔벨롭 및 화음 이펙터
            const gainNode = audioCtx.createGain();
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.4, now + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            
            osc1.type = 'sine';
            osc2.type = 'triangle';

            osc1.frequency.setValueAtTime(523.25, now); // C5
            osc1.frequency.setValueAtTime(659.25, now + 0.12); // E5

            osc2.frequency.setValueAtTime(659.25, now); // E5
            osc2.frequency.setValueAtTime(783.99, now + 0.12); // G5

            osc1.connect(gainNode);
            osc2.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 0.6);
            osc2.stop(now + 0.6);
        } else if (type === 'incorrect') {
            // 새롭게 매립된 톱니파 저음 및 로우패스 필터 버저
            const gainNode = audioCtx.createGain();
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.4, now + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

            const osc = audioCtx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(130, now); // 거친 130Hz 저음

            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1200, now);

            osc.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc.start(now);
            osc.stop(now + 0.5);
        }
    } catch (err) {
        console.error("오디오 노드 합성 장애:", err);
    }
}

// === 6단계 동적 카드 상태 머신 조작 엔진 ===
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

// [개정] 클로저 변수를 활용하여 카드별로 완전히 분리 구동되는 오답 결산 처리기
function executeFinalJudgment(index, isCorrect) {
    if (forcedTimeoutTimers[index]) {
        clearTimeout(forcedTimeoutTimers[index]);
        delete forcedTimeoutTimers[index];
    }

    // ➡️ [인프라 개선] O,X 판정이 종결되었으므로 마이크 스트림 즉시 파기 및 하드웨어 자원 강제 즉각 회수
    if (recognition) {
        try { recognition.abort(); } catch (err) {}
    }
    
    if (isCorrect) {
        playSound('correct');
        updateCardUIState(index, 'final', 'correct');
        toggleSolvedState(index, true);
    } else {
        playSound('incorrect');
        updateCardUIState(index, 'final', 'incorrect');
    }

    // ➡️ [추가] 한 글자의 루틴(O, X 판정 애니메이션 및 사운드 포함)이 완전히 끝났으므로 락 해제
    isCardLock = false;
}

// ==========================================================================
// === [대대적 개편] 카드별 독립형 0ms 즉시 차단 음성 입력 제어 프레임워크 ===
// ==========================================================================

function handleVoiceStart(e) {
    if (!isQuizMode) return; 
    if (isCardLock) return; // ➡️ [추가] 이전 카드의 판정이 끝나지 않았다면 다다닥 연타 입력을 원천 무시 차단

    // 중간 한자 영역 가로 전체([data-action="open-modal"])를 터치했는지 정밀 판단
    const hanjaZone = e.target.closest('[data-action="open-modal"]');
    if (!hanjaZone) return; 
    
    // 타겟팅에 성공하여 카드 조작이 시작되었으므로 즉시 글로벌 시스템 락 작동
    isCardLock = true;

    const cardWrapper = hanjaZone.closest('.hanja-card-wrapper');
    if (!cardWrapper) return;
    
    const index = parseInt(cardWrapper.getAttribute('data-index'), 10);
    
    // 이미 합격한 한자는 입력을 완전 차단 거부
    if (solvedHanjas.has(index)) return;

    // [기획 요구사항] 불필요한 300ms 홀드 지연 타이머 찌꺼기 완전 폐기 및 0ms 즉시 시동
    evaluationTargetIndex = index;
    processingTargetIndex = index; // ➡️ [버그 수정] 비동기 결과 리스너와의 동기화를 위해 핵심 타겟 인덱스 락인 매립
    latestRawTranscript = "";

    const touch = e.touches ? e.touches[0] : e;
    touchStartPos = { x: touch.clientX, y: touch.clientY };
    hasMoved = false;

    appLog('System', `한자 터치 즉시 시동 ➡️ #${index + 1}`);

    // [레이스 컨디션 해결] 해당 카드에 돌고 있던 이전 스케줄러 타이머가 있다면 독립적으로 선제 폐기
    if (forcedTimeoutTimers[index]) {
        clearTimeout(forcedTimeoutTimers[index]);
        delete forcedTimeoutTimers[index];
    }

    // [대안 폐기 반영] 마이크 Keep-Alive 무전기식 재활용 로직을 전면 삭제하고 매 터치다운마다 순수 독립 세션 기동
    updateCardUIState(index, 'touch');
    if (recognition) {
        try {
            // 하드웨어 드라이버 데드락 방지 가드: 기존에 돌고 있던 세션이 있다면 확실하게 크래시 방지용 stop 선제 차단
            recognition.stop(); 
            recognition.start();
        } catch (err) {
            // 이미 켜져 있는 비동기 스레드 보완용 안전 우회
            try { recognition.start(); } catch(e){}
        }
    }
}

function handleVoiceMove(e) {
    if (!isQuizMode || evaluationTargetIndex === null) return;

    const touch = e.touches ? e.touches[0] : e;
    const dx = touch.clientX - touchStartPos.x;
    const dy = touch.clientY - touchStartPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 10) {
        hasMoved = true;
        const targetIdx = evaluationTargetIndex;
        evaluationTargetIndex = null;
        
        updateCardUIState(targetIdx, 'idle');
        if (recognition) {
            try { recognition.stop(); } catch(err){}
        }
        appLog('System', `스크롤 이탈 감지 ➡️ #${targetIdx + 1} 마이크 세션 즉시 파괴`);

        isCardLock = false; // ➡️ [추가] 채점 세션에 진입하지 않고 이탈했으므로 시스템 락을 안전하게 조기 해제
    }
}

function handleVoiceEnd(e) {
    if (!isQuizMode || evaluationTargetIndex === null) return;
    
    const index = evaluationTargetIndex;
    evaluationTargetIndex = null;

    // ➡️ [초단음 버퍼 보존] 손을 떼더라도 마이크를 강제로 끄지 않고 구글 자연 종료 규격에 맡김 (stop 제거)
    /*// [개정] 손을 떼는 순간 구글 서버 임계치 대기 없이 즉각적으로 하드웨어 오디오 스트림 수집 영구 차단 폐쇄
    if (recognition) {
        try { recognition.stop(); } catch(err){}
    }*/

    // 손가락을 뗀 시점에 실시간 매칭으로 아직 정답 버퍼(⭕)를 통과하지 못한 카드만 독립 채점 스케줄러 진입
    const liveCardWrapper = document.querySelector(`.hanja-card-wrapper[data-index="${index}"]`);
    const isAlreadyPassed = liveCardWrapper && liveCardWrapper.classList.contains('card-final-correct');

    if (!isAlreadyPassed) {
        updateCardUIState(index, 'checking');
        appLog('System', `손떼기 완료 ➡️ #${index + 1} 독립 채점 세션 진입 (1.2초 만료 카운트다운)`);
        
        // [클로저 스냅샷 락인] 변수가 뒤섞이지 않게 index 번호를 고유 샌드박스로 고정 결산
        forcedTimeoutTimers[index] = setTimeout(((targetIdx) => {
            return () => {
                const checkWrapper = document.querySelector(`.hanja-card-wrapper[data-index="${targetIdx}"]`);
                if (checkWrapper && !checkWrapper.classList.contains('card-final-correct')) {
                    executeFinalJudgment(targetIdx, false);
                }
            };
        })(index), 1200);
    }
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

function speakHanja() {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(currentVoiceHun);
        utterance.lang = 'ko-KR';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
        appLog('System', `TTS 훈음 음성 재생 ➡️ "${currentVoiceHun}"`);
    }
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

// === SpeechRecognition 순수 실시간 단발성 분석 엔진 ===
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    // [패러다임 전환 완수] 불필요한 연속 누적 문장 기능을 파괴하여 event.resultIndex 가 항상 0번인 순수 세션 수립
    recognition.continuous = false;     
    recognition.interimResults = true;  
    recognition.maxAlternatives = 1;

    recognition.onstart = function() {
        isListening = true;
        // 글로벌 보존 타겟 바인딩 검증 후 실시간 펄스 인젝션
        const activeIdx = evaluationTargetIndex !== null ? evaluationTargetIndex : processingTargetIndex;
        if (activeIdx !== null) {
            updateCardUIState(activeIdx, 'active');
            appLog('System', `🎙️ 마이크 세션 독립 시동 완료 ➡️ #${activeIdx + 1}`);
        }
    };

    recognition.onresult = function(event) {
        if (processingTargetIndex === null) return;
        if (solvedHanjas.has(processingTargetIndex)) return; 

        // continuous가 false이므로 인덱스 0번 트랙의 텍스트 스트림 정보만 청정하게 결합
        let currentTranscript = event.results[0][0].transcript;
        let isFinalResult = event.results[event.results.length - 1].isFinal;

        if (currentTranscript) {
            latestRawTranscript = currentTranscript;

            const cleanSpoken = currentTranscript.replace(/[\.\?\!\,\s]+/g, '');
            const cleanTarget = hanjaData[processingTargetIndex].m.replace(/\s+/g, '');
            const similarity = calculatePhoneticSimilarity(cleanSpoken, cleanTarget);

            if (similarity >= 0.6) {
                // 실시간 도달 순간 즉시 하이패스 정답 처리 집행
                executeFinalJudgment(processingTargetIndex, true);
            } else if (isFinalResult) {
                appLog('Speech', `마감 프레임 패킷 도착 (일치율: ${Math.round(similarity * 100)}%)`);
                // 이미 손가락을 뗐고 만료 스케줄러가 구동 중인 상태에서 최종 오답 확정 수신 시 결산
                if (evaluationTargetIndex === null && forcedTimeoutTimers[processingTargetIndex]) {
                    executeFinalJudgment(processingTargetIndex, false);
                }
            } else {
                if (evaluationTargetIndex !== null) {
                    appLog('Speech', `🎙️ 실시간 분석 중: "${cleanSpoken}" (현재 일치율: ${Math.round(similarity * 100)}%)`);
                }
            }
        }
    };

    recognition.onend = function() { 
        isListening = false; 
        appLog('System', '마이크 채널 오디오 하드웨어 스트림 폐쇄 가동 완료');
    };

    recognition.onerror = function(event) { 
        isListening = false; 
        if (event.error === 'aborted') {
            appLog('System', '연타 처리를 위한 구형 기기 오디오 스트림 오프라인 정렬.');
            return;
        }
        appLog('Error', '음성 인식 인프라 하드웨어 장애 감지: ' + (event.error || 'unknown'));
    };
}

// === 4. 부팅 통합 바인딩 관리자 ===
window.onload = function() {
    appLog('System', '4급 배정한자 플랫폼 학습 엔진 초기화 가동 (공식 버전: {{APP_VERSION}})');
    preRenderStaticTables();
    activeFavoriteIndices = [...bookmarks];
    
    switchTab(1);

    const mainContainer = document.getElementById('table-view-container');
    if (!mainContainer) return;

    mainContainer.addEventListener('mousedown', handleVoiceStart);
    mainContainer.addEventListener('mousemove', handleVoiceMove);
    mainContainer.addEventListener('mouseup', handleVoiceEnd);
    mainContainer.addEventListener('mouseleave', handleVoiceEnd);

    mainContainer.addEventListener('touchstart', handleVoiceStart, { passive: true });
    mainContainer.addEventListener('touchmove', handleVoiceMove, { passive: true });
    mainContainer.addEventListener('touchend', handleVoiceEnd, { passive: true });

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
            if (isQuizMode) {
                return; 
            }
            const index = parseInt(hanjaCell.getAttribute('data-index'), 10);
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
                isCardLock = false; // ➡️ [승인 반영] 일반 모드 복귀 시 시스템 인터랙션 락 강제 초기화 예외 가드 배치

                // 모든 독립 타이머 원천 파괴
                Object.keys(forcedTimeoutTimers).forEach(key => {
                    clearTimeout(forcedTimeoutTimers[key]);
                    delete forcedTimeoutTimers[key];
                });

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
                switchTab(activeTab);
            }
        } else if (action === 'close-modal') {
            closeModal();
        } else if (action === 'modal-tts') {
            speakHanja();
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