// Run against a local preview: NODE_PATH=<playwright modules> node tests/accounts.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.ASTRA_TEST_URL || 'http://127.0.0.1:8080';
const host = 'https://lhoqqluuffbxwzorlihw.supabase.co';
const userId = '00000000-0000-4000-8000-000000000001';

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.ASTRA_CHROMIUM || undefined, args: ['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    let failLeaderboard = false;
    let player = {user_id:userId,nickname:'SkyPilot',best_score:12};
    await context.route(`${host}/**`, async route => {
      const req = route.request(), url = new URL(req.url());
      requests.push({path:url.pathname,method:req.method(),body:req.postDataJSON()});
      let body = {}, status = 200;
      if(url.pathname === '/auth/v1/otp') body={};
      else if(url.pathname === '/auth/v1/logout') body={};
      else if(url.pathname === '/rest/v1/players') {
        if(req.method() === 'PATCH') player={...player,...req.postDataJSON()};
        body=player;
      } else if(url.pathname.endsWith('/start_game_run')) body='00000000-0000-4000-8000-000000000002';
      else if(url.pathname.endsWith('/finish_game_run')) body=15;
      else if(url.pathname.endsWith('/game_leaderboard')) {
        if(failLeaderboard) {status=503; body={message:'unavailable'};}
        else body=[{nickname:'SkyPilot',score:12},{nickname:'<img src=x onerror=alert(1)>',score:8}];
      } else throw new Error(`Unexpected network call: ${url}`);
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto(base);await page.waitForFunction(()=>window.astraGame);
    assert.equal(await page.locator('#account-caption').textContent(),'Flying as a guest');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#action').click();
    await page.locator('#account-button').click();
    assert.equal(await page.evaluate(()=>window.astraGame.getState()),'paused');
    await page.locator('#email').fill('pilot@example.invalid');
    await page.keyboard.press('p');
    assert.equal(await page.evaluate(()=>window.astraGame.getState()),'paused');
    await page.locator('#email').fill('pilot@example.invalid');
    await page.locator('#email-submit').click();
    await page.waitForFunction(()=>document.getElementById('account-message').textContent.includes('Check your inbox'));
    assert.equal(requests.filter(r=>r.path==='/auth/v1/otp').length,1);
    await page.locator('#account-dialog [data-close-dialog]').click();
    await page.locator('#leaderboard-button').click();
    await page.locator('#leaderboard-rows tr').first().waitFor();
    assert.equal(await page.locator('#leaderboard-rows img').count(),0);
    assert((await page.locator('#leaderboard-rows').textContent()).includes('<img'));
    failLeaderboard=true;
    await page.locator('[data-period="all"]').click();
    await page.waitForFunction(()=>document.getElementById('leaderboard-message').textContent.includes('unavailable'));
    failLeaderboard=false;
    await page.locator('[data-period="week"]').click();
    await page.locator('#leaderboard-rows tr').first().waitFor();
    await page.locator('#leaderboard-dialog [data-close-dialog]').click();
    const session={access_token:'test-access-token',refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:userId,email:'pilot@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()}};
    await page.evaluate(s=>localStorage.setItem('sb-lhoqqluuffbxwzorlihw-auth-token',JSON.stringify(s)),session);
    await page.reload();
    await page.waitForFunction(()=>document.getElementById('account-caption').textContent==='SkyPilot');
    assert.equal(await page.locator('#best').textContent(),'12');
    await page.locator('#account-button').click();
    await page.locator('#nickname').fill('NightPilot');
    await page.locator('#nickname-submit').click();
    await page.waitForFunction(()=>document.getElementById('account-caption').textContent==='NightPilot');
    await page.locator('#account-dialog [data-close-dialog]').click();
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('astra:run-start',{detail:{key:42}})));
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('astra:run-finish',{detail:{key:42,score:15,durationMs:12000}})));
    await page.waitForFunction(()=>document.getElementById('sync-status').textContent.includes('Flight saved'));
    assert.equal(await page.locator('#best').textContent(),'15');
    const saved=requests.find(r=>r.path.endsWith('/finish_game_run'));
    assert.equal(saved.body.p_score,15);assert.equal(saved.body.p_duration_ms,12000);
    await page.locator('#account-button').click();
    await page.locator('#sign-out').click();
    await page.waitForFunction(()=>document.getElementById('account-caption').textContent==='Flying as a guest');
    await page.locator('#account-dialog [data-close-dialog]').click();
    await page.screenshot({path:'/tmp/astra-accounts-mobile.png',fullPage:true});
    await page.setViewportSize({width:1280,height:900});
    await page.screenshot({path:'/tmp/astra-accounts-desktop.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: mobile guest play, pause/modal keyboard isolation, email flow (mocked), safe leaderboard rendering, network retry, session restoration, nickname save, score sync, sign out, desktop layout.');
    await context.close();
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
