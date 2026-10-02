/* Supabase publishable key: intentionally public; access is enforced by SQL. */
(() => {
  'use strict';
  const PROJECT_URL = 'https://lhoqqluuffbxwzorlihw.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_5xU0CJiojpAW1IQkkjk7gQ_H0buxawz';
  const REDIRECT_URL = 'https://chirucristian.github.io/astra-6-test-game/';
  const $ = id => document.getElementById(id);
  let client, session = null, profile = null, activeRun = null, generation = 0;
  let period = 'week', leaderboardRequest = 0, signingIn = false, savingProfile = false;
  const accountDialog = $('account-dialog'), leaderboardDialog = $('leaderboard-dialog');

  function message(text, error = false) {
    $('account-message').textContent = text;
    $('account-message').dataset.error = String(error);
  }
  function syncMessage(text, error = false) {
    $('sync-status').textContent = text;
    $('sync-status').dataset.error = String(error);
  }
  function openDialog(dialog) {
    window.astraGame?.pause();
    if (!dialog.open) dialog.showModal();
  }
  function renderAccount() {
    $('email-form').hidden = !!session;
    $('profile-form').hidden = !session;
    $('sign-out').hidden = !session;
    $('account-heading').textContent = session ? 'Your pilot profile' : 'Keep your next best.';
    $('account-explanation').textContent = session
      ? 'Choose a public nickname. Your best score follows you across devices.'
      : 'Sign in with a link sent to your email. No password needed.';
    $('account-button').textContent = session ? 'Profile' : 'Sign in';
    $('account-caption').textContent = profile ? profile.nickname : session ? 'Choose a nickname' : 'Flying as a guest';
    $('account-caption').title = $('account-caption').textContent;
    $('cloud-best').textContent = profile?.best_score ?? 0;
    if (profile && document.activeElement !== $('nickname')) $('nickname').value = profile.nickname;
    if (!session) $('nickname').value = '';
    window.astraGame?.setAccountBest(profile?.best_score ?? 0);
  }
  async function loadProfile(userId, expectedGeneration) {
    const {data, error} = await client.from('players').select('user_id,nickname,best_score').eq('user_id', userId).maybeSingle();
    if (generation !== expectedGeneration || session?.user.id !== userId) return;
    if (error) { message('Could not load your profile. Close and reopen to retry.', true); return; }
    profile = data;
    renderAccount();
    if (!profile) { openDialog(accountDialog); message('Pick a nickname to start saving your flights.'); }
  }
  async function applySession(next) {
    const previousId = session?.user.id;
    session = next;
    if (previousId === session?.user.id && profile) return;
    generation++;
    activeRun = null;
    profile = null;
    renderAccount();
    if (session) await loadProfile(session.user.id, generation);
  }
  $('account-button').addEventListener('click', () => {
    message(''); openDialog(accountDialog);
    if (session && client) loadProfile(session.user.id, generation).catch(() => message('Unable to load your profile. Please retry.', true));
  });
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  for (const dialog of [accountDialog, leaderboardDialog]) {
    dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  }

  $('email-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (signingIn) return;
    if (!client) { message('Sign-in is temporarily unavailable. You can still play as a guest.', true); return; }
    signingIn = true; $('email-submit').disabled = true; message('Sending your sign-in link…');
    try {
      const {error} = await client.auth.signInWithOtp({email: $('email').value.trim(), options: {emailRedirectTo: REDIRECT_URL}});
      if (error) throw error;
      message('Check your inbox and spam folder. Open the link to sign in.');
    } catch (error) {
      const code = error.code || '';
      message(code === 'over_email_send_rate_limit' || error.status === 429
        ? 'Too many requests. Please wait a minute and try again.'
        : code === 'email_address_not_authorized'
          ? 'Email sign-in is not open to everyone yet. Guest play is available.'
          : 'We could not send the link. Please check your email address and try again.', true);
    } finally { signingIn = false; $('email-submit').disabled = false; }
  });

  $('profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!client || !session || savingProfile) return;
    const nickname = $('nickname').value.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(nickname)) { message('Use 3–20 letters, numbers, or underscores.', true); return; }
    const userId = session.user.id, version = generation;
    savingProfile = true; $('nickname-submit').disabled = true; message('Saving…');
    try {
      const result = profile
        ? await client.from('players').update({nickname}).eq('user_id', userId).select('user_id,nickname,best_score').single()
        : await client.from('players').insert({user_id: userId, nickname}).select('user_id,nickname,best_score').single();
      if (result.error) throw result.error;
      if (version !== generation) return;
      profile = result.data; renderAccount(); message('Profile saved. Your next flights will sync automatically.');
      syncMessage('Ready to save your next flight.');
    } catch (error) { if (version === generation) message(error.code === '23505' ? 'That nickname is taken. Try another.' : 'Could not save your nickname. Please retry.', true); }
    finally { savingProfile = false; $('nickname-submit').disabled = false; }
  });

  $('sign-out').addEventListener('click', async () => {
    if (!client) return;
    $('sign-out').disabled = true;
    try {
      const {error} = await client.auth.signOut({scope: 'local'});
      if (error) throw error;
      await applySession(null); message('Signed out on this device.'); syncMessage('Guest scores stay on this device.');
    } catch { message('Could not sign out. Please retry.', true); }
    finally { $('sign-out').disabled = false; }
  });

  async function loadLeaderboard() {
    const request = ++leaderboardRequest;
    $('leaderboard-message').textContent = 'Loading flights…';
    $('leaderboard-rows').replaceChildren();
    document.querySelectorAll('[data-period]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.period === period)));
    try {
      if (!client) throw new Error('Unavailable');
      const {data, error} = await client.rpc('game_leaderboard', {p_period: period});
      if (request !== leaderboardRequest) return;
      if (error) throw error;
      const fragment = document.createDocumentFragment();
      data.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.dataset.own = String(entry.nickname === profile?.nickname);
        for (const value of [index + 1, entry.nickname, entry.score]) {
          const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
        }
        fragment.append(row);
      });
      $('leaderboard-rows').replaceChildren(fragment);
      $('leaderboard-message').textContent = data.length ? '' : 'No flights yet. The first spot could be yours.';
    } catch { if (request === leaderboardRequest) $('leaderboard-message').textContent = 'Leaderboard unavailable. Tap a tab to retry.'; }
  }
  $('leaderboard-button').addEventListener('click', () => { openDialog(leaderboardDialog); loadLeaderboard(); });
  document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => {period = button.dataset.period; loadLeaderboard();}));

  window.addEventListener('astra:run-start', event => {
    activeRun = null;
    if (!session || !profile || !client) { syncMessage(session ? 'Choose a nickname to save flights.' : 'Sign in to save future flights across devices.'); return; }
    const run = {key: event.detail.key, userId: session.user.id, version: generation};
    run.pending = client.rpc('start_game_run').then(({data, error}) => {
      if (error) throw error;
      return data;
    }).catch(() => null);
    activeRun = run;
    syncMessage('Flight ready to sync.');
  });
  window.addEventListener('astra:run-finish', async event => {
    const run = activeRun;
    if (!run || run.key !== event.detail.key) return;
    activeRun = null;
    syncMessage('Saving flight…');
    try {
      const id = await run.pending;
      if (run.version !== generation || session?.user.id !== run.userId) return;
      if (!id) throw new Error('No registered run');
      const {data, error} = await client.rpc('finish_game_run', {p_run_id: id, p_score: event.detail.score, p_duration_ms: event.detail.durationMs});
      if (run.version !== generation || session?.user.id !== run.userId) return;
      if (error) throw error;
      profile.best_score = Math.max(profile.best_score, data); renderAccount();
      if (!activeRun) syncMessage('Flight saved. See where you landed on the leaderboard.');
      if (leaderboardDialog.open) loadLeaderboard();
    } catch { if (run.version === generation && !activeRun) syncMessage('Could not sync this flight. Your device best is still saved.', true); }
  });

  async function init() {
    try {
      if (!window.supabase?.createClient) throw new Error('SDK unavailable');
      client = window.supabase.createClient(PROJECT_URL, PUBLISHABLE_KEY, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
      client.auth.onAuthStateChange((event, next) => { setTimeout(() => applySession(next).catch(() => message('Could not load your account. Please retry.', true)), 0); });
      const {data, error} = await client.auth.getSession();
      if (error) throw error;
      await applySession(data.session);
    } catch { message('Accounts are temporarily unavailable. Guest play still works.', true); }
  }
  renderAccount(); init();
})();
