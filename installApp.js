(function () {
    'use strict';
    let installPrompt = null;
    let installed = false;
    let busy = false;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia('(display-mode: standalone)');
    const button = document.getElementById('btn-install-app');
    const status = document.getElementById('app-install-status');
    if (!button || !status) return;
    function render(message) {
        const isInstalled = installed || standalone.matches || navigator.standalone === true;
        // Like HeartTune: only offer the native install action once the browser is ready.
        button.hidden = !installPrompt && !isInstalled && !busy;
        button.disabled = isInstalled || busy;
        button.textContent = isInstalled ? (installed && !standalone.matches && navigator.standalone !== true ? '설치 완료' : '설치된 앱으로 실행 중') : busy ? '설치 확인 중…' : '앱 설치';
        status.textContent = message || (isInstalled ? '이미 앱으로 실행 중입니다.' : installPrompt ? '앱 설치 버튼을 누르면 브라우저의 설치 창이 열립니다.' : ios ? 'iPhone/iPad는 Safari의 공유 버튼 → ‘홈 화면에 추가’로 설치할 수 있습니다.' : '브라우저가 설치 가능 여부를 확인 중입니다. 설치 준비가 되면 여기에 앱 설치 버튼이 나타납니다. Chrome 또는 Edge에서 열어 주세요.');
    }
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        installPrompt = event;
        render();
    });
    window.addEventListener('appinstalled', () => {
        installed = true;
        installPrompt = null;
        render('앱 설치가 완료되었습니다. 홈 화면에서 실행해 주세요.');
    });
    standalone.addEventListener?.('change', () => render());
    button.addEventListener('click', async () => {
        if (busy || installed || standalone.matches || navigator.standalone === true) return;
        if (!installPrompt) {
            render(ios ? 'Safari에서 이 페이지를 열고 공유 버튼 → ‘홈 화면에 추가’ → ‘추가’를 눌러 주세요.' : '브라우저 메뉴(⋮ 또는 …)에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택해 주세요. 메뉴가 없으면 Chrome 또는 Edge에서 열어 주세요.');
            return;
        }
        const prompt = installPrompt;
        installPrompt = null; // Each browser install event can only be used once.
        busy = true;
        render();
        let message;
        try {
            await prompt.prompt();
            const choice = await prompt.userChoice;
            message = choice.outcome === 'accepted' ? '설치를 요청했습니다. 브라우저 안내를 완료해 주세요.' : '설치를 취소했습니다. 나중에 브라우저 메뉴에서 다시 설치할 수 있습니다.';
        } catch (_) {
            message = '설치 창을 열지 못했습니다. 브라우저 메뉴의 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 이용해 주세요.';
        } finally {
            busy = false;
            render(message);
        }
    });
    render();
})();
