// === 1. 초기 렌더링 설정 및 즉시 실행 로직 ===
const savedHanjaSize = localStorage.getItem('hanja_size') || 45;
const savedHunSize = localStorage.getItem('hun_size') || 17;
document.documentElement.style.setProperty('--hanja-size', savedHanjaSize + 'px');
document.documentElement.style.setProperty('--hun-size', savedHunSize + 'px');

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

// [최적화 완료] 2차원 매트릭스 배열의 동적 할당을 파괴하고, 2개의 1차원 행 포인터만 스왑하여 GC 부하 차단 
function getLevenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let prevRow = new Array(a.length + 1);
    let currRow = new Array(a.length + 1);

    for (let j = 0; j <= a.length; j++) {
        prevRow[j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        currRow[0] = i;
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                currRow[j] = prevRow[j - 1];
            } else {
                currRow[j] = Math.min(
                    prevRow[j - 1] + 1,
                    Math.min(currRow[j - 1] + 1, prevRow[j] + 1)
                );
            }
        }
        // 행 포인터 고속 고정 스왑으로 메모리 재할당 억제
        let temp = prevRow;
        prevRow = currRow;
        currRow = temp;
    }
    return prevRow[a.length];
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
let isFavoritesDirty = true; // 즐겨찾기 무한 Reflow 방지용 Dirty 플래그

// 음성 제어 및 모바일 스크롤 스레스홀드 보정 변수
let evaluationTargetIndex = null;
let processingTargetIndex = null; // 암묵적 전역 변수 오염 해결을 위한 명시적 스코프 선언
let isListening = false;
let recognition = null;

let touchStartPos = { x: 0, y: 0 };
let hasMoved = false;

// 개발자 비밀 디버그 콘솔 트리거 변수
let titleClickCount = 0;
let titleClickTimer = null;

// Web Audio API 주파수 합성 및 카드별 독립형 인프라 맵 변수
let audioCtx = null;
const forcedTimeoutTimers = {}; 
let latestRawTranscript = "";  
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
            const gainNode = audioCtx.createGain();
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.4, now + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            
            osc1.type = 'sine';
            osc2.type = 'triangle';

            osc1.frequency.setValueAtTime(523.25, now); 
            osc1.frequency.setValueAtTime(659.25, now + 0.12); 

            osc2.frequency.setValueAtTime(659.25, now); 
            osc2.frequency.setValueAtTime(783.99, now + 0.12); 

            osc1.connect(gainNode);
            osc2.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 0.6);
            osc2.stop(now + 0.6);
        } else if (type === 'incorrect') {
            const gainNode = audioCtx.createGain();
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.4, now + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

            const osc = audioCtx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(130, now); 

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

function executeFinalJudgment(index, isCorrect) {
    if (forcedTimeoutTimers[index]) {
        clearTimeout(forcedTimeoutTimers[index]);
        delete forcedTimeoutTimers[index];
    }

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

    isCardLock = false;
}

function handleVoiceStart(e) {
    if (!isQuizMode) return; 
    if (isCardLock) return; // 이전 카드의 판정이 끝나지 않았다면 다다닥 연타 입력을 원천 무시 차단

    // 중간 한자 영역 가로 전체([data-action="open-modal"])를 터치했는지 정밀 판단
    const hanjaZone = e.target.closest('[data-action="open-modal"]');
    if (!hanjaZone) return; 
    
    const cardWrapper = hanjaZone.closest('.hanja-card-wrapper');
    if (!cardWrapper) return;
    
    const index = parseInt(cardWrapper.getAttribute('data-index'), 10);
    if (solvedHanjas.has(index)) return; // 시스템 락을 걸기 전에 이미 합격한 한자인지 먼저 검사하여 조기 리턴

    isCardLock = true; // 아직 풀지 않은 정상 카드임이 검증된 후에만 글로벌 시스템 락 작동

    evaluationTargetIndex = index;
    processingTargetIndex = index; 
    latestRawTranscript = "";

    touchStartPos = { x: e.clientX, y: e.clientY };
    hasMoved = false;

    appLog('System', `한자 터치 즉시 시동 ➡️ #${index + 1}`);

    if (forcedTimeoutTimers[index]) {
        clearTimeout(forcedTimeoutTimers[index]);
        delete forcedTimeoutTimers[index];
    }

    updateCardUIState(index, 'touch');
    if (recognition) {
        try {
            recognition.stop(); 
            recognition.start();
        } catch (err) {
            try { recognition.start(); } catch(e){}
        }
    }
}

function handleVoiceMove(e) {
    if (!isQuizMode || evaluationTargetIndex === null) return;

    const dx = e.clientX - touchStartPos.x;
    const dy = e.clientY - touchStartPos.y;
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

        isCardLock = false; 
    }
}

