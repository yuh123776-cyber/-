# 图片适配器接口

绘约加载后提供 `globalThis.Huiyue.registerImageAdapter`。可信的其他酒馆扩展可注册新来源，无需把模型输出拼接成 STscript。

```js
Huiyue.registerImageAdapter({
    id: 'custom-my-provider',
    label: '我的图片服务',
    async generate({positive, negative, seed, settings, key, signal}) {
        // 在这里按目标服务的实际协议构造请求。
        // settings.url / settings.model 来源于绘约的图片 API 设置。
        // key 仅在当前页面内存中，signal 用于可以取消的 fetch 请求。
        const response = await fetch(settings.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(key ? {Authorization: `Bearer ${key}`} : {}),
            },
            body: JSON.stringify({prompt: positive, negative_prompt: negative, seed}),
            signal,
        });
        if (!response.ok) throw new Error(`图片请求失败：${response.status}`);
        // 此示例假设返回的是图片二进制，不适用于返回 JSON、ZIP 或任务 ID 的服务。
        return {
            blob: await response.blob(),
            parameters: {seed, model: settings.model},
        };
    },
});
```

注册后重新进入设置页面即可在绘图服务中选择。自动执行、失败重试、版本保存、放弃过期结果都沿用绘约流程。`generate` 必须返回图片 Blob，或 `{blob, parameters}`，不能只返回临时 URL。绘约会进行图片解码检查并保存原始字节。适配器不得把密钥塞进 `parameters`，因为该对象会被导出。

异步任务型接口需要适配器自己轮询；ZIP 格式需要适配器自行解压。各家参考图、蒙版、重绘与鉴权机制应分别适配。当前界面未提供通用参考图输入，不能仅靠此入口声称已支持统一 img2img。

如果某服务不允许浏览器跨域，使用酒馆自带图片扩展或服务提供的受信后端代理。不要为兼容接口而关闭酒馆的身份验证。

## v1.1.1 图片附加指令

适配器收到的 `positive` 已包含「生图 AI 附加指令」和本次稿件正向词，可直接发送。`instructions` 参数和 `settings.instructions` 另提供附加指令原文供需要独立字段的协议使用；如果改为分字段发送，请自行拆分，避免再次拼接产生重复。普通适配器无需修改。`negative` 保持原样。原版本的 `positive` 不改写，实际发送内容记录在生成参数 `sentPrompt`。
