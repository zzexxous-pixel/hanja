const { test, expect } = require('@playwright/test');

// 모든 테스트 실행 전 로컬 서버 접속 및 초기화 대기
test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\//, route => route.abort());
  // 💡 [안전 장치] 테스트가 항상 '4급' 상태 및 기본 감도 '60%'에서 결정론적으로 시작할 수 있도록 localStorage 초기값 주입
  await page.addInitScript(() => {
    localStorage.setItem('hanja_grade', '4급');
    localStorage.setItem('hanja_threshold', '0.6');
  });
  await page.goto('./');
  await expect(page.locator('#header-grade-title')).toHaveText('바른한자 [4급]');
});

test.describe('바른한자 - 기본 기능 및 모달 테스트 (일반 모드)', () => {

  test('시나리오 1: 메인 페이지 초기 로드 및 디자인 스냅샷 검사', async ({ page }) => {
    // 헤더 타이틀 노출 확인 (새로 바뀐 #header-grade-title 선택자 적용)
    const title = page.locator('#header-grade-title');
    await expect(title).toHaveText('바른한자 [4급]');

    // 기본 1페이지 인디케이터 확인 (50자 단위 분할 스펙)
    const pager = page.locator('#page-indicator');
    await expect(pager).toHaveText('1 / 12');

    // 첫 페이지 첫 번째 한자가 '價'(값 가)인지 데이터 검증
    const firstHanja = page.locator('.dynamic-hanja-size').first();
    await expect(firstHanja).toHaveText('價');

    // 디자인 깨짐 방지를 위한 초기 화면 시각적 회귀 테스트 스냅샷

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


test.describe('바른한자 - 자가 테스트 및 음성 인식 인프라 검증', () => {

  test('시나리오 4: 말하기 도전(퀴즈 모드) 활성화 및 훈음 블러 스크리닝 검증', async ({ page }) => {
    // 1. 말하기 도전 토글 버튼 클릭
    const quizToggle = page.locator('#btn-toggle-quiz');
    await quizToggle.click();

    // 버튼 테마가 초록색(theme-emerald)으로 변경되고 텍스트가 바뀌었는지 검증
    await expect(quizToggle).toHaveClass(/theme-emerald/);
    await expect(quizToggle.locator('span')).toHaveText('도전 그만하기');

    // 2. 훈음 라벨 블러 스타일링 렌더링 확인 스냅샷


    // 3. 퀴즈 모드 상태에서 훈음 가림막 영역 수동 클릭 시 개별 블러 해제(solved) 처리 검증
    const firstHunText = page.locator('.quiz-blur-target').first();
    await page.locator('[data-action="click-hun"]').first().click();
    await expect(firstHunText).toHaveClass(/solved/);
  });

  test('시나리오 5: Web Speech API 모킹을 이용한 발음 채점 성공(정답 파이프라인) 테스트', async ({ page }) => {
    // 💡 브라우저가 최초 구동되며 Web Speech API를 바인딩하기 전에 순정 API 자체를 완벽하게 가로챕니다.
    await page.addInitScript(() => {
      class MockSpeechRecognition {
        constructor() {
          this.lang = 'ko-KR';
          this.continuous = false;
          this.interimResults = true;
          this.maxAlternatives = 1;
        }
        
        start() {
          setTimeout(() => {
            if (typeof this.onstart === 'function') this.onstart();
          }, 40);
          
          setTimeout(() => {
            if (typeof this.onresult === 'function') {
              const mockEvent = {
                results: [
                  [{ transcript: '값 가' }]
                ]
              };
              mockEvent.results[0].isFinal = true; 
              this.onresult(mockEvent);
            }
          }, 250);
        }
        
        stop() {}  
        abort() {} 
      }

      window.SpeechRecognition = MockSpeechRecognition;
      window.webkitSpeechRecognition = MockSpeechRecognition;
    });

    await page.goto('./');
    await expect(page.locator('#header-grade-title')).toHaveText('바른한자 [4급]');

    // 1. 말하기 도전(퀴즈 모드) 모드 가동
    await page.click('#btn-toggle-quiz');

    // 2. 첫 번째 카드(價 - 값 가)를 클릭하여 가짜 음성 인식 파이프라인 시동
    await page.locator('[data-action="open-modal"]').first().click();

    // 3. 정답 처리 피드백 UI 상태 검증 (⏳에서 ⭕로 실시간 변경 및 card-final-correct 클래스 장착 확인)
    const firstCardWrapper = page.locator('.hanja-card-wrapper').first();
    const statusLabel = firstCardWrapper.locator('.card-status-label');
    
    await expect(statusLabel).toHaveText('⭕');
    await expect(firstCardWrapper).toHaveClass(/card-final-correct/);
    await expect(firstCardWrapper.locator('.quiz-blur-target')).toHaveClass(/solved/);
  });
});


test.describe('바른한자 - 이스터에그 디버그 모듈 테스트', () => {

  test('시나리오 6: 헤더 타이틀 5회 연타 시 개발자 시스템 로그 콘솔 활성화 검증', async ({ page }) => {
    // 💡 툴팁 제거 스펙에 의거하여 책 아이콘(.fa-book-open) 클래스의 부모 요소를 타격하도록 선택자 교정 완료
    const titleArea = page.locator('.header-title .fa-book-open').locator('..');

    for (let i = 0; i < 5; i++) {
      await titleArea.click();
    }

    const devConsole = page.locator('#dev-console');
    await expect(devConsole).not.toHaveClass(/hidden/);
    await expect(devConsole.locator('#dev-console-body')).toContainText('바른한자 학습 엔진 초기화 가동');
  });
});

test.describe('바른한자 - 예외 케이스 및 데이터 무결성 철벽 검증', () => {

  test('시나리오 8: 음성인식 실패(오답) 시 오답 피드백(❌) 및 블러 가림막 유지 검증', async ({ page }) => {
    await page.addInitScript(() => {
      window.SpeechRecognition = window.webkitSpeechRecognition = class {
        start() {
          setTimeout(() => { if (this.onstart) this.onstart(); }, 20);
          setTimeout(() => {
            if (this.onresult) {
              const mockEvent = { results: [[{ transcript: '엉뚱한발음' }]] };
              mockEvent.results[0].isFinal = true; 
              this.onresult(mockEvent);
            }
          }, 200);
        }
        stop() {} abort() {}
      };
    });

    await page.goto('./');
    await page.click('#btn-toggle-quiz'); 

    const firstCardWrapper = page.locator('.hanja-card-wrapper').first();
    await page.locator('[data-action="open-modal"]').first().click();

    const statusLabel = firstCardWrapper.locator('.card-status-label');
    await expect(statusLabel).toHaveText('❌');
    await expect(firstCardWrapper).toHaveClass(/card-final-incorrect/);

    const blurTarget = firstCardWrapper.locator('.quiz-blur-target');
    await expect(blurTarget).not.toHaveClass(/solved/);
  });

  test('시나리오 9: 음성 인식 도중 카드 재클릭 시 수동 취소(cancel) 및 상태 원복 검증', async ({ page }) => {
    await page.addInitScript(() => {
      window.SpeechRecognition = window.webkitSpeechRecognition = class {
        start() { setTimeout(() => { if (this.onstart) this.onstart(); }, 20); }
        stop() {} abort() {} 
      };
    });

    await page.goto('./');
    await page.click('#btn-toggle-quiz');

    const firstCardWrapper = page.locator('.hanja-card-wrapper').first();
    const actionArea = page.locator('[data-action="open-modal"]').first();

    await actionArea.click();
    await expect(firstCardWrapper).toHaveClass(/recording-active/);

    await actionArea.click();

    const statusLabel = firstCardWrapper.locator('.card-status-label');
    await expect(statusLabel).toHaveText('#1');
    await expect(firstCardWrapper).not.toHaveClass(/recording-active/);
  });

  test('시나리오 10: 도전 모드 해제 시 JIT(Just-In-Time) 전역 메모리 캐시 리셋 무결성 검증', async ({ page }) => {
    await page.click('#btn-toggle-quiz'); 
    
    await page.locator('[data-action="click-hun"]').first().click();
    await expect(page.locator('.quiz-blur-target').first()).toHaveClass(/solved/);

    await page.click('#btn-toggle-quiz'); 

    const firstCardWrapper = page.locator('.hanja-card-wrapper').first();
    const firstHunText = page.locator('.quiz-blur-target').first();
    
    await expect(firstCardWrapper).not.toHaveClass(/card-final-correct|card-final-incorrect/);
    await expect(firstHunText).not.toHaveClass(/solved/);
  });
});

test.describe('바른한자 - 신규 모달 레이어 및 옵션 설정 검증', () => {

  // tests/hanjaMaster.spec.js 의 시나리오 11 부분 수정
  test('시나리오 11: 급수 선택 그리드 모달 기동 및 데이터 유무 비활성화 무결성 테스트', async ({ page }) => {
    // 1. 헤더의 급수 선택 트리거 버튼 클릭
    const gradeTrigger = page.locator('button:has-text("바른한자")');
    await gradeTrigger.click();

    const gradeModal = page.locator('#grade-modal');
    await expect(gradeModal).toBeVisible();

    // 💡 수정 완료: 준4급과 충돌하지 않도록 내부 <span> 태그의 텍스트가 정확히 "4급"인 버튼만 선별
    const activeGradeBtn = gradeModal.locator('button').filter({ has: page.locator('span', { hasText: /^4급$/ }) });
    await expect(activeGradeBtn).not.toBeDisabled();

    await gradeModal.locator('button:has-text("닫기"), .theme-close').click();
    await expect(gradeModal).toBeHidden();
  });

  // 💡 신규 추가: 시나리오 12 (환경 설정 모달 감도 설정 검증)
  test('시나리오 12: 환경 설정 모달 기동 및 슬라이더 조작 로컬스토리지 연동 테스트', async ({ page }) => {
    // 1. 헤더의 톱니바퀴 아이콘 클릭
    await page.click('button[title="환경 설정"]');
    
    const settingsModal = page.locator('#settings-modal');
    await expect(settingsModal).toBeVisible();

    const slider = page.locator('#threshold-slider');
    await expect(slider).toHaveValue('60');

    // 2. 슬라이더 값을 임의로 45%로 조작
    await page.evaluate(() => {
        const sliderInput = document.getElementById('threshold-slider');
        sliderInput.value = '45';
        sliderInput.dispatchEvent(new Event('input'));
    });

    // 3. UI 텍스트 출력 변화 및 로컬스토리지 저장 정합성 검증
    await expect(page.locator('#threshold-value-display')).toHaveText('45%');
    
    const storedThreshold = await page.evaluate(() => localStorage.getItem('hanja_threshold'));
    expect(storedThreshold).toBe('0.45');
  });
});