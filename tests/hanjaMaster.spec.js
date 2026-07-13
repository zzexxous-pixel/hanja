const { test, expect } = require('@playwright/test');

// 모든 테스트 실행 전 로컬 서버 접속 및 초기화 대기
test.beforeEach(async ({ page }) => {
  await page.goto('https://zzexxous-pixel.github.io/hanja-test/');
  await page.waitForLoadState('networkidle');
});

test.describe('4급 한자 마스터 - 기본 기능 및 모달 테스트 (일반 모드)', () => {

  test('시나리오 1: 메인 페이지 초기 로드 및 디자인 스냅샷 검사', async ({ page }) => {
    // 헤더 타이틀 노출 확인
    const title = page.locator('.header-title h1');
    await expect(title).toHaveText('4급 한자 마스터');

    // 기본 1페이지 인디케이터 확인 (50자 단위 분할 스펙)
    const pager = page.locator('#page-indicator');
    await expect(pager).toHaveText('1 / 12');

    // 첫 페이지 첫 번째 한자가 '價'(값 가)인지 데이터 검증
    const firstHanja = page.locator('.dynamic-hanja-size').first();
    await expect(firstHanja).toHaveText('價');

    // 디자인 깨짐 방지를 위한 초기 화면 시각적 회귀 테스트 스냅샷
    await expect(page).toHaveScreenshot('01-init-layout.png');
  });

  test('시나리오 2: 한자 카드 클릭 시 상세 모달 팝업 및 TTS/사전 링크 검증', async ({ page }) => {
    // 1. 첫 번째 한자 카드(價) 영역 클릭
    await page.locator('[data-action="open-modal"]').first().click();

    // 2. 모달 활성화 및 내용 검증
    const modal = page.locator('#detail-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('#modal-hanja')).toHaveText('價');
    await expect(modal.locator('#modal-hun')).toHaveText('값 가');

    // 3. 네이버 한자 사전 검색 새 창 링크 주소 일치 여부 검증
    const naverLink = modal.locator('#naver-link');
    await expect(naverLink).toHaveAttribute('href', /hanja\.dict\.naver\.com/);

    // 4. 닫기 버튼 작동 검증
    await page.locator('[data-action="close-modal"]').click();
    await expect(modal).toBeHidden();
  });

  test('시나리오 3: 페이지네이션 및 즐겨찾기(노트) 실시간 연동 테스트', async ({ page }) => {
    // 1. 다음 페이지 버튼 클릭 -> 2페이지 전환 검증
    await page.click('#btn-next-page');
    await expect(page.locator('#page-indicator')).toHaveText('2 / 12');

    // 2. 다시 1페이지로 복귀
    await page.click('#btn-prev-page');

    // 3. 첫 번째 한자 카드 즐겨찾기 별표 토글 클릭
    const bookmarkBtn = page.locator('[data-action="toggle-bookmark"]').first();
    await bookmarkBtn.click();

    // 4. 즐겨찾기 탭(★) 활성화 클릭
    await page.click('#tab-7');
    await expect(page.locator('#page-indicator')).toHaveText('★ / 12');

    // 5. 즐겨찾기 화면에 방금 등록한 '價' 카드가 존재치 확인
    const favoriteCard = page.locator('.hanja-card-wrapper');
    await expect(favoriteCard).toBeVisible();
    await expect(favoriteCard.locator('.dynamic-hanja-size')).toHaveText('價');
  });
});


test.describe('4급 한자 마스터 - 자가 테스트 및 음성 인식 인프라 검증', () => {

  test('시나리오 4: 말하기 도전(퀴즈 모드) 활성화 및 훈음 블러 스크리닝 검증', async ({ page }) => {
    // 1. 말하기 도전 토글 버튼 클릭
    const quizToggle = page.locator('#btn-toggle-quiz');
    await quizToggle.click();

    // 버튼 테마가 초록색(theme-emerald)으로 변경되고 텍스트가 바뀌었는지 검증
    await expect(quizToggle).toHaveClass(/theme-emerald/);
    await expect(quizToggle.locator('span')).toHaveText('도전 그만하기');

    // 2. 훈음 라벨 블러 스타일링 렌더링 확인 스냅샷
    await expect(page).toHaveScreenshot('02-quiz-mode-blur.png');

    // 3. 퀴즈 모드 상태에서 훈음 가림막 영역 수동 클릭 시 개별 블러 해제(solved) 처리 검증
    const firstHunText = page.locator('.quiz-blur-target').first();
    await page.locator('[data-action="click-hun"]').first().click();
    await expect(firstHunText).toHaveClass(/solved/);
  });

test('시나리오 5: Web Speech API 모킹을 이용한 발음 채점 성공(정답 파이프라인) 테스트', async ({ page }) => {
    // 💡 [핵심 수정] 브라우저가 최초 구동되며 Web Speech API를 바인딩하기 전에 순정 API 자체를 완벽하게 가로챕니다.
    await page.addInitScript(() => {
      class MockSpeechRecognition {
        constructor() {
          this.lang = 'ko-KR';
          this.continuous = false;
          this.interimResults = true;
          this.maxAlternatives = 1;
        }
        
        start() {
          // 실제 하드웨어 마이크가 켜지는 미세한 딜레이를 모사
          setTimeout(() => {
            if (typeof this.onstart === 'function') this.onstart();
          }, 40);
          
          // 250ms 후 사용자가 명확하게 "값 가"라고 발음한 가짜 오디오 패킷 주입
          setTimeout(() => {
            if (typeof this.onresult === 'function') {
              const mockEvent = {
                results: [
                  [{ transcript: '값 가' }]
                ]
              };
              // speechEngine.js 내부의 결과 분석 배열 판정 규격 완벽 동기화
              mockEvent.results[0].isFinal = true; 
              this.onresult(mockEvent);
            }
          }, 250);
        }
        
        // 시동 시 기존 세션을 강제 파괴할 때 예외 및 중복 리스너 꼬임을 차단하기 위해 비워둠
        stop() {}  
        abort() {} 
      }

      // 브라우저 전역 음성인식 생성자 교체
      window.SpeechRecognition = MockSpeechRecognition;
      window.webkitSpeechRecognition = MockSpeechRecognition;
    });

    // 💡 [중요] 모킹 레이어가 활성화된 상태에서 페이지를 새롭게 로드(진입)합니다.
    await page.goto('https://zzexxous-pixel.github.io/hanja-test/');
    await page.waitForLoadState('networkidle');

    // 1. 말하기 도전(퀴즈 모드) 모드 가동
    await page.click('#btn-toggle-quiz');

    // 2. 첫 번째 카드(價 - 값 가)를 클릭하여 가짜 음성 인식 파이프라인 시동
    await page.locator('[data-action="open-modal"]').first().click();

    // 3. 정답 처리 피드백 UI 상태 검증 (⏳에서 ⭕로 실시간 변경 및 card-final-correct 클래스 장착 확인)
    const firstCardWrapper = page.locator('.hanja-card-wrapper').first();
    const statusLabel = firstCardWrapper.locator('.card-status-label');
    
    // script.js의 executeFinalJudgment 연산 완수 대기 및 DOM 상태 검증
    await expect(statusLabel).toHaveText('⭕');
    await expect(firstCardWrapper).toHaveClass(/card-final-correct/);
    
    // 훈음 가림막도 자모 분해 및 레벤슈타인 거리를 통과해 자동으로 해제(solved) 되었는지 최종 검증
    await expect(firstCardWrapper.locator('.quiz-blur-target')).toHaveClass(/solved/);
  });
});


test.describe('4급 한자 마스터 - 이스터에그 디버그 모듈 테스트', () => {

  test('시나리오 6: 헤더 타이틀 5회 연타 시 개발자 시스템 로그 콘솔 활성화 검증', async ({ page }) => {
    const titleArea = page.locator('.header-title');
    
    // 2.5초 임계값 이내에 연속 5회 광속 클릭 이벤트 발생
    for (let i = 0; i < 5; i++) {
      await titleArea.click();
    }

    // 하단 고정 디버그 콘솔창 드로어가 정상 노출 상태로 전환되었는지 검증
    const devConsole = page.locator('#dev-console');
    await expect(devConsole).not.toHaveClass(/hidden/);
    await expect(devConsole.locator('#dev-console-body')).toContainText('4급 배정한자 플랫폼 학습 엔진 초기화 가동');
  });
});

test.describe('4급 한자 마스터 - 예외 케이스 및 데이터 무결성 철벽 검증', () => {

test('시나리오 7: 글꼴 크기 동적 조작계 작동 및 로컬스토리지 영구 저장 검증', async ({ page }) => {
    // 1. 초기 한자 크기 CSS 변수 및 로컬스토리지 상태 확인
    const initialHanjaSize = await page.evaluate(() => localStorage.getItem('hanja_size') || '45');
    
    // 2. 💡 [수정] 실제 HTML 속성에 맞추어 정확한 onclick 매핑 버튼 클릭
    const fontUpBtn = page.locator('button[onclick="adjustFontSize(3)"]');
    await fontUpBtn.click();

    // 3. 증가된 픽셀 값이 로컬스토리지 및 루트 스타일 변수에 정상 반영되었는지 검증
    const updatedSize = Number(initialHanjaSize) + 3;
    const currentHanjaSize = await page.evaluate(() => localStorage.getItem('hanja_size'));
    expect(Number(currentHanjaSize)).toBe(updatedSize);

    const rootHanjaSizeStyle = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--hanja-size').trim());
    expect(rootHanjaSizeStyle).toBe(`${updatedSize}px`);
  });

  test('시나리오 8: 음성인식 실패(오답) 시 오답 피드백(❌) 및 블러 가림막 유지 검증', async ({ page }) => {
    // 음성인식 실패(오답 패킷) 모킹 주입
    await page.addInitScript(() => {
      window.SpeechRecognition = window.webkitSpeechRecognition = class {
        start() {
          setTimeout(() => { if (this.onstart) this.onstart(); }, 20);
          setTimeout(() => {
            if (this.onresult) {
              const mockEvent = { results: [[{ transcript: '엉뚱한발음' }]] };
              mockEvent.results[0].isFinal = true; // 오답 확정 패킷 송출
              this.onresult(mockEvent);
            }
          }, 200);
        }
        stop() {} abort() {}
      };
    });

    await page.goto('https://zzexxous-pixel.github.io/hanja-test/');
    await page.click('#btn-toggle-quiz'); // 퀴즈 모드 진입

    // 첫 번째 카드 클릭하여 오답 유도
    const firstCardWrapper = page.locator('.hanja-card-wrapper').first();
    await page.locator('[data-action="open-modal"]').first().click();

    // 1. 오답 결과 피드백 UI 검증 (❌ 마크 및 card-final-incorrect 클래스 적재 확인)
    const statusLabel = firstCardWrapper.locator('.card-status-label');
    await expect(statusLabel).toHaveText('❌');
    await expect(firstCardWrapper).toHaveClass(/card-final-incorrect/);

    // 2. 💡 [수정] 오답이므로 훈음 블러 가림막이 해제되지 않고 완벽하게 잠겨있는지 정밀 검증
    const blurTarget = firstCardWrapper.locator('.quiz-blur-target');
    await expect(blurTarget).not.toHaveClass(/solved/);
  });

  test('시나리오 9: 음성 인식 도중 카드 재클릭 시 수동 취소(cancel) 및 상태 원복 검증', async ({ page }) => {
    // 마이크가 켜진 상태를 유지하도록 대기 모킹
    await page.addInitScript(() => {
      window.SpeechRecognition = window.webkitSpeechRecognition = class {
        start() { setTimeout(() => { if (this.onstart) this.onstart(); }, 20); }
        stop() {} abort() {} // 사용자가 취소하기 전까지 무한 대기
      };
    });

    await page.goto('https://zzexxous-pixel.github.io/hanja-test/');
    await page.click('#btn-toggle-quiz');

    const firstCardWrapper = page.locator('.hanja-card-wrapper').first();
    const actionArea = page.locator('[data-action="open-modal"]').first();

    // 1. 첫 번째 클릭 -> 마이크 세션 가동 (active 상태 진입 확인)
    await actionArea.click();
    await expect(firstCardWrapper).toHaveClass(/recording-active/);

    // 2. [재클릭 시 취소 기전] 인식 중일 때 한 번 더 클릭하여 취소(cancel) 발생 유도
    await actionArea.click();

    // 3. 상태가 취소되어 다시 초기 대기 상태(#1)로 복원되었는지 검증
    const statusLabel = firstCardWrapper.locator('.card-status-label');
    await expect(statusLabel).toHaveText('#1');
    await expect(firstCardWrapper).not.toHaveClass(/recording-active/);
  });

  test('시나리오 10: 도전 모드 해제 시 JIT(Just-In-Time) 전역 메모리 캐시 리셋 무결성 검증', async ({ page }) => {
    await page.click('#btn-toggle-quiz'); // 퀴즈모드 ON
    
    // 임의로 1번 카드를 수동 클릭하여 solved(정답) 상태 클래스 강제 부여
    await page.locator('[data-action="click-hun"]').first().click();
    await expect(page.locator('.quiz-blur-target').first()).toHaveClass(/solved/);

    // 도전 그만하기 클릭 -> 리셋 기전 활성화
    await page.click('#btn-toggle-quiz'); 

    // 현재 노출된 탭의 UI가 흔적 없이 깔끔하게 일반 모드로 청소(Reset)되었는지 검증
    const firstCardWrapper = page.locator('.hanja-card-wrapper').first();
    const firstHunText = page.locator('.quiz-blur-target').first();
    
    await expect(firstCardWrapper).not.toHaveClass(/card-final-correct|card-final-incorrect/);
    await expect(firstHunText).not.toHaveClass(/solved/);
  });
});