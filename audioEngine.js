// ==========================================================================
// === 배정한자 마스터 플랫폼 오디오 및 TTS 독립 가동 모듈 (audioEngine.js) ===
// ==========================================================================

const audioEngine = {
    ctx: null,

    // 저사양 태블릿 하드웨어 오디오 스트림 드라이버 가드 및 초기화 함수
    init() {
        try {
            if (!this.ctx) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        } catch (err) {
            console.error("오디오 컨텍스트 초기화 장애:", err);
        }
    },

    // [정답 효과음] 싱글톤 렌더링 방식의 독립 실행 메서드
    playCorrect() {
        try {
            this.init();
            const now = this.ctx.currentTime;
            
            // 볼륨 최대화 엔벨롭 및 화음 이펙터 게인 노드 구성
            const gainNode = this.ctx.createGain();
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.4, now + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            
            osc1.type = 'sine';
            osc2.type = 'triangle';

            osc1.frequency.setValueAtTime(523.25, now); // C5
            osc1.frequency.setValueAtTime(659.25, now + 0.12); // E5

            osc2.frequency.setValueAtTime(659.25, now); // E5
            osc2.frequency.setValueAtTime(783.99, now + 0.12); // G5

            osc1.connect(gainNode);
            osc2.connect(gainNode);
            gainNode.connect(this.ctx.destination);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 0.6);
            osc2.stop(now + 0.6);
        } catch (err) {
            console.error("정답 오디오 노드 합성 장애:", err);
        }
    },

    // [오답 효과음] 싱글톤 렌더링 방식의 독립 실행 메서드
    playIncorrect() {
        try {
            this.init();
            const now = this.ctx.currentTime;
            
            // 톱니파 저음 및 로우패스 필터 버저 게인 노드 구성
            const gainNode = this.ctx.createGain();
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.4, now + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

            const osc = this.ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(130, now); // 거친 130Hz 저음

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1200, now);

            osc.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.5);
        } catch (err) {
            console.error("오답 오디오 노드 합성 장애:", err);
        }
    },

    // [TTS 구동] Web Speech API 훈음 음성 가이드 메서드
    speak(text) {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ko-KR';
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
            
            if (typeof appLog === 'function') {
                appLog('System', `TTS 훈음 음성 재생 ➡️ "${text}"`);
            }
        }
    }
};