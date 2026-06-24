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

function updateCellStarUI(index, isStarred) {
    const liveWrappers = document.querySelectorAll(`.star-wrapper-${index}`);
    liveWrappers.forEach(starWrapper => {
        starWrapper.className = `star-wrapper-${index} flex items-center justify-center h-full ${isStarred ? 'text-amber-400' : 'text-slate-200 hover:text-slate-400'} text-base`;
    });

    const targetTab = Math.floor(index / 100) + 1;
    if (tabCache[targetTab]) {
        const cachedWrapper = tabCache[targetTab].querySelector(`.star-wrapper-${index}`);
        if (cachedWrapper) {
            cachedWrapper.className = `star-wrapper-${index} flex items-center justify-center h-full ${isStarred ? 'text-amber-400' : 'text-slate-200 hover:text-slate-400'} text-base`;
        }
    }
}

function updateModalStarState(index) {
    const starBtn = document.getElementById('modal-star-btn');
    if (!starBtn) return;
    if (bookmarks.includes(index)) {
        starBtn.className = "text-amber-500 hover:text-amber-600 text-2xl transition p-1";
    } else {
        starBtn.className = "text-slate-300 hover:text-slate-500 text-2xl transition p-1";
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
                    <span class="text-[10px] font-mono font-bold text-slate-400 leading-none flex items-center justify-center h-4 min-w-[24px]">
                        <i class="fa-solid fa-microphone text-red-500 text-base recording-icon hidden animate-pulse"></i>
                        <span class="number-label">#${globalIdx + 1}</span>
                    </span>
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
        if (tabBtn7) {
            tabBtn7.className = "w-10 h-10 text-xs font-bold rounded-lg transition-all text-slate-950 bg-yellow-400 hover:bg-yellow-300 border border-yellow-400 shadow-[0_0_12px_rgba(234,179,8,0.3)] flex items-center justify-center shrink-0";
        }
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
        if (tabBtn7) {
            tabBtn7.className = "w-10 h-10 text-xs font-bold rounded-lg transition-all text-yellow-300 hover:text-yellow-100 bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/45 flex items-center justify-center shrink-0";
        }
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

    appLog('System', `화면 탭 전환 ➡️ 대상 탭: ${tabNum === 7 ? '★ 즐겨찾기' : tabNum + '페이지'}`);
}

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

// === 음성 입력 시작, 이동 및 종료 제어 ===
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
    wasHoldAction = false;

    appLog('System', `한자 터치 감지 ➡️ #${evaluationTargetIndex + 1} (${hanjaData[evaluationTargetIndex].h})`);

    // iOS/크롬 보안 샌드박스 정책 우회: 동기 이벤트 핸들러 흐름에서 마이크 세션 가용 선점
    if (recognition && !isListening) {
        isListening = true;
        try {
            recognition.start();
            appLog('System', '웹 오디오 API 오디오 캡처 인스턴스 시동 완료');
        } catch (err) {
            appLog('Error', `마이크 시동 오류: ${err.message}`);
        }
    }

    holdTimer = setTimeout(() => {
        isHolding = true;
        const cardWrapper = hanjaCell.closest('.bg-white.border.border-slate-100');
        if (cardWrapper) {
            cardWrapper.classList.add('mic-pulse-active');
            cardWrapper.classList.add('recording-active');
        }
        appLog('System', '300ms 홀드 임계 타임 돌파. 빨간색 펄스 및 마이크 아이콘 활성화');
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

        if (recognition && isListening) {
            try {
                recognition.abort(); // 분석 없이 세션 즉시 취소 처리
            } catch (err) {
                console.error(err);
            }
            isListening = false;
        }

        const targetElement = document.querySelector(`[data-action="open-modal"][data-index="${evaluationTargetIndex}"]`);
        if (targetElement) {
            const cardWrapper = targetElement.closest('.bg-white.border.border-slate-100');
            if (cardWrapper) {
                cardWrapper.classList.remove('mic-pulse-active', 'recording-active');
            }
        }

        isHolding = false;
        wasHoldAction = true; 
        processingTargetIndex = null; 
        evaluationTargetIndex = null;

        appLog('System', `스크롤 임계값(10px) 이탈 감지 ➡️ 이동거리 ${distance.toFixed(1)}px (평가 취소 및 스크롤 전환)`);
    }
}

function handleVoiceEnd(e) {
    if (!isQuizMode) return; 

    clearTimeout(holdTimer);

    if (evaluationTargetIndex === null) return;
    const duration = Date.now() - pressStartTime;
    
    // 반응성을 위해 시각적 UI는 손가락을 떼는 즉시 0ms 단위로 선제 회수
    const targetElement = document.querySelector(`[data-action="open-modal"][data-index="${evaluationTargetIndex}"]`);
    if (targetElement) {
        const cardWrapper = targetElement.closest('.bg-white.border.border-slate-100');
        if (cardWrapper) {
            cardWrapper.classList.remove('mic-pulse-active', 'recording-active');
        }
    }

    if (duration >= 300) {
        wasHoldAction = true;
        appLog('System', `꾹 누르기(Hold) 종료 감지 (총 ${duration}ms 유지). 잔음 버퍼(400ms) 카운트다운 시작`);
        
        // 잔음 꼬리 버퍼(Tail Time) 400ms 연장 메커니즘 기동
        const recordTimeoutTarget = recognition;
        setTimeout(() => {
            if (recordTimeoutTarget && isListening) {
                try {
                    recordTimeoutTarget.stop(); 
                    appLog('System', '잔음 버퍼 만료 ➡️ 오디오 캡처 종료(stop) 및 최종 텍스트 번역 요청');
                } catch (err) {
                    console.error(err);
                }
                isListening = false;
            }
        }, 400);
    } else {
        wasHoldAction = true; 
        if (recognition && isListening) {
            try {
                recognition.abort(); 
            } catch (err) {
                console.error(err);
            }
            isListening = false;
        }
        processingTargetIndex = null; 
        appLog('System', `단순 클릭 터치 다운 감지 (${duration}ms 유지). 음성 세션 파기 및 팝업 대기`);

        if (e.type === 'touchend' || e.type === 'mouseup') {
            openModal(evaluationTargetIndex);
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

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = function(event) {
        if (processingTargetIndex === null) return;
        
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            }
        }

        if (finalTranscript) {
            const cleanSpoken = finalTranscript.replace(/[\.\?\!\,\s]+/g, '');
            const cleanTarget = hanjaData[processingTargetIndex].m.replace(/\s+/g, '');

            const similarity = calculatePhoneticSimilarity(cleanSpoken, cleanTarget);

            appLog('Speech', `음성 인식 완료 ➡️ 수집된 입력값: "${cleanSpoken}" / 목표값: "${cleanTarget}"`);
            appLog('System', `자모 분해 비교 매칭 ➡️ 유저 자모: [${disassembleKorean(cleanSpoken)}] / 정답 자모: [${disassembleKorean(cleanTarget)}]`);

            const targetElement = document.querySelector(`[data-action="open-modal"][data-index="${processingTargetIndex}"]`);
            const card = targetElement ? targetElement.closest('.bg-white.border.border-slate-100') : null;

            if (similarity >= 0.6) {
                appLog('Success', `발음 일치율 통과! 점수: ${(similarity * 100).toFixed(1)}% (임계치 60% 도과)`);
                if (card) {
                    card.classList.add('flash-correct');
                    setTimeout(() => card.classList.remove('flash-correct'), 600);
                }
                toggleSolvedState(processingTargetIndex, true);
                
                if (navigator.vibrate) navigator.vibrate(40);
            } else {
                appLog('Error', `발음 일치율 미달... 점수: ${(similarity * 100).toFixed(1)}% (임계치 60% 미만)`);
                if (card) {
                    card.classList.add('flash-incorrect');
                    setTimeout(() => card.classList.remove('flash-incorrect'), 600);
                }
                if (!bookmarks.includes(processingTargetIndex)) {
                    toggleBookmark(processingTargetIndex);
                }
                
                if (navigator.vibrate) navigator.vibrate([40, 80, 40]);
            }
        }
        processingTargetIndex = null; 
    };

    recognition.onend = function() { 
        isListening = false; 
        cleanupActiveUI();
        appLog('System', '웹 오디오 API 오디오 세션 정상 마감 및 인스턴스 전면 휴지(Idle) 상태 전환');
        // 잔음 버퍼 연산 처리가 완료될 때까지 안전하게 인덱스를 보존 후 해제
        setTimeout(() => { processingTargetIndex = null; }, 500);
    };
    recognition.onerror = function(event) { 
        isListening = false; 
        cleanupActiveUI();
        processingTargetIndex = null;

        // 추가: 의도적인 스크롤 취소(aborted)일 때는 에러가 아닌 시스템 로그로 우회
        if (event.error === 'aborted') {
            if (typeof appLog === 'function') {
                appLog('System', '사용자 스크롤 감지로 인해 음성 인식이 안전하게 취소되었습니다.');
            }
            return; // 에러 처리 스레드 종료
        }

        // 진짜 마이크 하드웨어 에러나 권한 에러일 때만 빨간색 Error 로그 출력
        if (typeof appLog === 'function') {
            appLog('Error', '음성 인식 모듈 하드웨어 에러 감지: ' + (event.error || 'unknown'));
        }
    };
}

window.onload = function() {
    document.documentElement.style.setProperty('--hanja-size', `${defaultHanjaSizePx}px`);
    document.documentElement.style.setProperty('--hun-size', `${defaultHunSizePx}px`);
    
    appLog('System', '4급 배정한자 플랫폼 학습 엔진 초기화 가동');
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