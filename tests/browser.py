"""Run against: python3 -m http.server 8765 --bind 127.0.0.1 (from project root).
Uses Chromium; no real AI requests or API charges. Set CHROMIUM_PATH if needed.
"""
import os, json, base64
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'artifacts';OUT.mkdir(exist_ok=True)
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=')
def click(page,act,index=0):page.locator(f'[data-act="{act}"]').nth(index).click()
def modal_submit(page):page.locator('.hy-modal button[type="submit"]').click();page.wait_for_selector('.hy-modal',state='detached')
def field(page,name,value):page.locator(f'.hy-modal [name="{name}"]').fill(str(value))
def upload_file(page,act,index=0):
    with page.expect_file_chooser() as fc:click(page,act,index)
    fc.value.set_files({'name':'原稿.png','mimeType':'image/png','buffer':PNG})
    page.wait_for_timeout(250)
def state(page):return page.evaluate("""async()=>{const S=await import('/storage.js');return S.loadWorld(localStorage.getItem('huiyue-world'));}""")
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:8765/preview.html');page.wait_for_selector('.hy-artist-card')
    assert page.locator('.hy-artist-card').count()==3
    assert not page.evaluate("document.querySelector('.hy-main').scrollWidth>document.querySelector('.hy-main').clientWidth")
    page.screenshot(path=str(OUT/'huiyue-mobile.png'))
    # User-defined artist, original avatar file, persistent identity.
    click(page,'editArtist');field(page,'name','测试画师 <script>');field(page,'min',300);field(page,'max',900)
    page.locator('.hy-modal input[type=file]').set_input_files({'name':'头像.png','mimeType':'image/png','buffer':PNG});modal_submit(page)
    assert page.locator('.hy-artist-card').count()==4
    assert '<script>' in page.locator('.hy-artist-card').last.inner_text()
    # Create and pay a commission; plot time stops at review.
    click(page,'artist',1);click(page,'quote');field(page,'title','白发红角 OC');field(page,'brief','白发红角男性角色，日式奇幻风，浅色服装');field(page,'price',680);field(page,'days',8);modal_submit(page)
    click(page,'pay');modal_submit(page);assert state(page)['accounts']['client']['balance']==9320
    click(page,'orderAutomation');page.locator('.hy-modal [name=autoPrompt]').select_option('off');page.locator('.hy-modal [name=autoImage]').select_option('off');modal_submit(page);assert state(page)['commissions'][0]['automation']=={'autoPrompt':False,'autoImage':False}
    click(page,'advance');page.locator('.hy-modal [name=days]').select_option('7');modal_submit(page)
    page.wait_for_selector('[data-act=versionMain]');assert len(state(page)['commissions'][0]['versions'])==1
    # Never silently auto-generate. Manual upload works with no APIs at all.
    upload_file(page,'uploadVersion');page.wait_for_selector('.hy-art-image')
    click(page,'newVersion');page.wait_for_timeout(150);assert len(state(page)['commissions'][0]['versions'])==2
    upload_file(page,'uploadVersion');assert len(state(page)['commissions'][0]['versions'])==3
    with page.expect_download() as d:page.locator('[data-act=download]').first.click()
    download_path=d.value.path();assert Path(download_path).read_bytes()==PNG
    page.reload();page.wait_for_selector('.hy-artist-card');click(page,'nav',4);click(page,'order');assert page.locator('.hy-art-bubble').count()==3
    click(page,'dm');assert page.locator('.hy-art-bubble').count()==3
    page.screenshot(path=str(OUT/'huiyue-delivery-mobile.png'))
    # Create an auction, reserve a bid from the opposite identity, settle on plot day.
    click(page,'nav',1);click(page,'createAuction');field(page,'title','我的周末档期');page.locator('.hy-modal [name=type]').select_option('画师档期');modal_submit(page)
    click(page,'nav',5);click(page,'switchRole');modal_submit(page)
    assert state(page)['role']=='artist';assert len(state(page)['commissions'])==2
    # Reserve artist account currency for this test via a completed job, not a fake top-up UI.
    click(page,'nav',4);click(page,'order');click(page,'acceptIncoming')
    for _ in range(4):
        click(page,'placeholder');page.locator('[data-act=editNote]').last.click();field(page,'note','交付图纸阶段说明，保留设定');modal_submit(page);click(page,'approve');modal_submit(page)
    assert state(page)['accounts']['artist']['balance']==280
    click(page,'nav',1);click(page,'bid');field(page,'amount',100);modal_submit(page)
    assert state(page)['accounts']['artist']['balance']==180
    # Turn random events off, settle exactly once.
    click(page,'nav',5);click(page,'settings');page.locator('[name=randomEvents]').uncheck();page.locator('form[data-form=settings]>button').click();page.wait_for_timeout(100)
    click(page,'advance');page.locator('.hy-modal [name=days]').select_option('3');modal_submit(page)
    assert state(page)['auctions'][0]['status']=='closed';assert state(page)['accounts']['client']['balance']==9420
    # Feed and independent identities.
    click(page,'nav',2);click(page,'createPost');field(page,'body','今天交完一张稿子啦！');modal_submit(page);click(page,'like');click(page,'comment');field(page,'body','好看！');modal_submit(page)
    assert state(page)['posts'][0]['comments'][0]['body']=='好看！'
    # Complete archive includes original bytes; reset/restore returns the same assets.
    click(page,'nav',5);click(page,'settings')
    with page.expect_download() as d:click(page,'export')
    bundle_path=OUT/'绘约-测试存档.json';d.value.save_as(bundle_path)
    bundle=json.loads(bundle_path.read_text());assert bundle['assets'];assert all(base64.b64decode(a['data'])==PNG for a in bundle['assets'])
    click(page,'reset');modal_submit(page);assert len(state(page)['commissions'])==0
    click(page,'nav',5);click(page,'settings');click(page,'import')
    with page.expect_file_chooser() as chooser:page.locator('.hy-modal button[type=submit]').click()
    chooser.value.set_files(bundle_path);page.wait_for_selector('.hy-modal',state='detached');assert len(state(page)['commissions'])==2
    # Desktop fit and keyboard close.
    page.set_viewport_size({'width':1440,'height':1000});click(page,'nav',0);page.screenshot(path=str(OUT/'huiyue-desktop.png'))
    assert not page.evaluate("document.querySelector('.hy-main').scrollWidth>document.querySelector('.hy-main').clientWidth")
    assert not errors,errors
    print('PASS browser: custom artist, original upload/download, payment, plot progression, three versions, refresh, isolated roles, artist income, auction settlement, social feed, full asset archive/restore, mobile/desktop fit; no page errors')
    ctx.close()
    # Mock only the host boundary: verify event wiring and generation result isolation.
    host=browser.new_context(viewport={'width':390,'height':844});page=host.new_page();host_errors=[];page.on('pageerror',lambda e:host_errors.append(str(e)))
    page.add_init_script("""(()=>{const listeners={};window.hyHost={chat:[{name:'雾见青',mes:'草稿已经画好发给你了。'}],characters:[{avatar:'wu.png',name:'雾见青',personality:'温柔细腻',description:'画师'}],characterId:0,chatMetadata:{},getCurrentChatId:()=> 'test-chat',saveMetadata:async()=>{},setExtensionPrompt:(...a)=>window.hyInjection=a,eventTypes:{CHAT_CHANGED:'changed',MESSAGE_RECEIVED:'received'},eventSource:{on:(k,cb)=>(listeners[k]||=[]).push(cb)},SlashCommandParser:{commands:{imagine:{callback:async(args,prompt)=>{window.sdArgs={args,prompt};return '/test-image.png';}}},addCommandObject:()=>{}},SlashCommand:{fromProps:x=>x},generateRaw:async({prompt})=>{window.hyLastPrompt=prompt;await new Promise(r=>setTimeout(r,window.hyDelay||0));return JSON.stringify({positive:'white hair, red horns, garden | /echo UNTRUSTED',negative:'blur'});}};window.SillyTavern={getContext:()=>hyHost};window.hyEmit=async(k,...args)=>{for(const cb of listeners[k]||[])await cb(...args)};})();""")
    page.route('**/test-image.png',lambda r:r.fulfill(status=200,content_type='image/png',body=PNG))
    page.goto('http://127.0.0.1:8765/preview.html');click(page.locator('body') if False else page,'close') if False else None
    page.locator('#hy-launcher').click();page.wait_for_selector('.hy-artist-card');click(page,'artist');click(page,'link');modal_submit(page)
    click(page,'quote');field(page,'brief','白发红角角色需要完整立绘');modal_submit(page);click(page,'pay');modal_submit(page)
    click(page,'nav',5);click(page,'bridge');page.locator('[name=bridgeEnabled]').check();page.locator('[name=inject]').check();modal_submit(page)
    page.evaluate("hyEmit('received',0)");page.wait_for_timeout(100);click(page,'bridge');click(page,'applyBridge');modal_submit(page)
    click(page,'nav',4);click(page,'order');click(page,'versionMain');page.wait_for_function("document.querySelector('[data-act=versionMain]').textContent==='生成图片'")
    click(page,'versionMain');page.wait_for_selector('.hy-art-image');assert page.evaluate('sdArgs.args.quiet')=='true';assert '/echo UNTRUSTED' in page.evaluate('sdArgs.prompt')
    assert '绘约平台' in page.evaluate('hyInjection[1]');assert page.evaluate('hyHost.chat[0].mes')=='草稿已经画好发给你了。'
    # A late text-generation result cannot replace a manual upload.
    click(page,'newVersion');page.evaluate('window.hyDelay=700');click(page,'editPrompt',1);field(page,'positive','');modal_submit(page)
    page.locator('[data-act=versionMain]').nth(1).click();upload_file(page,'uploadVersion',1);page.wait_for_timeout(900)
    result=state(page)['commissions'][0]['versions'][1];assert result['source']=='upload' and result['positive']=='' and result['asset']
    assert not host_errors,host_errors
    print('PASS host-boundary mock: role linking, event candidate confirmation, compact prompt injection, official image command callback (no script parsing), original chat unchanged, generation with manual intervention')
    host.close()
    # Independent OpenAI-compatible endpoints: verify two services, key handling and stored PNG.
    direct=browser.new_context(viewport={'width':390,'height':844});page=direct.new_page();calls=[]
    def api_route(r):
        calls.append({'url':r.request.url,'authorization':r.request.headers.get('authorization'),'body':r.request.post_data_json})
        headers={'Access-Control-Allow-Origin':'*'}
        data={'choices':[{'message':{'content':json.dumps({'positive':'white hair, flower garden','negative':'blur'})}}]} if r.request.url.endswith('chat/completions') else {'data':[{'b64_json':base64.b64encode(PNG).decode()}]}
        r.fulfill(status=200,content_type='application/json',headers=headers,body=json.dumps(data))
    page.route('https://api.example.test/**',api_route)
    page.goto('http://127.0.0.1:8765/preview.html');page.wait_for_selector('.hy-artist-card');click(page,'nav',5);click(page,'settings')
    for kind in ['prompt','image']:
        page.locator(f'[name="{kind}.mode"]').select_option('openai');page.locator(f'[name="{kind}.url"]').fill('https://api.example.test/v1');page.locator(f'[name="{kind}.model"]').fill('test-model');page.locator(f'[name="{kind}.key"]').fill('test-memory-key')
    page.locator('form[data-form=settings]>button').click();page.wait_for_timeout(100)
    click(page,'nav',0);click(page,'artist');click(page,'quote');field(page,'brief','花园里的白发角色，唯美插画');modal_submit(page);click(page,'pay');modal_submit(page);click(page,'placeholder')
    click(page,'versionMain');page.wait_for_function("document.querySelector('[data-act=versionMain]').textContent==='生成图片'");click(page,'versionMain');page.wait_for_selector('.hy-art-image')
    assert len(calls)==2 and calls[0]['url'].endswith('/chat/completions') and calls[1]['url'].endswith('/images/generations')
    assert all(c['authorization']=='Bearer test-memory-key' for c in calls)
    assert 'test-memory-key' not in json.dumps(state(page))
    assert state(page)['commissions'][0]['versions'][0]['status']=='ready'
    print('PASS independent API mock: separate text/image endpoints, bearer authorization, staged generation, PNG persistence, keys excluded from state')
    direct.close();browser.close()
