"""No real network/API calls: serve project files from a routed plain-HTTP origin.
Exercises the native host settings dialog, not only the standalone preview.
"""
import base64,json,mimetypes,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=')
HOST='''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body>
<dialog id="host-settings"><div id="extensions_settings"></div></dialog><script>
const host=document.getElementById('host-settings');host.showModal();
window.SillyTavern={getContext:()=>({chatMetadata:{},eventTypes:{CHAT_CHANGED:'changed',MESSAGE_RECEIVED:'received'},eventSource:{on:()=>{}},setExtensionPrompt:()=>{}})};
</script><script type="module" src="/index.js"></script>'''
def serve(route):
    from urllib.parse import urlparse
    path=urlparse(route.request.url).path
    if path=='/host.html':route.fulfill(content_type='text/html',body=HOST);return
    f=ROOT/path.lstrip('/')
    if f.is_file():route.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else:route.fulfill(status=404,body='Not found')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844})
    context.route('http://huiyue.test/**',serve)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://huiyue.test/host.html');page.wait_for_selector('#extensions_settings button')
    assert page.evaluate('isSecureContext') is False
    assert page.evaluate('typeof crypto.randomUUID')=='undefined'
    page.locator('#extensions_settings button').click()
    page.wait_for_selector('.hy-artist-card')
    assert page.locator('#hy-app').evaluate('(e)=>e.matches(":modal")')
    page.locator('[data-act=nav][data-id=me]').click();page.wait_for_selector('[data-act=editAccount]')
    page.locator('[data-act=editAccount]').click();page.locator('.hy-modal [name=name]').fill('本地手机用户')
    page.locator('.hy-modal input[type=file]').set_input_files({'name':'头像.png','mimeType':'image/png','buffer':PNG})
    page.locator('.hy-modal button[type=submit]').click();page.wait_for_selector('.hy-modal',state='detached')
    page.locator('[data-act=settings]').click()
    with page.expect_download() as dl:page.locator('[data-act=export]').click()
    bundle=json.loads(Path(dl.value.path()).read_text());assert bundle['assets']
    # Restore remaps image IDs through the same HTTP-compatible uid helper.
    page.evaluate('''async bundle=>{const S=await import('/storage.js');const id=localStorage.getItem('huiyue-world');await S.importWorld(new File([JSON.stringify(bundle)],'bundle.json',{type:'application/json'}),id)}''',bundle)
    page.locator('.hy-header [data-act=close]').click();assert page.locator('#host-settings').evaluate('(e)=>e.open')
    page.locator('#extensions_settings button').click();page.locator('[data-act=nav][data-id=me]').click();page.wait_for_selector('.hy-profile-card');assert page.get_by_text('本地手机用户',exact=True).count()==1
    page.reload();page.wait_for_selector('#extensions_settings button');page.locator('#extensions_settings button').click();page.wait_for_selector('.hy-artist-card')
    assert not errors,errors
    print('PASS ordinary HTTP without randomUUID: settings entry opens in top layer, avatar upload, original-file archive, restore, reopen and reload persistence')
    context.close()
    # A database failure must leave a persistent, visible diagnostic and close button.
    context=browser.new_context(viewport={'width':390,'height':844});context.route('http://huiyue.test/**',serve)
    context.add_init_script("Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('Storage blocked for test','SecurityError')}})")
    page=context.new_page();page.goto('http://huiyue.test/host.html');page.wait_for_selector('#extensions_settings button');page.locator('#extensions_settings button').click();page.wait_for_selector('[data-act=retryOpen]')
    assert page.locator('#hy-app').evaluate('(e)=>e.matches(":modal")');assert 'Storage blocked for test' in page.locator('#hy-app').inner_text()
    page.locator('[data-act=retryOpen]').click();page.wait_for_selector('[data-act=retryOpen]');assert 'Storage blocked for test' in page.locator('#hy-app').inner_text()
    page.locator('.hy-header [data-act=close]').click();assert not page.locator('#hy-app').is_visible()
    print('PASS blocked storage: persistent visible error, retry and close without data reset')
    context.close();browser.close()
