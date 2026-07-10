// ==========================================================================
// === 음성 인식 및 채점 인프라 모듈 (speechEngine.js) ===
// ==========================================================================

const speechEngine = {
    recognition: null,
    isListening: false,
    silenceTimer: null, // 5초 무음 시간만료 제어용 내부 타이머 인스턴스 홀더
    options: null,      // 실행 시점마다 동적으로 주입받는 콜백 및 사양 객체 적재소

    // 한글 자모 분해 알고리즘 고정 데이터
    CHOSUNG: ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"],
    JUNGSEONG: ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"],
    JONGSEONG: ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄴㅈ","ㄴㅎ","ㄷ","ㄹ","ㄹㄱ","ㄹㅁ","ㄹㅂ","ㄹㅅ","ㄹㅌ","ㄹㅍ","ㄹㅎ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"],

    // [순수 연산] 한국어 유니코드 자모 추출 분해 메서드
    disassembleKorean(str) {
        let result = "";
        for (let i = 0; i < str.length; i++) {
            const charCode = str.charCodeAt(i);
            if (charCode >= 44032 && charCode <= 55203) {
                const hangulCode = charCode - 44032;
                const choIndex = Math.floor(hangulCode / 588);
                const jungIndex = Math.floor((hangulCode - (choIndex * 588)) / 28);
                const jongIndex = hangulCode % 28;
                result += this.CHOSUNG[choIndex] + this.JUNGSEONG[jungIndex] + this.JONGSEONG[jongIndex];
            } else {
                if (str[i] !== ' ') {
                    result += str[i];
                }
            }
        }
        return result;
    },

    // [순수 연산] O(N) 공간 복잡도 가비지 컬렉션(GC) 방어형 레벤슈타인 계산 메서드
    getLevenshteinDistance(a, b) {
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
            let temp = prevRow;
            prevRow = currRow;
            currRow = temp;
        }
        return prevRow[a.length];
    },

    // [순수 연산] 최종 자모 편집 거리 기반 백분율 일치율 산출 메서드
    calculatePhoneticSimilarity(wordA, wordB) {
        const jamoA = this.disassembleKorean(wordA);
        const jamoB = this.disassembleKorean(wordB);
        const maxLength = Math.max(jamoA.length, jamoB.length);
        if (maxLength === 0) return 1.0;
        const distance = this.getLevenshteinDistance(jamoA, jamoB);
        return 1 - (distance / maxLength);
    },

    // 내부 자원 비동기 스케줄러 청소 함수
    cleanup() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
    },

    // 인프라 초기화 및 Web Speech API 기본 파이프라인 정렬
    init() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'ko-KR';
            this.recognition.continuous = false;     
            this.recognition.interimResults = true;  
            this.recognition.maxAlternatives = 1;

            // 하드웨어 스트림 채널 개방 성공 리스너
            this.recognition.onstart = () => {
                this.isListening = true;
                if (this.options && this.options.onStart) {
                    this.options.onStart();
                }
            };

            // 음성 데이터 실시간 분석 및 내부 채점 독점 실행 리스너
            this.recognition.onresult = (event) => {
                if (!this.options) return;

                let currentTranscript = event.results[0][0].transcript;
                let isFinalResult = event.results[event.results.length - 1].isFinal;

                if (currentTranscript) {
                    // [버퍼 확보] 아이가 말을 시작하면 최초 기동되었던 무음 타임아웃 타이머를 즉각 해제 취소
                    this.cleanup();

                    const cleanSpoken = currentTranscript.replace(/[\.\?\!\,\s]+/g, '');
                    const cleanTarget = this.options.targetText.replace(/\s+/g, '');
                    
                    const similarity = this.calculatePhoneticSimilarity(cleanSpoken, cleanTarget);

                    // 자모 유사도가 60% 이상(>= 0.6) 도달 즉시 하이패스로 정답 통과 처리 후 스트림 파괴
                    if (similarity >= this.options.threshold) {
                        const cb = this.options.onSuccess;
                        this.cleanup();
                        this.options = null; 
                        if (cb) cb();
                        this.abort();
                    } else if (isFinalResult) {
                        // 최종 패킷이 떨어졌으나 임계치를 넘지 못했으므로 최종 오답 처리 후 스트림 파괴
                        const cb = this.options.onFail;
                        this.cleanup();
                        this.options = null;
                        if (cb) cb();
                        this.abort();
                    } else {
                        if (typeof appLog === 'function') {
                            appLog('Speech', `🎙️ 실시간 분석 중: "${cleanSpoken}" (현재 일치율: ${Math.round(similarity * 100)}%)`);
                        }
                    }
                }
            };

            // 브라우저 자연 종료(Auto-Silence) 및 하드웨어 스트림 폐쇄 리스너
            this.recognition.onend = () => {
                this.isListening = false;
                
                // 5초 만료 전이라도 기기 침묵 기전 등으로 스트림이 강제 종료된 경우 오답 결산 처리 유도
                if (this.options) {
                    const cb = this.options.onFail;
                    this.cleanup();
                    this.options = null;
                    if (cb) cb();
                }
            };

            // 드라이버 하드웨어 장애 리스너 가드
            this.recognition.onerror = (event) => {
                this.isListening = false;
                if (this.options) {
                    const cb = this.options.onFail;
                    this.cleanup();
                    this.options = null;
                    if (cb) cb();
                }
            };
        }
    },

    // 동적 사양 주입형 마이크 시동 제어 메서드
    start(runOptions = {}) {
        if (!this.recognition) return;
        
        this.cleanup();
        this.options = runOptions;

        // 5초 무음 타임아웃 타이머 가동 (말을 하지 않고 시간이 다 되면 안전하게 오답 결산)
        this.silenceTimer = setTimeout(() => {
            if (this.options) {
                const cb = this.options.onFail;
                this.cleanup();
                this.options = null;
                if (cb) cb();
                this.abort();
            }
        }, runOptions.timeoutMs || 5000);

        try {
            this.recognition.stop(); 
            this.recognition.start();
        } catch (err) {
            try { this.recognition.start(); } catch(e){}
        }
    },

    stop() {
        if (!this.recognition) return;
        try {
            this.recognition.stop();
        } catch (err) {
            console.error("음성인식 stop 실패:", err);
        }
    },

    // 사용자가 작동 중 카드를 한 번 더 터치했을 때 즉시 호출되는 수동 취소 메서드
    cancel() {
        if (this.options) {
            const cb = this.options.onCancel;
            this.cleanup();
            this.options = null;
            if (cb) cb();
        }
        this.abort();
    },

    // 하드웨어 즉시 단절 및 스트림 전면 파괴 메서드
    abort() {
        if (!this.recognition) return;
        try {
            this.recognition.abort();
        } catch (err) {
            // 중복 실행 가드 무시
        }
    }
};