function handleVoiceEnd(e) {
    if (!isQuizMode || evaluationTargetIndex === null) return;
    
    const index = evaluationTargetIndex;
    evaluationTargetIndex = null;

    const liveCardWrapper = document.querySelector(`.hanja-card-wrapper[data-index="${index}"]`);
    const isAlreadyPassed = liveCardWrapper && liveCardWrapper.classList.contains('card-final-correct');

    if (!isAlreadyPassed) {
        updateCardUIState(index, 'checking');
        appLog('System', `손떼기 완료 ➡️ #${index + 1} 독립 채점 세션 진입 (1.2초 만료 카운트다운)`);
        
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

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;     
    recognition.interimResults = true;  
    recognition.maxAlternatives = 1;

    recognition.onstart = function() {
        isListening = true;
        const activeIdx = evaluationTargetIndex !== null ? evaluationTargetIndex : processingTargetIndex;
        if (activeIdx !== null) {
            updateCardUIState(activeIdx, 'active');
            appLog('System', `🎙️ 마이크 세션 독립 시동 완료 ➡️ #${activeIdx + 1}`);
        }
    };

    recognition.onresult = function(event) {
        if (processingTargetIndex === null) return;
        if (solvedHanjas.has(processingTargetIndex)) return; 

        let currentTranscript = event.results[0][0].transcript;
        let isFinalResult = event.results[event.results.length - 1].isFinal;

        if (currentTranscript) {
            latestRawTranscript = currentTranscript;

            const cleanSpoken = currentTranscript.replace(/[\.\?\!\,\s]+/g, '');
            const cleanTarget = hanjaData[processingTargetIndex].m.replace(/\s+/g, '');
            
            const similarity = calculatePhoneticSimilarity(cleanSpoken, cleanTarget);

            if (similarity >= 0.6) {
                executeFinalJudgment(processingTargetIndex, true);
            } else if (isFinalResult) {
                appLog('Speech', `마감 프레임 패킷 도착 (일치율: ${Math.round(similarity * 100)}%)`);
                if (evaluationTargetIndex === null && forcedTimeoutTimers[processingTargetIndex]) {
                    executeFinalJudgment(processingTargetIndex, false);
                }
            } else {
                if (evaluationTargetIndex !== null) {
                    appLog('Speech', `🎙️ 실시간 분석 중: "${cleanSpoken}" (일치율: ${Math.round(similarity * 100)}%)`);
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

    // [최적화 유지] 마우스 및 터치 이벤트 리스너 라인을 완벽하게 걷어내고 PointerEvents 단일 결합 완수
    mainContainer.addEventListener('pointerdown', handleVoiceStart);
    mainContainer.addEventListener('pointermove', handleVoiceMove);
    mainContainer.addEventListener('pointerup', handleVoiceEnd);
    mainContainer.addEventListener('pointercancel', handleVoiceEnd);
    mainContainer.addEventListener('pointerleave', handleVoiceEnd);

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
                isCardLock = false; 

                Object.keys(forcedTimeoutTimers).forEach(key => {
                    clearTimeout(forcedTimeoutTimers[key]);
                    delete forcedTimeoutTimers[key];
                });

                // [최적화 유지] 600개의 카드를 순회하는 DOM 전수조사 병목 로직 완전 소멸. 
                // 초기 정적 캐시 자체를 리프레시하여 새 화면으로 고속 스왑 교체
                preRenderStaticTables();
                isFavoritesDirty = true; 
                
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
        document.getElementById('dev-console').classList.add('hidden/암묵적 가드 무력화');
        document.getElementById('dev-console').classList.add('hidden');
    });
};