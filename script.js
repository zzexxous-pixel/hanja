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

// 음성 제어 생명주기 관련 변수 (대책 A 시스템 적용)
let pressStartTime = 0;
let evaluationTargetIndex = null;
let isListening = false;
let wasHoldAction = false;
let recognition = null;

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
        const endIdx = startIdx + 100;
        const pageData = hanjaData.slice(startIdx, endIdx).map((item, localIdx) => ({
            ...item,
            originalIdx: startIdx + localIdx
        }));
        
        const tableDiv = document.createElement('div');
        tableDiv.className = "bg-white border border-slate-200 overflow-hidden mb-6";
        tableDiv.innerHTML = generateTableHTML(t, pageData, `${startIdx + 1} ~ ${endIdx}자`);
        tabCache[t] = tableDiv;
    }
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
                    <span class="text-[10px] font-mono font-bold text-slate-400 leading-none flex items-center gap-1">
                        <i class="fa-solid fa-microphone text-red-500 recording-icon hidden animate-pulse"></i>
                        #${globalIdx + 1}
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

    const liveElements = document.querySelectorAll('.quiz-blur-target');
    liveElements.forEach(el => el.classList.remove('solved'));

    for (let t = 1; t <= 6; t++) {
        if (tabCache[t]) {
            const cachedElements = tabCache[t].querySelectorAll('.quiz-blur-target');
            cachedElements.forEach(el => el.classList.remove('solved'));
        }
    }
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

// === 음성 입력 시작 및 종료 핸들러 제어부 (대책 A 적용) ===
function handleVoiceStart(e) {
    // [보정]: 훈음 가리기(isQuizMode === true) 상태가 아닐 때는 마이크 작동을 원천 무시
    if (!isQuizMode) return;

    const hanjaCell = e.target.closest('[data-action="open-modal"]');
    if (!hanjaCell) return;
    
    if (e.type === 'touchstart') {
        e.preventDefault(); // 스크롤/셀렉션 방지 및 터치 보정
    }

    pressStartTime = Date.now();
    evaluationTargetIndex = parseInt(hanjaCell.getAttribute('data-index'), 10);
    wasHoldAction = false;

    // 제안 2번 적용: 마이크 활성화 시 칸 전체 '빨간색 펄스' 및 녹음중 마이크 노출 활성화
    const cardWrapper = hanjaCell.closest('.bg-white.border.border-slate-100');
    if (cardWrapper) {
        cardWrapper.classList.add('mic-pulse-active');
        cardWrapper.classList.add('recording-active');
    }

    if (recognition && !isListening) {
        isListening = true;
        try {
            recognition.start();
        } catch (err) {
            console.error(err);
        }
    }
}

function handleVoiceEnd(e) {
    // 훈음 가리기 상태가 아닐 때는 팝업 제어 충돌 처리 및 마이크 흐름 예외 차단
    if (!isQuizMode) {
        const hanjaCell = e.target.closest('[data-action="open-modal"]');
        if (hanjaCell) {
            const idx = parseInt(hanjaCell.getAttribute('data-index'), 10);
            openModal(idx);
        }
        return;
    }

    if (evaluationTargetIndex === null) return;
    const duration = Date.now() - pressStartTime;
    
    const targetElement = document.querySelector(`[data-action="open-modal"][data-index="${evaluationTargetIndex}"]`);
    if (targetElement) {
        const cardWrapper = targetElement.closest('.bg-white.border.border-slate-100');
        if (cardWrapper) {
            cardWrapper.classList.remove('mic-pulse-active');
            cardWrapper.classList.remove('recording-active');
        }
    }

    if (recognition && isListening) {
        recognition.stop();
        isListening = false;
    }

    if (duration >= 300) {
        wasHoldAction = true; // 홀드 액션으로 확정하여 click 이벤트 무력화 선언
    } else {
        if (e.type === 'touchend') {
            openModal(evaluationTargetIndex);
        }
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
}

function closeModal() {
    const modal = document.getElementById('detail-modal');
    modal.add('opacity-0');
    modal.querySelector('.transform').classList.add('scale-95');
    modal.querySelector('.transform').classList.remove('scale-100');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

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

// === 3. 웹 오디오 스피치 평가 객체 수립 및 초기 바인딩 ===
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = function(event) {
        if (evaluationTargetIndex === null) return;
        
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            }
        }

        if (finalTranscript) {
            const cleanSpoken = finalTranscript.replace(/[\.\?\!\,\s]+/g, '');
            const cleanTarget = hanjaData[evaluationTargetIndex].m.replace(/\s+/g, '');

            // 60% 유사도 기반 정답 인정 판단 매칭 연산 수행
            const similarity = calculatePhoneticSimilarity(cleanSpoken, cleanTarget);

            const targetElement = document.querySelector(`[data-action="open-modal"][data-index="${evaluationTargetIndex}"]`);
            const card = targetElement ? targetElement.closest('.bg-white.border.border-slate-100') : null;

            if (similarity >= 0.6) {
                if (card) {
                    card.classList.add('flash-correct');
                    setTimeout(() => card.classList.remove('flash-correct'), 600);
                }
                toggleSolvedState(evaluationTargetIndex, true);
                
                if (navigator.vibrate) navigator.vibrate(40);
            } else {
                if (card) {
                    card.classList.add('flash-incorrect');
                    setTimeout(() => card.classList.remove('flash-incorrect'), 600);
                }
                if (!bookmarks.includes(evaluationTargetIndex)) {
                    toggleBookmark(evaluationTargetIndex);
                }
                
                if (navigator.vibrate) navigator.vibrate([40, 80, 40]);
            }
        }
    };

    recognition.onend = function() { isListening = false; };
    recognition.onerror = function() { isListening = false; };
}

window.onload = function() {
    document.documentElement.style.setProperty('--hanja-size', `${defaultHanjaSizePx}px`);
    document.documentElement.style.setProperty('--hun-size', `${defaultHunSizePx}px`);
    
    preRenderStaticTables();
    activeFavoriteIndices = [...bookmarks];
    switchTab(1);

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => { stream.getTracks().forEach(track => track.stop()); })
        .catch(err => console.log("마이크 사전 권한 대기 혹은 거부됨"));
    }

    const mainContainer = document.getElementById('table-view-container');
    
    mainContainer.addEventListener('mousedown', handleVoiceStart);
    mainContainer.addEventListener('touchstart', handleVoiceStart, { passive: false });
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