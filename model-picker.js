// Bind once to the app; requests and model lists stay in the current form only.
export function bindModelPickers(app, api) {
    const pending = new WeakMap();
    const control = (box, kind, field) => box.querySelector(`[name="${kind}.${field}"]`);
    function clear(box, kind) {
        pending.get(box)?.abort();
        pending.delete(box);
        box.querySelector('[data-model-list]').replaceChildren(new Option('拉取后在此选择模型', ''));
        box.querySelector('[data-model-list]').disabled = true;
        const button = box.querySelector('[data-fetch-models]');
        button.disabled = control(box, kind, 'mode').value !== 'openai';
        button.textContent = '拉取模型列表';
        box.querySelector('[data-model-status]').textContent = button.disabled
            ? '酒馆模式请在酒馆设置中选择模型；自定义适配器请手动填写模型名。'
            : '读取当前地址和密钥；选择后点击「保存设置」生效，也可手动填写模型名。';
    }
    for (const type of ['input', 'change']) app.addEventListener(type, event => {
        const box = event.target.closest('[data-api-kind]');
        if (!box) return;
        const kind = box.dataset.apiKind;
        if (['mode', 'url', 'key', 'modelsPath', 'apiAuth', 'imageProtocol'].some(field => event.target.name === `${kind}.${field}`)) clear(box, kind);
        if (event.target.matches('[data-model-list]') && event.target.value) {
            const input = control(box, kind, 'model');
            input.value = event.target.value;
            input.dispatchEvent(new Event('input', {bubbles: true}));
        }
    });
    app.addEventListener('click', async event => {
        const button = event.target.closest('[data-fetch-models]');
        if (!button || button.disabled) return;
        event.preventDefault();
        const box = button.closest('[data-api-kind]'), kind = box.dataset.apiKind;
        const controller = new AbortController();
        pending.get(box)?.abort();
        pending.set(box, controller);
        const status = box.querySelector('[data-model-status]');
        const select = box.querySelector('[data-model-list]');
        select.replaceChildren(new Option('拉取后在此选择模型', ''));select.disabled = true;
        button.disabled = true;button.textContent = '正在拉取…';status.textContent = '正在请求模型列表…';
        let timedOut = false;
        const timer = setTimeout(() => {timedOut = true;controller.abort();}, 20000);
        const current = () => box.isConnected && pending.get(box) === controller;
        try {
            const models = await api.listModels({url: control(box, kind, 'url').value.trim(), modelsPath: control(box, kind, 'modelsPath').value, apiAuth: control(box, kind, 'apiAuth').value, imageProtocol: control(box, kind, 'imageProtocol')?.value}, kind,
                controller.signal, control(box, kind, 'key').value);
            if (!current() || controller.signal.aborted) return;
            select.replaceChildren(new Option('请选择模型（也可手动填写）', ''),
                ...models.map(id => new Option(id, id)));
            const model = control(box, kind, 'model').value;
            select.value = models.includes(model) ? model : '';
            select.disabled = false;
            status.textContent = `已拉取 ${models.length} 个模型；选择后请保存设置。列表由服务返回，请选择支持当前用途的模型。`;
        } catch (error) {
            if (current() && (!controller.signal.aborted || timedOut)) status.textContent = timedOut
                ? '拉取超时，请检查服务后重试。' : error.message;
        } finally {
            clearTimeout(timer);
            if (current()) {
                pending.delete(box);
                button.disabled = control(box, kind, 'mode').value !== 'openai';
                button.textContent = '拉取模型列表';
            }
        }
    });
}
