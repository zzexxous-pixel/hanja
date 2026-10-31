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
        button.hidden = false;
        button.disabled = busy;
        button.textContent = busy ? '설치 확인 중…' : '앱 설치';
        status.textContent = message || (isInstalled
            ? (standalone.matches || navigator.standalone === true ? '이미 앱으로 실행 중입니다.' : '앱 설치가 완료되었습니다. 홈 화면에서 실행해 주세요.')
            : '홈 화면이나 바탕화면에서 실행하려면 앱 설치 버튼을 눌러 주세요.');
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
        if (busy) return;
        if (installed || standalone.matches || navigator.standalone === true) {
            render();
            return;
        }
        if (!installPrompt) {
            render('이미 설치했거나 이 브라우저에서 설치 창을 지원하지 않습니다. ' + (ios ? 'Safari에서 공유 버튼 → ‘홈 화면에 추가’ → ‘추가’를 눌러 주세요.' : '설치한 앱을 실행하거나 브라우저 메뉴의 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 확인해 주세요.'));
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
