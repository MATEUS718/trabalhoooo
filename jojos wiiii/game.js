(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const startButton = document.getElementById('start-button');
  const soundButton = document.getElementById('sound-button');
  const keys = new Set();
  const W = canvas.width, H = canvas.height, floorY = 450;
  const stages = [
    { name: '01 — A GRUTA LUMINOSA', objective: 'ATIVE OS RELÉS', puzzle: 'relays', targets: [{ x: 230, y: 390 }, { x: 484, y: 230 }, { x: 730, y: 360 }], enemyX: 760, speed: 48, color: '#153e3e', intro: 'Nade pela gruta iluminada e siga os relés.' },
    { name: '02 — O SALÃO DE CRISTAIS', objective: 'SINCRONIZE O GERADOR', puzzle: 'timing', switchX: 484, switchY: 315, enemyX: 780, speed: 64, color: '#29433f', intro: 'Atravesse o salão de cristais e acione o pico verde.' },
    { name: '03 — A CATEDRAL SUBMERSA', objective: 'SOLTE AS CORRENTES', puzzle: 'chains', targets: [{ x: 402, y: 235 }, { x: 566, y: 365 }], enemyX: 800, speed: 78, color: '#453b35', intro: 'Solte as correntes na catedral e liberte o sino.' }
  ];
  const platforms = [{ x: 0, y: floorY, w: 308 }, { x: 374, y: floorY, w: 222 }, { x: 668, y: floorY, w: 292 }];
  const bubbles = Array.from({ length: 48 }, (_, i) => ({ x: (i * 197 + 51) % W, y: (i * 113 + 25) % H, r: 1 + (i % 3) * .8, speed: 7 + i % 8 }));
  let stageIndex = 0, running = false, complete = false, elapsed = 0, lastTime = 0, messageTimer = 0, audioContext, soundEnabled = true, particles = [], lastFootstep = 0;
  let player, enemy, activated, platformRaised, puzzleProgress, chainFlags;
  const stage = () => stages[stageIndex];
  function nearTarget(target, radius = 70) {
    const height = player.crouched ? 25 : player.h;
    return Math.hypot(player.x - target.x, player.y + height / 2 - target.y) < radius;
  }
  const resetStage = () => {
    player = { x: 92, y: floorY - 43, vx: 0, vy: 0, w: 26, h: 43, grounded: true, crouched: false, hidden: false, alive: true, strokeHeld: false, strokeCooldown: 0, strokeFlash: 0 };
    enemy = { x: stage().enemyX, y: floorY - 44, direction: -1, alert: 0, stunned: 0 };
    activated = false; platformRaised = false; puzzleProgress = 0; chainFlags = [false, false]; particles = []; updateLabels();
  };
  function say(text, duration = 2.5) {
    const node = document.getElementById('message'); node.textContent = text; node.classList.add('visible'); messageTimer = duration;
  }
  function updateLabels() {
    document.getElementById('chapter-label').textContent = `REGISTRO 0${stageIndex + 1} / 03`;
    const progress = stage().puzzle === 'chains' ? chainFlags.filter(Boolean).length : puzzleProgress;
    const total = stage().puzzle === 'chains' ? 2 : 3;
    document.getElementById('objective-label').textContent = activated ? 'SAÍDA LIBERADA' : `${stage().objective} · ${progress}/${total}`;
    document.getElementById('stage-name').textContent = stage().name;
    const hint = stage().puzzle === 'relays' ? `E · ATIVE O RELÉ ${puzzleProgress + 1}` : stage().puzzle === 'timing' ? 'E · ACIONE NO PICO' : 'E · SOLTE UMA CORRENTE';
    document.getElementById('hint-label').textContent = activated ? 'SAÍDA LIBERADA · →' : hint;
    const status = document.getElementById('status-label');
    status.textContent = player.hidden ? 'ESCONDIDO' : enemy.alert > .2 ? 'MOVIMENTO DETECTADO' : 'SINAL PERDIDO';
    status.style.color = player.hidden ? '#c2e66c' : enemy.alert > .2 ? '#ff765d' : '';
  }
  function sound(type) {
    if (!soundEnabled) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(), now = audioContext.currentTime;
      oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.type = type === 'danger' ? 'sawtooth' : 'sine';
      oscillator.frequency.setValueAtTime(type === 'switch' ? 180 : type === 'danger' ? 95 : 220, now);
      oscillator.frequency.exponentialRampToValueAtTime(type === 'switch' ? 620 : 55, now + .22);
      gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(type === 'danger' ? .055 : .025, now + .025);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .42); oscillator.start(now); oscillator.stop(now + .43);
    } catch (_) { /* Áudio opcional. */ }
  }
  function interact() {
    if (!running || !player.alive) return;
    if (activated) return;
    const puzzle = stage().puzzle;
    if (puzzle === 'relays') {
      const nextTarget = stage().targets[puzzleProgress];
      if (nearTarget(nextTarget)) {
        puzzleProgress++; sound('switch');
        if (puzzleProgress === stage().targets.length) solvePuzzle();
        else { say(`RELÉ ${puzzleProgress} DE 3 ATIVADO. SIGA A LUZ.`); updateLabels(); }
      } else if (stage().targets.some(target => nearTarget(target))) {
        puzzleProgress = 0; say('SEQUÊNCIA ERRADA. RECOMECE PELO PRIMEIRO RELÉ.'); updateLabels();
      } else say('APROXIME-SE DO PRÓXIMO RELÉ.', 1.8);
      return;
    }
    if (puzzle === 'timing') {
      if (!nearTarget({ x: stage().switchX, y: stage().switchY })) { say('APROXIME-SE DO GERADOR.', 1.8); return; }
      if (Math.sin(elapsed * 2.4) > .72) {
        puzzleProgress++; sound('switch');
        if (puzzleProgress === 3) solvePuzzle();
        else { say(`PULSO CAPTURADO · ${puzzleProgress}/3`); updateLabels(); }
      } else { puzzleProgress = 0; say('FORA DE FASE. ESPERE O PICO VERDE.'); updateLabels(); }
      return;
    }
    const chainIndex = stage().targets.findIndex((target, i) => !chainFlags[i] && nearTarget(target, 84));
    if (chainIndex !== -1) {
      chainFlags[chainIndex] = true; sound('switch');
      if (chainFlags.every(Boolean)) solvePuzzle();
      else { say('UMA CORRENTE SOLTA. ENCONTRE A OUTRA.'); updateLabels(); }
    } else say('PROCURE UMA CORRENTE INTACTA.', 1.8);
  }
  function solvePuzzle() {
    const lift = platforms[1];
    const playerBottom = player.y + (player.crouched ? 25 : player.h);
    const ridesLift = stageIndex === 1 && player.grounded && player.x + 10 > lift.x && player.x - 10 < lift.x + lift.w && Math.abs(playerBottom - lift.y) < 6;
    activated = true;
    if (stageIndex === 1) { platformRaised = true; if (ridesLift) player.y -= 56; }
    sound('switch'); say('MECANISMO RESOLVIDO. A ESCOTILHA ABRIU.'); updateLabels();
  }
  function killPlayer() {
    if (!player.alive) return;
    player.alive = false; sound('danger'); say('VOCÊ FOI VISTO. A ÁGUA FICOU QUIETA.', 2.4);
    window.setTimeout(() => { if (running) { resetStage(); say('SEM PÂNICO. TENTE OUTRA VEZ.', 2); } }, 1200);
  }
  function nextStage() {
    if (stageIndex < stages.length - 1) {
      stageIndex++; resetStage(); sound('switch'); say(stage().intro, 3.1); return;
    }
    running = false; complete = true; overlay.classList.remove('hidden');
    document.querySelector('.eyebrow').innerHTML = '<span class="signal-dot"></span> TRANSMISSÃO ENCERRADA · 03 / 03';
    document.querySelector('h1').innerHTML = 'O fundo<br><em>respondeu.</em>';
    document.querySelector('.overlay-content p').innerHTML = 'O sino silenciou. A luz do barco ainda está lá em cima.<br>Mas alguma coisa subiu com você.';
    startButton.innerHTML = 'MERGULHAR DE NOVO <span>↗</span>';
  }
  function update(dt) {
    elapsed += dt;
    if (messageTimer > 0 && (messageTimer -= dt) <= 0) document.getElementById('message').classList.remove('visible');
    bubbles.forEach(b => { b.y -= b.speed * dt; if (b.y < -5) { b.y = H + 3; b.x = Math.random() * W; } });
    if (!running || !player.alive) return;
    const left = keys.has('ArrowLeft') || keys.has('KeyA'), right = keys.has('ArrowRight') || keys.has('KeyD');
    const up = keys.has('ArrowUp') || keys.has('KeyW'), down = keys.has('ArrowDown') || keys.has('KeyS');
    const stroke = keys.has('Space');
    if (player.grounded) {
      const crouchRequested = down && !up && !stroke;
      if (crouchRequested !== player.crouched) player.y += player.crouched ? -18 : 18;
      player.crouched = crouchRequested;
    }
    player.hidden = player.grounded && player.crouched;
    const horizontal = (right ? 1 : 0) - (left ? 1 : 0);
    const vertical = (down && !player.grounded ? 1 : 0) - (up ? 1 : 0);
    player.strokeCooldown = Math.max(0, player.strokeCooldown - dt);
    player.strokeFlash = Math.max(0, player.strokeFlash - dt);
    if (stroke && !player.strokeHeld && player.strokeCooldown === 0) {
      player.vy -= 155; player.vx += horizontal * 42; player.strokeCooldown = .38; player.strokeFlash = .22;
    }
    player.strokeHeld = stroke;
    if (player.crouched && (up || stroke)) { player.y -= 18; player.crouched = false; player.hidden = false; }
    player.vx += horizontal * (player.grounded ? 1150 : 520) * dt;
    player.vy += vertical * 440 * dt;
    if (!player.grounded && vertical === 0) player.vy += 32 * dt;
    const drag = Math.exp(-(player.grounded ? 8 : 1.7) * dt);
    player.vx *= drag; player.vy *= Math.exp(-(player.grounded ? 8 : 1.35) * dt);
    const maxHorizontal = player.crouched ? 76 : 166;
    player.vx = Math.max(-maxHorizontal, Math.min(maxHorizontal, player.vx));
    player.vy = Math.max(-175, Math.min(175, player.vy));
    const oldY = player.y; player.x = Math.max(20, Math.min(W - 20, player.x + player.vx * dt));
    player.y += player.vy * dt; player.grounded = false;
    const height = player.crouched ? 25 : player.h;
    platforms.forEach((p, i) => {
      const top = p.y - (i === 1 && platformRaised ? 56 : 0);
      if (player.vy >= 0 && oldY + height <= top + 5 && player.y + height >= top && player.x + 10 > p.x && player.x - 10 < p.x + p.w) {
        player.y = top - height; player.vy = 0; player.grounded = true;
      }
    });
    if (player.y < 42) { player.y = 42; player.vy = Math.max(0, player.vy); }
    if (player.y > H + 50) { killPlayer(); return; }
    const playerCenterY = player.y + height / 2;
    const enemyDistanceX = player.x - enemy.x, enemyDistanceY = playerCenterY - enemy.y;
    const distance = Math.hypot(enemyDistanceX, enemyDistanceY);
    if (!player.hidden && distance < 210) enemy.alert = Math.min(1, enemy.alert + dt * (distance < 90 ? 1.25 : .55));
    else enemy.alert = Math.max(0, enemy.alert - dt * .25);
    if (enemy.alert > .45 && !player.hidden) {
      const chaseSpeed = stage().speed * (1 + enemy.alert * 1.5);
      enemy.x += enemyDistanceX / Math.max(1, distance) * chaseSpeed * dt;
      enemy.y += enemyDistanceY / Math.max(1, distance) * chaseSpeed * .72 * dt;
      enemy.direction = player.x < enemy.x ? -1 : 1;
    } else {
      enemy.x += enemy.direction * stage().speed * .52 * dt;
      enemy.y = floorY - 44 + Math.sin(elapsed * 1.7) * 8;
      if (enemy.x < 615 || enemy.x > 858) enemy.direction *= -1;
    }
    enemy.x = Math.max(602, Math.min(858, enemy.x)); enemy.y = Math.max(90, Math.min(floorY - 35, enemy.y));
    if (distance < 28 && !player.hidden) { killPlayer(); return; }
    if (activated && player.x > 835) nextStage();
    updateLabels();
    if (Math.random() < dt * 4) particles.push({ x: player.x + 8, y: player.y + 16, r: 1 + Math.random() * 2, life: .8 });
    particles = particles.filter(p => (p.life -= dt) > 0);
  }
  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, stageIndex === 2 ? '#162727' : '#12343a'); sky.addColorStop(.55, stage().color); sky.addColorStop(1, '#07191d'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const light = ctx.createRadialGradient(470, 38, 4, 470, 38, 440); light.addColorStop(0, 'rgba(202,230,188,.16)'); light.addColorStop(1, 'rgba(120,204,190,0)'); ctx.fillStyle = light; ctx.fillRect(0, 0, W, H);
    const rock = stageIndex === 1 ? '#142e30' : stageIndex === 2 ? '#272b29' : '#123333';
    ctx.fillStyle = rock;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 86);
    for (let x = W; x >= 0; x -= 80) { const depth = 78 + Math.sin(x * .027 + stageIndex) * 19 + Math.sin(x * .011) * 20; ctx.quadraticCurveTo(x - 40, depth + 24, x - 80, depth); }
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W, H); ctx.lineTo(W, 490);
    for (let x = W; x >= 0; x -= 80) { const depth = 484 + Math.sin(x * .019 + 1) * 17; ctx.quadraticCurveTo(x - 40, depth - 18, x - 80, depth); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0b2022';
    ctx.beginPath(); ctx.moveTo(0, 90); ctx.lineTo(68, 120); ctx.lineTo(92, 238); ctx.lineTo(54, 356); ctx.lineTo(0, 408); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W, 86); ctx.lineTo(W - 72, 128); ctx.lineTo(W - 96, 254); ctx.lineTo(W - 55, 366); ctx.lineTo(W, 414); ctx.closePath(); ctx.fill();
    ctx.fillStyle = stageIndex === 2 ? '#34332d' : '#23403b';
    [72, 205, 355, 576, 760, 906].forEach((x, i) => {
      const base = 93 + (i * 29 % 36), length = 35 + (i * 41 % 68), width = 16 + (i % 3) * 7;
      ctx.beginPath(); ctx.moveTo(x - width, base); ctx.lineTo(x, base + length); ctx.lineTo(x + width, base); ctx.closePath(); ctx.fill();
    });
    if (stageIndex === 1) {
      const crystal = (x, base, width, height, color) => {
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - width, base); ctx.lineTo(x - width * .48, base - height * .7); ctx.lineTo(x, base - height); ctx.lineTo(x + width * .3, base - height * .44); ctx.lineTo(x + width, base); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(193,239,218,.42)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, base - height); ctx.lineTo(x + width * .3, base - height * .44); ctx.lineTo(x, base); ctx.stroke();
      };
      crystal(140, 431, 35, 126, '#547e70'); crystal(186, 438, 24, 82, '#728c67'); crystal(780, 429, 42, 152, '#4c766b'); crystal(826, 435, 26, 92, '#9b7454'); crystal(520, 122, 22, 74, '#4b736b');
    } else if (stageIndex === 2) {
      ctx.save(); ctx.translate(493, 267); ctx.fillStyle = '#202522'; ctx.strokeStyle = '#a18b5d'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-30, -35); ctx.quadraticCurveTo(-34, 2, -53, 33); ctx.quadraticCurveTo(0, 51, 53, 33); ctx.quadraticCurveTo(34, 2, 30, -35); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -38, 11, Math.PI, 0); ctx.lineTo(11, -25); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = 'rgba(161,139,93,.35)'; ctx.lineWidth = 2;
      [392, 598].forEach((x, i) => { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (i ? 9 : -8), 190 + i * 56); ctx.stroke(); });
    } else {
      ctx.fillStyle = 'rgba(116,176,151,.12)';
      for (let i = 0; i < 18; i++) { const x = 38 + i * 51, y = 398 + Math.sin(i * 2.1) * 24; ctx.beginPath(); ctx.ellipse(x, y, 13, 5, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const drift = (elapsed * (5 + i) + i * 213) % (W + 180) - 90;
      const width = 18 + i % 3 * 10;
      ctx.fillStyle = 'rgba(190,224,197,.025)';
      ctx.beginPath(); ctx.moveTo(drift, 0); ctx.lineTo(drift + width, 0); ctx.lineTo(drift + width * 3, H); ctx.lineTo(drift + width, H); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#122b2b'; ctx.beginPath(); ctx.moveTo(0, 405);
    for (let x = 0; x <= W; x += 90) ctx.quadraticCurveTo(x + 45, 377 + (x % 3) * 10, x + 90, 408);
    ctx.lineTo(W, floorY); ctx.lineTo(0, floorY); ctx.fill();
    bubbles.forEach(b => { ctx.beginPath(); ctx.strokeStyle = `rgba(183,225,208,${.16 + b.r * .035})`; ctx.lineWidth = 1; ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke(); });
    ctx.fillStyle = 'rgba(4,12,14,.28)'; ctx.fillRect(0, 0, W, H);
    const vignette = ctx.createRadialGradient(W / 2, H * .42, 150, W / 2, H * .42, 620);
    vignette.addColorStop(0, 'rgba(2,9,11,0)'); vignette.addColorStop(1, 'rgba(2,9,11,.42)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
  }
  function drawPlatforms() {
    platforms.forEach((p, i) => {
      const top = p.y - (i === 1 && platformRaised ? 56 : 0); ctx.fillStyle = i === 1 && platformRaised ? '#53634d' : '#263b36'; ctx.fillRect(p.x, top, p.w, H - top);
      ctx.fillStyle = i === 1 && platformRaised ? '#bac276' : '#64795c'; ctx.fillRect(p.x, top, p.w, 5);
      for (let x = p.x + 12; x < p.x + p.w; x += 43) { ctx.fillStyle = '#1a302e'; ctx.fillRect(x, top + 16 + x * 7 % 30, 4, 3); }
    });
    ctx.fillStyle = '#31423a'; ctx.fillRect(0, floorY + 5, W, H - floorY); ctx.strokeStyle = '#59654b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(308, floorY); ctx.moveTo(374, floorY); ctx.lineTo(596, floorY); ctx.moveTo(668, floorY); ctx.lineTo(W, floorY); ctx.stroke();
  }
  function drawSwitch() {
    if (stage().puzzle === 'relays') {
      stage().targets.forEach(({ x, y }, i) => {
        const active = i < puzzleProgress || activated;
        ctx.save(); ctx.translate(x, y);
        ctx.fillStyle = '#1a2a28'; ctx.fillRect(-16, -15, 32, 30);
        ctx.fillStyle = active ? '#c5e872' : '#61746b'; ctx.fillRect(-5, -13, 10, 18);
        ctx.strokeStyle = active ? '#c5e872' : '#53635a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -22, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#d8e6d7'; ctx.font = '9px monospace'; ctx.fillText(String(i + 1), -3, -36);
        if (i === puzzleProgress && !activated) { ctx.fillStyle = '#c3e56a'; ctx.fillText('E', -3, -46); }
        ctx.restore();
      });
      return;
    }
    if (stage().puzzle === 'timing') {
      const ready = Math.sin(elapsed * 2.4) > .72, x = stage().switchX, y = stage().switchY;
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = '#1a2a28'; ctx.fillRect(-36, -31, 72, 62);
      ctx.strokeStyle = '#64776c'; ctx.lineWidth = 3; ctx.strokeRect(-31, -26, 62, 52);
      ctx.fillStyle = ready ? '#c5e872' : '#78928a'; ctx.shadowColor = ready ? '#c5e872' : 'transparent'; ctx.shadowBlur = ready ? 18 : 0;
      ctx.beginPath(); ctx.arc(0, -5, 12 + (ready ? Math.sin(elapsed * 12) * 2 : 0), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i < puzzleProgress ? '#c5e872' : '#40564e'; ctx.fillRect(-23 + i * 17, 15, 11, 5); }
      ctx.fillStyle = ready ? '#c5e872' : '#96aaa0'; ctx.font = '8px monospace'; ctx.fillText(ready ? 'PICO' : 'AGUARDE', -20, -36);
      ctx.restore();
      return;
    }
    stage().targets.forEach(({ x, y }, i) => {
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = chainFlags[i] ? '#718b79' : '#9d9b7e'; ctx.lineWidth = 3;
      if (chainFlags[i]) {
        ctx.beginPath(); ctx.moveTo(0, -58); ctx.lineTo(-8, -46); ctx.moveTo(0, 46); ctx.lineTo(8, 58); ctx.stroke();
        ctx.fillStyle = '#c5e872'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.moveTo(0, -58); ctx.lineTo(0, 58); ctx.stroke();
        for (let linkY = -46; linkY <= 46; linkY += 16) { ctx.fillStyle = '#4e6259'; ctx.fillRect(-3, linkY, 6, 4); }
        ctx.fillStyle = '#c3e56a'; ctx.font = '9px monospace'; ctx.fillText('E', -3, -67);
      }
      ctx.restore();
    });
  }
  function drawDoor() {
    const x = 890; ctx.fillStyle = '#111e1e'; ctx.fillRect(x - 20, floorY - 116, 40, 116); ctx.strokeStyle = activated ? '#d0e77b' : '#53635a'; ctx.lineWidth = 3; ctx.strokeRect(x - 20, floorY - 116, 40, 116);
    ctx.fillStyle = activated ? '#c5e66c' : '#dd785c'; ctx.beginPath(); ctx.arc(x + 9, floorY - 58, 3, 0, Math.PI * 2); ctx.fill();
    if (activated) { ctx.fillStyle = 'rgba(197,230,108,.15)'; ctx.fillRect(x - 18, floorY - 112, 36, 108); }
  }
  function drawEnemy() {
    ctx.save(); ctx.translate(enemy.x, enemy.y + 29); ctx.scale(enemy.direction, 1); const pulse = Math.sin(elapsed * 4) * 2; ctx.fillStyle = '#081215';
    ctx.beginPath(); ctx.ellipse(0, -29, 30, 19 + pulse * .3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-19, -37); ctx.lineTo(-39, -47); ctx.lineTo(-29, -33); ctx.lineTo(-45, -19); ctx.lineTo(-13, -25); ctx.fill();
    for (let i = 0; i < 4; i++) { const sway = Math.sin(elapsed * 3 + i) * 8; ctx.strokeStyle = '#101b1b'; ctx.lineWidth = 5 - i * .55; ctx.beginPath(); ctx.moveTo(-12 + i * 8, -16); ctx.quadraticCurveTo(-19 + i * 11 + sway, -2, -18 + i * 10 + sway, 8); ctx.stroke(); }
    ctx.fillStyle = enemy.alert > .35 ? '#ff634d' : '#cfb957'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = enemy.alert > .35 ? 15 : 8; ctx.beginPath(); ctx.arc(13, -32, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore(); ctx.shadowBlur = 0;
    if (enemy.alert > .2) { ctx.fillStyle = '#f18268'; ctx.font = '10px monospace'; ctx.fillText('!', enemy.x - 2, enemy.y - 32); }
  }
  function drawPlayer() {
    const h = player.crouched ? 26 : 43; ctx.save(); ctx.translate(player.x, player.y + h); if (!player.alive) ctx.globalAlpha = .35;
    if (!player.grounded && Math.hypot(player.vx, player.vy) > 8) {
      ctx.translate(0, -h / 2); ctx.rotate(Math.atan2(player.vy, player.vx) + Math.PI / 2); ctx.translate(0, h / 2);
    }
    if (player.crouched) {
      ctx.fillStyle = '#17272a'; ctx.fillRect(-15, -16, 28, 13);
      ctx.fillStyle = '#76a497'; ctx.fillRect(-4, -19, 13, 10);
      ctx.fillStyle = '#beccba'; ctx.beginPath(); ctx.arc(10, -18, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c5ec70'; ctx.beginPath(); ctx.arc(12, -18, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b332f'; ctx.fillRect(14, -20, 5, 4);
    } else {
      ctx.fillStyle = '#17272a'; ctx.fillRect(-10, -h + 14, 19, h - 14); ctx.fillStyle = '#beccba'; ctx.beginPath(); ctx.arc(0, -h + 8, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#76a497'; ctx.fillRect(-8, -h + 18, 16, 13); ctx.fillStyle = '#d6b45f'; ctx.fillRect(-9, -h + 30, 7, 11); ctx.fillRect(2, -h + 30, 7, 11);
      ctx.fillStyle = '#c5ec70'; ctx.beginPath(); ctx.arc(0, -h + 8, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1b332f'; ctx.fillRect(4, -h + 5, 7, 6);
      ctx.strokeStyle = '#98b2a2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(7, -h + 20); ctx.lineTo(15, -h + 24); ctx.stroke();
    }
    ctx.restore();
    particles.forEach(p => { ctx.globalAlpha = p.life; ctx.strokeStyle = '#cce5cd'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke(); }); ctx.globalAlpha = 1;
  }
  function render() {
    drawBackground(); drawPlatforms(); drawSwitch(); drawDoor(); drawEnemy(); drawPlayer();
    if (enemy.alert > .2 && running) { ctx.fillStyle = `rgba(180,48,36,${Math.min(.14, enemy.alert * .1)})`; ctx.fillRect(0, 0, W, H); }
  }
  function begin() {
    if (complete) {
      document.querySelector('.eyebrow').innerHTML = '<span class="signal-dot"></span> TRANSMISSÃO RECUPERADA · 03 FASES';
      document.querySelector('h1').innerHTML = 'O sino<br><em>afogado.</em>';
      document.querySelector('.overlay-content p').innerHTML = 'Algo lá embaixo respondeu ao seu sinal.<br>Agora, está vindo buscar você.';
      startButton.innerHTML = 'INICIAR MERGULHO <span>↗</span>';
    }
    overlay.classList.add('hidden'); running = true; complete = false; stageIndex = 0; resetStage(); say(stage().intro, 3.2);
  }
  startButton.addEventListener('click', begin);
  soundButton.addEventListener('click', () => { soundEnabled = !soundEnabled; soundButton.innerHTML = soundEnabled ? '♪ <span>SOM</span>' : '♪ <span>MUDO</span>'; soundButton.style.color = soundEnabled ? '' : '#e37b5f'; if (soundEnabled) sound('switch'); });
  window.addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault(); keys.add(e.code);
    if (e.code === 'KeyE' && !e.repeat) interact();
    if (e.code === 'KeyR' && !e.repeat && !running) begin();
  });
  window.addEventListener('keyup', e => keys.delete(e.code)); window.addEventListener('blur', () => keys.clear());
  resetStage();
  function frame(now) { const dt = Math.min(.034, (now - lastTime) / 1000 || 0); lastTime = now; update(dt); render(); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
})();
