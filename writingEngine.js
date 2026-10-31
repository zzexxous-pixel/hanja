/**
 * writingEngine.js
 * 바른한자용 표준 붓글씨 획순 애니메이션 & 실시간 쓰기 판정 엔진
 * (1회성 MutationObserver 기반 부수 음영 즉시 하이라이트 & 터치 드로잉 무간섭 최적화)
 */
(function (global) {
  'use strict';

  let libraryPromise;
  function loadHanziWriter(callback, onError) {
    if (global.HanziWriter) { callback(); return; }
    if (!libraryPromise) libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'assets/vendor/hanzi-writer.min.js';
      script.onload = resolve;
      script.onerror = () => { script.remove(); libraryPromise = null; reject(new Error('쓰기 엔진 로딩 실패')); };
      document.head.appendChild(script);
    });
    libraryPromise.then(callback).catch(onError);
  }

  function WritingEngine(options) {
    if (!(this instanceof WritingEngine)) {
      return new WritingEngine(options);
    }

    const defaultOptions = {
      container: null,
      char: '永',
      width: 320,
      height: 320,
      strokeColor: '#1e293b',
      radicalColor: '#2563eb',        // 본체 부수 (선명한 파랑)
      outlineColor: '#e2e8f0',        // 일반 몸체 음영 (연회색)
      outlineRadicalColor: '#dbeafe', // 음영 부수 구분 (은은한 소프트 파스텔 블루)
      highlightColor: '#ef4444',
      drawingColor: '#334155',        // 직접 쓰기 필기선 (Dark Gray)
      animSpeed: 1.0,
      onCharLoaded: null,
      onStrokeChange: null,
      onStrokeSuccess: null,
      onStrokeError: null,
      onComplete: null
    };

    this.options = Object.assign({}, defaultOptions, options);
    this.container = typeof this.options.container === 'string'
      ? document.querySelector(this.options.container)
      : this.options.container;

    if (!this.container) {
      console.error('[WritingEngine] 유효한 컨테이너 엘리먼트가 필요합니다.');
      return;
    }

    this.char = this.options.char || '永';
    this.size = this.options.width || 320;
    this.writer = null;
    this._observer = null;
    this.meta = {
      char: this.char,
      totalStrokes: 0,
      radChar: '',
      radCount: 0,
      remainCount: 0,
      radStrokes: [],
      radPosition: '판별 중'
    };
    this._playToken = 0;
    this.currentStroke = 0;
    this.isReady = false;

    this._initDOM();
    loadHanziWriter(() => {
      this._initWriter();
    }, (error) => this._loadError(error));
  }

  WritingEngine.prototype = {
    _initDOM: function () {
      this.container.innerHTML = '';
      this.container.style.position = 'relative';
      this.container.style.width = `${this.size}px`;
      this.container.style.height = `${this.size}px`;
      this.container.style.boxSizing = 'border-box';
      this.container.style.backgroundColor = '#ffffff';

      // 1. 화면 리사이즈 시에도 찌그러짐 없는 1000x1000 벡터 격자 SVG
      const gridSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      gridSvg.setAttribute('width', '100%');
      gridSvg.setAttribute('height', '100%');
      gridSvg.setAttribute('viewBox', '0 0 1000 1000');
      gridSvg.setAttribute('shape-rendering', 'crispEdges');
      gridSvg.style.position = 'absolute';
      gridSvg.style.top = '0';
      gridSvg.style.left = '0';
      gridSvg.style.pointerEvents = 'none';

      gridSvg.innerHTML = `
        <rect x="1" y="1" width="998" height="998" fill="none" stroke="#64748b" stroke-width="2"/>
        <line x1="500" y1="0" x2="500" y2="1000" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="10 10"/>
        <line x1="0" y1="500" x2="1000" y2="500" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="10 10"/>
      `;
      this.container.appendChild(gridSvg);

      // 2. 부수 전용 클래스 스타일 태그 주입
      const radStyle = document.createElement('style');
      radStyle.textContent = `
        .writing-canvas-container svg path.hw-rad-outline {
          fill: ${this.options.outlineRadicalColor} !important;
          stroke: ${this.options.outlineRadicalColor} !important;
        }
      `;
      this.container.appendChild(radStyle);

      this.targetEl = document.createElement('div');
      this.targetEl.style.width = '100%';
      this.targetEl.style.height = '100%';
      this.container.appendChild(this.targetEl);
      if (!this._interruptDrawing) {
        this._interruptDrawing = () => {
          this._interruptDemo();
          if (this.isReady && this.writer) this.writer.resumeAnimation();
        };
        this.container.addEventListener('mousedown', this._interruptDrawing, true);
        this.container.addEventListener('touchstart', this._interruptDrawing, {capture: true, passive: true});
      }


      // 3. 비동기 렌더링 즉시 감지용 1회성 옵저버 시작
      this._startObserver();
    },

    // ★ 1회성 Observer 가동기 (태깅 완료 시 자동 소멸)
    _startObserver: function () {
      if (this._observer) {
        this._observer.disconnect();
        this._observer = null;
      }
      this._observer = new MutationObserver(() => {
        this._tagOutlineRadicals();
      });
      this._observer.observe(this.targetEl, { childList: true, subtree: true });
    },

    _loadError: function (error) {
      this._interruptDemo();
      this.isReady = false;
      this.hasLoadError = true;
      this.meta.totalStrokes = 0;
      this.meta.loadError = true;
      this._notifyStrokeChange();
      this.targetEl.innerHTML = '<p class="stroke-load-error" role="alert">획 데이터를 불러오지 못했습니다. 창을 닫고 다시 열어 주세요.</p>';
      if (typeof this.options.onCharLoaded === 'function') this.options.onCharLoaded(this.meta);
      console.error('[WritingEngine]', error);
    },

    _initWriter: function () {
      if (!global.HanziWriter) return;
      this.targetEl.innerHTML = '';
      
      const penWidth = Math.max(16, Math.round(this.size * 0.055));

      this.writer = global.HanziWriter.create(this.targetEl, this.char, {
        charDataLoader: character => global.StrokeData.load(character),
        width: this.size,
        height: this.size,
        padding: Math.max(10, Math.round(this.size * 0.05)),
        strokeColor: this.options.strokeColor,
        radicalColor: this.options.radicalColor,
        outlineColor: this.options.outlineColor,
        highlightColor: this.options.highlightColor,
        drawingColor: this.options.drawingColor,
        drawingWidth: penWidth,
        strokeAnimationSpeed: this.options.animSpeed * 1.2,
        delayBetweenStrokes: 150,
        strokeFadeDuration: 0,
        showOutline: true,
        showCharacter: false,
        highlightOnComplete: false,
        onLoadCharDataSuccess: (data) => {
          this._parseCharMeta(data);
          this.hasLoadError = false;
          this.isReady = true;
          this._resetSession();
          this._tagOutlineRadicals();
          this._notifyStrokeChange();

          if (typeof this.options.onCharLoaded === 'function') {
            this.options.onCharLoaded(this.meta);
          }
        },
        onLoadCharDataError: (err) => {
          this._loadError(err);
        }
      });
    },

    _parseCharMeta: function (data) {
      this._charData = data;
      const totalStrokes = data.strokes.length;
      const radStrokes = Array.isArray(data.radStrokes) ? data.radStrokes : [];
      const radCount = radStrokes.length;
      const remainCount = Math.max(0, totalStrokes - radCount);
      const radChar = data.radChar || data.radical || '';

      let radPosition = '단독/전체';
      if (radCount > 0 && radCount < totalStrokes && data.medians) {
        let radMinX = Infinity, radMaxX = -Infinity;
        let radMinY = Infinity, radMaxY = -Infinity;
        let radAvgX = 0, ptCount = 0;

        radStrokes.forEach((sIdx) => {
          const med = data.medians[sIdx];
          if (med) {
            med.forEach((pt) => {
              radMinX = Math.min(radMinX, pt[0]);
              radMaxX = Math.max(radMaxX, pt[0]);
              radMinY = Math.min(radMinY, pt[1]);
              radMaxY = Math.max(radMaxY, pt[1]);
              radAvgX += pt[0];
              ptCount++;
            });
          }
        });

        if (ptCount > 0) {
          radAvgX /= ptCount;
          const radWidth = radMaxX - radMinX;
          const radHeight = radMaxY - radMinY;

          if (radMaxX < 560 && radAvgX < 450 && radHeight > 350) {
            radPosition = '변 (좌측)';
          } else if (radMinX > 460 && radAvgX > 560 && radHeight > 350) {
            radPosition = '방 (우측)';
          } else if (radMinY > 500 && radWidth > 380) {
            radPosition = '머리 (상단)';
          } else if (radMaxY < 500 && radWidth > 380) {
            radPosition = '발 (하단)';
          } else if (radWidth > 600 || radHeight > 600) {
            radPosition = '받침 / 몸 (외곽)';
          } else {
            radPosition = '조합 / 내부';
          }
        }
      }

      this.meta = {
        char: this.char,
        totalStrokes: totalStrokes,
        radChar: radChar,
        radCount: radCount,
        remainCount: remainCount,
        radStrokes: radStrokes,
        radPosition: radPosition
      };
    },

    // ★ 배경 음영의 부수 path 태깅 및 성공 즉시 Observer 연결 영구 해제
    _tagOutlineRadicals: function () {
      if (!this.targetEl || !this.meta.totalStrokes || this.meta.totalStrokes <= 0) return false;
      const svg = this.targetEl.querySelector('svg');
      if (!svg) return false;
      const outlineGroup = svg.querySelector('g');
      if (!outlineGroup) return false;
      const paths = outlineGroup.querySelectorAll('path');
      if (!paths || paths.length < this.meta.totalStrokes) return false;

      if (this.meta.radStrokes && this.meta.radStrokes.length > 0) {
        paths.forEach((p, idx) => {
          if (this.meta.radStrokes.includes(idx)) {
            p.classList.add('hw-rad-outline');
          } else {
            p.classList.remove('hw-rad-outline');
          }
        });
      }

      // 태깅 성공 즉시 감시기를 꺼서 터치 드로잉 중의 불필요한 루프를 100% 차단
      if (this._observer) {
        this._observer.disconnect();
        this._observer = null;
      }
      return true;
    },

    _resetSession: function () {
      if (!this.writer || !this.isReady) return;

      this.writer.resumeAnimation();
      this.writer.cancelQuiz();
      this.writer.hideCharacter();

      this._interruptDemo();
      this.currentStroke = 0;
      this.writer.showOutline();
      this.startQuiz();
      this._tagOutlineRadicals();
      this._notifyStrokeChange();
    },

    resize: function (newSize) {
      if (!newSize || Math.abs(this.size - newSize) < 4) return;
      this._interruptDemo();
      this.size = Math.round(newSize);
      
      this.container.style.width = `${this.size}px`;
      this.container.style.height = `${this.size}px`;

      if (this.writer && typeof this.writer.updateDimensions === 'function') {
        const penWidth = Math.max(16, Math.round(this.size * 0.055));
        this.writer.updateDimensions({
          width: this.size,
          height: this.size,
          padding: Math.max(10, Math.round(this.size * 0.05)),
          drawingWidth: penWidth
        });
        this._tagOutlineRadicals();
      } else {
        this._initDOM();
        this._initWriter();
      }
    },

    // ★ 새 한자 로드 시 메타 리셋 및 1회성 Observer 재가동
    setCharacter: function (char) {
      if (!char) return;
      this._interruptDemo();
      this.char = char;
      if (this.writer) {
        if (this.hasLoadError) { this._initWriter(); return; }
        this.isReady = false;
        this.meta.totalStrokes = 0;
        this._startObserver();

        Promise.all([
          this.writer.setCharacter(char),
          global.StrokeData.load(char)
        ]).then(([_, charData]) => {
          if (this.char !== char) return;
          this._parseCharMeta(charData);
          this.hasLoadError = false;
          this.isReady = true;
          this._resetSession();
          this._tagOutlineRadicals();
          if (typeof this.options.onCharLoaded === 'function') {
            this.options.onCharLoaded(this.meta);
          }
        }).catch((err) => {
          if (this.char === char) this._loadError(err);
        });
      } else {
        loadHanziWriter(() => this._initWriter(), error => this._loadError(error));
      }
    },

    getMeta: function () {
      return Object.assign({}, this.meta);
    },

    // Draw the real writer path once; quiz commits the same path without replacing it.
    // A generation token prevents old animation callbacks from advancing after touch/back/reset.
    playAnimation: async function () {
      if (!this.writer || !this.isReady) return;
      if (this.currentStroke === this.meta.totalStrokes) this.reset();
      this.writer.resumeAnimation();
      this._interruptDemo();
      const token = this._playToken;
      this._setPlaying(true);
      while (token === this._playToken && this.currentStroke < this.meta.totalStrokes) {
        if (!await this._demonstrateStroke(token)) break;
      }
      if (token === this._playToken) this._setPlaying(false);
    },

    _setPlaying: function (playing) {
      this.isPlaying = playing;
      if (this.options.onPlaybackChange) this.options.onPlaybackChange(playing);
    },

    _interruptDemo: function () {
      this._playToken++;
      if (this._clearDemo) this._clearDemo();
      this._setPlaying(false);
    },

    // Animate the actual Hanzi Writer main path. There is no second SVG or handoff.
    _drawDemoStroke: function (index) {
      const svg = this.targetEl.querySelector('svg');
      // Pinned HW 3.7.3 SVG renderer mounts outline, main, highlight in that order.
      const paths = svg ? svg.querySelectorAll('path[clip-path]') : [];
      const ink = paths[this.meta.totalStrokes + index];
      if (!ink) return Promise.resolve(false);
      const opacity = ink.style.opacity, offset = ink.style.strokeDashoffset;
      const length = parseFloat(ink.getAttribute('stroke-dasharray'));
      const duration = Math.max(180, Math.min(1100, length / (this.options.animSpeed || 1) * 1.2));
      return new Promise(resolve => {
        let frame, start;
        const clear = (committed = false) => {
          global.cancelAnimationFrame(frame);
          ink.classList.remove('demo-stroke-ink');
          if (!committed) {
            ink.style.opacity = opacity;
            ink.style.strokeDashoffset = offset;
          }
          if (this._clearDemo === clear) this._clearDemo = null;
          resolve(false);
        };
        this._clearDemo = clear;
        ink.classList.add('demo-stroke-ink');
        ink.style.opacity = '1';
        const tick = now => {
          if (start === undefined) start = now;
          const progress = Math.min(1, (now-start)/duration);
          ink.style.strokeDashoffset = String(length*(1-progress));
          if (progress < 1) frame = global.requestAnimationFrame(tick);
          else resolve(true);
        };
        ink.style.strokeDashoffset = String(length);
        frame = global.requestAnimationFrame(tick);
      });
    },

    _demonstrateStroke: async function (token) {
      const index = this.currentStroke;
      const writer = this.writer;
      if (!await this._drawDemoStroke(index)) return false;
      if (token !== this._playToken || !this.isReady || this.writer !== writer || this.currentStroke !== index) return false;
      this._advanceByDemo = true;
      writer.skipQuizStroke();
      this._advanceByDemo = false;
      this.currentStroke = index + 1;
      this._notifyStrokeChange();
      // The quiz commits opacity=1 / dashoffset=0 to this very same path.
      if (this._clearDemo) this._clearDemo(true);
      return token === this._playToken;
    },

    pauseAnimation: function () {
      this._interruptDemo();
      if (this.writer && this.isReady) this.writer.pauseAnimation();
    },

    stepNextStroke: async function () {
      if (!this.writer || !this.isReady || this.currentStroke >= this.meta.totalStrokes) return;
      this.writer.resumeAnimation();
      this._interruptDemo();
      const token = this._playToken;
      this._setPlaying(true);
      await this._demonstrateStroke(token);
      if (token === this._playToken) this._setPlaying(false);
    },

    stepPrevStroke: function () {
      if (!this.writer || !this.isReady) return;
      this._interruptDemo();
      this.writer.resumeAnimation();
      this.currentStroke = Math.max(0, this.currentStroke - 1);
      this.startQuiz();
      this._notifyStrokeChange();
    },

    reset: function () {
      if (!this.writer || !this.isReady) return;
      this._resetSession();
    },

    startQuiz: function () {
      if (!this.writer || !this.isReady) return;

      if (this.currentStroke >= this.meta.totalStrokes) return;
      this.writer.quiz({
        quizStartStrokeNum: this.currentStroke,
        showHintAfterMisses: 1,
        onCorrectStroke: (data) => {
          this._interruptDemo();
          this.currentStroke = data.strokeNum + 1;
          this._notifyStrokeChange();
          if (typeof this.options.onStrokeSuccess === 'function') {
            this.options.onStrokeSuccess(this.currentStroke, this.meta.totalStrokes);
          }
        },
        onMistake: (data) => {
          if (typeof this.options.onStrokeError === 'function') {
            this.options.onStrokeError(data.strokeNum, '획의 순서나 방향이 올바르지 않습니다.');
          }
        },
        onComplete: () => {
          this.currentStroke = this.meta.totalStrokes;
          this._notifyStrokeChange();
          if (typeof this.options.onComplete === 'function') {
            this.options.onComplete({source: this._advanceByDemo ? 'demo' : 'writing'});
          }
        }
      });
    },

    _notifyStrokeChange: function () {
      if (typeof this.options.onStrokeChange === 'function') {
        this.options.onStrokeChange(this.currentStroke, this.meta.totalStrokes);
      }
    }
  };

  global.WritingEngine = WritingEngine;

})(typeof window !== 'undefined' ? window : this);