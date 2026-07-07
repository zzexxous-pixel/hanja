// ==========================================================================
// === 배정한자 마스터 플랫폼 v2.1 음성 인식 독립 가동 모듈 (speechEngine.js) ===
// ==========================================================================

const speechEngine = {
    recognition: null,
    isListening: false,
    
    // 외부 UI 컨트롤러(script.js)와 통신하기 위한 이벤트 훅 맵 객체
    callbacks: {
        onStart: null,
        onResult: null,
        onEnd: null,
        onError: null
    },

    // 한글 자모 분해 알고리즘 상수 데이터
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

    // 인프라 초기화 및 Web Speech API 네이티브 드라이버 인젝션
    init(userCallbacks = {}) {
        this.callbacks = { ...this.callbacks, ...userCallbacks };

        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'ko-KR';
            this.recognition.continuous = false;     
            this.recognition.interimResults = true;  
            this.recognition.maxAlternatives = 1;

            // 하드웨어 오디오 스트림 채널 개방 완료 이벤트
            this.recognition.onstart = () => {
                this.isListening = true;
                if (this.callbacks.onStart) {
                    this.callbacks.onStart();
                }
            };

            // 구글 음성 인식 패킷 스트림 수신 이벤트
            this.recognition.onresult = (event) => {
                let currentTranscript = event.results[0][0].transcript;
                let isFinalResult = event.results[event.results.length - 1].isFinal;
                
                if (this.callbacks.onResult) {
                    this.callbacks.onResult(currentTranscript, isFinalResult);
                }
            };

            // 하드웨어 스트림 폐쇄 완료 이벤트
            this.recognition.onend = () => {
                this.isListening = false;
                if (this.callbacks.onEnd) {
                    this.callbacks.onEnd();
                }
            };

            // 기기 오디오 하드웨어 또는 권한 거부 장애 발생 이벤트
            this.recognition.onerror = (event) => {
                this.isListening = false;
                if (this.callbacks.onError) {
                    this.callbacks.onError(event.error);
                }
            };
        }
    },

    // 마이크 개방 시동 명령
    start() {
        if (!this.recognition) return;
        try {
            this.recognition.stop(); 
            this.recognition.start();
        } catch (err) {
            try { this.recognition.start(); } catch(e){}
        }
    },

    // 마이크 수집 정상 중단 명령
    stop() {
        if (!this.recognition) return;
        try {
            this.recognition.stop(); 
            this.recognition.start();
        } catch (err) {
            try { this.recognition.start(); } catch(e){}
        }
    },

    // 마이크 스트림 강제 파괴 및 자원 즉시 반환 명령
    abort() {
        if (!this.recognition) return;
        try {
            this.recognition.abort();
        } catch (err) {
            console.error("음성인식 abort 실패:", err);
        }
    }
};