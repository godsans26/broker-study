/* Runs in CI on an isolated Chromium profile, with a mocked Supabase transport. */
const {chromium, webkit} = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), {spawn} = require('node:child_process');
const M = require('../app/sync-core.js');
const base = 'http://127.0.0.1:4174/broker-study/';
const server = spawn(process.execPath, ['tools/serve.cjs','dist/web','4174'], {stdio:['ignore','pipe','pipe']});
const ready = new Promise((resolve,reject) => {server.stdout.once('data',resolve);server.once('error',reject);});
const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('broker-quiz-v1')));
const errors = [];
let checks = 0;
function check(v,m) {assert.ok(v,m);checks++;}
const records = new Map();
function identity(email) {const id = email === 'other@example.com' ? '22222222-2222-4222-8222-222222222222' : '11111111-1111-4111-8111-111111111111';return {id,email,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};}
function token(user) {return Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,email:user.email,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test';}
async function mock(context) {
  await context.addInitScript(() => {localStorage.setItem('broker-study:/broker-study/:cloud',JSON.stringify({url:'https://study-test.supabase.co',publishableKey:'sb_publishable_test'}));});
  await context.route('https://study-test.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url());
    let response = {};
    if (url.pathname.endsWith('/token')) {const user=identity(req.postDataJSON().email||'learner@example.com');response={access_token:token(user),refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};}
    else if (url.pathname.endsWith('/user')) {const payload=JSON.parse(Buffer.from(req.headers().authorization.split('.')[1],'base64url'));response=identity(payload.email);}
    else if (url.pathname.endsWith('/merge_study_progress')) {
      const jwt=JSON.parse(Buffer.from(req.headers().authorization.split('.')[1],'base64url'));
      const body=req.postDataJSON(), key=jwt.sub+':'+body.p_document;
      response=M.merge(records.get(key)||M.empty(),body.p_payload); records.set(key,response);
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
  });
}
async function login(page,email='learner@example.com') {
  await page.locator('#study-account-open').click();
  await page.locator('#study-email').fill(email);await page.locator('#study-password').fill('test-password-123');
  await page.locator('#study-login button[type=submit]').click();
  await page.locator('#study-signed-in').waitFor({state:'visible'});
  await page.locator('#study-account-close').click();
  await page.waitForFunction(()=>document.getElementById('study-account-open').textContent==='동기화 완료');
}
async function sync(page) {
  await page.locator('#study-account-open').click();await page.locator('#study-sync-now').click();
  await page.waitForFunction(()=>document.getElementById('study-account-open').textContent==='동기화 완료');
  await page.locator('#study-account-close').click();
}
(async()=>{
  await ready;
  const browser=await chromium.launch({headless:true});
  try {
    const smoke=await browser.newContext({viewport:{width:390,height:844}});
    await smoke.addInitScript(()=>localStorage.setItem('broker-study:/broker-study/:cloud',JSON.stringify({url:'',publishableKey:''})));
    const page=await smoke.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base); await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await page.locator('.study-card').first().waitFor({state:'visible'});
    check(await page.locator('.study-card').count()===2,'two banks');
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile home fits');
    await page.locator('a[href="practice.html"]').click();
    await page.locator('.option').nth(0).click();
    check(Object.keys((await state(page)).answers).length===1,'answer stored locally');
    const before=await state(page);await page.reload();check(M.same(before,await state(page)),'reload preserves answer');
    await smoke.setOffline(true);await page.goto(base+'past/index.html');
    check(await page.locator('.option').count()===4,'uncached navigation uses precached past bank offline');
    await page.locator('.option').nth(0).click();check(await page.locator('#feedback').isVisible(),'past grading offline');
    await page.reload();check(await page.locator('#feedback').isVisible(),'offline past reload');
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile past fits');
    await smoke.setOffline(false);
    const badConfig=page.locator('#study-account-open');await badConfig.click();
    await page.locator('#study-cloud-url').fill('https://study-test.supabase.co');await page.locator('#study-cloud-key').fill('sb_secret_should_never_be_used');
    await page.locator('#study-config-form button').click();check((await page.locator('#study-account-message').textContent()).includes('공개용'),'secret rejected');await page.locator('#study-account-close').click();
    await page.screenshot({path:'test-results/mobile.png',fullPage:true});await smoke.close();
    const a=await browser.newContext({serviceWorkers:'block'}), b=await browser.newContext({serviceWorkers:'block'});
    await mock(a);await mock(b);const pa=await a.newPage(),pb=await b.newPage();
    for(const p of [pa,pb]) p.on('pageerror',e=>errors.push(e.message));
    await pa.goto(base+'practice.html');await pb.goto(base+'practice.html');await login(pa);await login(pb);await sync(pa);
    await pa.locator('.option').nth(0).click();await sync(pa);await sync(pb);
    check(Object.keys((await state(pb)).answers).length===1,'second device receives answer');
    await a.setOffline(true);await pa.locator('#next').click();await pa.locator('.option').nth(1).click();
    await pb.locator('#next').click();await pb.locator('#next').click();await pb.locator('.option').nth(2).click();await sync(pb);
    await a.setOffline(false);await sync(pa);await sync(pb);
    check(Object.keys((await state(pa)).answers).length===3 && Object.keys((await state(pb)).answers).length===3,'offline edits merge without loss');
    pa.once('dialog',d=>d.accept());await pa.locator('#restart').click();await sync(pa);await sync(pb);
    check(Object.keys((await state(pb)).answers).length===0,'reset propagates tombstones');
    await pa.locator('.option').nth(3).click();await sync(pa);
    await pa.locator('#study-account-open').click();pa.once('dialog',d=>d.accept());await pa.locator('#study-sign-out').click();
    await pa.locator('#study-login').waitFor({state:'visible'});await pa.locator('#study-account-close').click();
    check(Object.keys((await state(pa)).answers).length===0,'logout restores guest instead of leaking account');
    await login(pa,'other@example.com');check(Object.keys((await state(pa)).answers).length===0,'other account isolated');
    await a.close();await b.close();
    const portable=await browser.newContext(), pp=await portable.newPage();pp.on('pageerror',e=>errors.push(e.message));
    await pp.goto(require('node:url').pathToFileURL(path.resolve('dist/portable/index.html')).href);await pp.locator('a[href="past/index.html"]').click();await pp.locator('.option').nth(0).click();
    check(await pp.locator('#feedback').isVisible(),'portable file:// grades without server');await portable.close();
    check(errors.length===0,'no runtime errors: '+errors.join('; '));
  } finally {await browser.close();server.kill();}
  // WebKit is an engine compatibility check, not a physical iPhone installation test.
  const safari=await webkit.launch({headless:true});
  try {const context=await safari.newContext({viewport:{width:390,height:844},isMobile:true});const p=await context.newPage();await p.goto(require('node:url').pathToFileURL(path.resolve('dist/portable/past/index.html')).href);await p.locator('.option').nth(1).click();check(await p.locator('#feedback').isVisible(),'WebKit portable grading');await context.close();} finally {await safari.close();}
  console.log(JSON.stringify({checks,errors}));
})().catch(error=>{console.error(error);server.kill();process.exitCode=1;});
