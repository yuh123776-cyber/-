// The versioned entry and imports prevent a refreshed manifest from running old modules.
try {
    await import('./index.js?v=1.2.2');
} catch (error) {
    console.error('[绘约 v1.2.2] 加载失败', error);
    const showError = () => {
        const panel = document.createElement(typeof HTMLDialogElement === 'function' ? 'dialog' : 'section');
        panel.style.cssText = 'position:fixed;inset:12px;margin:auto;padding:20px;max-width:90vw;max-height:80vh;overflow:auto;background:white;color:#263545;z-index:2147483647;border:1px solid #75a8c6;border-radius:16px;';
        const title = document.createElement('h2');
        title.textContent = '绘约 v1.2.2 · 脚本加载失败';
        const message = document.createElement('p');
        message.textContent = String(error?.message || error);
        const help = document.createElement('p');
        help.textContent = '请截图保留错误信息，无需清理浏览器数据或删除存档。';
        const close = document.createElement('button');
        close.textContent = '关闭';
        close.onclick = () => panel.remove();
        panel.append(title, message, help, close);
        document.body.append(panel);
        if (typeof panel.showModal === 'function') panel.showModal();
    };
    document.addEventListener('click', event => {
        if (event.target.closest?.('[data-huiyue-load-error]')) showError();
    }, true);
    const mount = document.querySelector('#extensions_settings2, #extensions_settings') || document.body;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu_button';
    button.dataset.huiyueLoadError = 'true';
    button.textContent = '绘约 v1.2.2 · 查看加载错误';
    mount.append(button);
    showError();
}
