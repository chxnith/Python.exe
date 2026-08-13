(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const cell = 24;
  const cols = canvas.width / cell;
  const rows = canvas.height / cell;

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const startBtn = document.getElementById('startBtn');
  const dpad = document.getElementById('dpad');

  const levelEl = document.getElementById('level');
  const LEVEL2_SCORE = 100;

  const THEMES = {
    1: {
      accent: '#35E6A0',
      accentDark: '#0FA36F',
      boardA: '#111623',
      boardB: '#0D111C',
      grid: 'rgba(53, 230, 160, 0.06)',
    },
    2: {
      accent: '#35E6A0',
      accentDark: '#0FA36F',
      boardA: '#111623',
      boardB: '#0D111C',
      grid: 'rgba(53, 230, 160, 0.06)',
    },
  };
  const BERRY = '#FF5C7A';

  function colorToRgb(c) {
    if (c.startsWith('#')) {
      const n = parseInt(c.slice(1), 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    const parts = c.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number);
    return { r: parts[0], g: parts[1], b: parts[2] };
  }

  function mixColor(colorA, colorB, t) {
    const a = colorToRgb(colorA), b = colorToRgb(colorB);
    const r = Math.round(a.r + (b.r - a.r) * t);
    const g = Math.round(a.g + (b.g - a.g) * t);
    const bl = Math.round(a.b + (b.b - a.b) * t);
    return `rgb(${r}, ${g}, ${bl})`;
  }

  function lighten(color, t) { return mixColor(color, '#FFFFFF', t); }
  function darken(color, t) { return mixColor(color, '#000000', t); }

  let snake, dir, nextDir, food, score, best, running, paused, speedMs, loopHandle;
  let particles = [];
  let level = 1;

  best = Number(localStorage.getItem('neonSnakeBest') || 0);
  bestEl.textContent = best;

  const muteBtn = document.getElementById('muteBtn');
  let muted = localStorage.getItem('gardenSnakeMuted') === 'true';
  muteBtn.textContent = muted ? '🔇' : '🔊';

  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function tone(freq, startTime, duration, type, gainPeak) {
    const ac = getAudioCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(gainPeak || 0.15, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain).connect(ac.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  function playEatSound() {
    if (muted) return;
    const ac = getAudioCtx();
    const t = ac.currentTime;
    tone(660, t, 0.09, 'square', 0.12);
    tone(880, t + 0.06, 0.12, 'square', 0.12);
  }

  function playTurnTick() {
    if (muted) return;
    const ac = getAudioCtx();
    tone(320, ac.currentTime, 0.03, 'sine', 0.03);
  }

  function playStartSound() {
    if (muted) return;
    const ac = getAudioCtx();
    const t = ac.currentTime;
    [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.09, 0.14, 'triangle', 0.1));
  }

  function playGameOverSound() {
    if (muted) return;
    const ac = getAudioCtx();
    const t = ac.currentTime;
    [392, 330, 262, 196].forEach((f, i) => tone(f, t + i * 0.14, 0.22, 'sawtooth', 0.1));
  }

  function playLevelUpSound() {
    if (muted) return;
    const ac = getAudioCtx();
    const t = ac.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.08, 0.18, 'triangle', 0.13));
  }

  muteBtn.addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem('gardenSnakeMuted', String(muted));
    muteBtn.textContent = muted ? '🔇' : '🔊';
    if (!muted) getAudioCtx().resume();
  });

  function resetState() {
    snake = [
      { x: 9, y: 10 },
      { x: 8, y: 10 },
      { x: 7, y: 10 },
    ];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    speedMs = 150;
    particles = [];
    scoreEl.textContent = score;
    level = 1;
    levelEl.textContent = level;
    document.body.classList.remove('level2');
    placeFood();
  }

  function checkLevelUp() {
    if (level === 1 && score >= LEVEL2_SCORE) {
      level = 2;
      levelEl.textContent = level;
      speedMs = Math.max(40, speedMs / 1.25);
      clearInterval(loopHandle);
      loopHandle = setInterval(step, speedMs);
      playLevelUpSound();
      showLevelUpToast();
    }
  }

  function showLevelUpToast() {
    const toast = document.createElement('div');
    toast.className = 'level-toast';
    toast.textContent = 'LEVEL 2!';
    document.querySelector('.board-wrap').appendChild(toast);
    setTimeout(() => toast.classList.add('fade'), 1000);
    setTimeout(() => toast.remove(), 1700);
  }

  function placeFood() {
    let pos;
    do {
      pos = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
    } while (snake.some(s => s.x === pos.x && s.y === pos.y));
    food = pos;
    food.hue = 42 + (Math.random() * 14 - 7);
  }

  function drawRoundedCell(x, y, color, inset) {
    const pad = inset || 2;
    const px = x * cell + pad / 2;
    const py = y * cell + pad / 2;
    const size = cell - pad;
    const r = 6;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px + r, py);
    ctx.arcTo(px + size, py, px + size, py + size, r);
    ctx.arcTo(px + size, py + size, px, py + size, r);
    ctx.arcTo(px, py + size, px, py, r);
    ctx.arcTo(px, py, px + size, py, r);
    ctx.closePath();
    ctx.fill();
  }

  function drawBoard() {
    const theme = THEMES[level];

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const stripe = (x + y) % 2 === 0;
        ctx.fillStyle = stripe ? theme.boardA : theme.boardB;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= cols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cell + 0.5, 0);
      ctx.lineTo(x * cell + 0.5, rows * cell);
      ctx.stroke();
    }
    for (let y = 0; y <= rows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cell + 0.5);
      ctx.lineTo(cols * cell, y * cell + 0.5);
      ctx.stroke();
    }

    const vg = ctx.createRadialGradient(
      cols * cell / 2, rows * cell / 2, cell * 3,
      cols * cell / 2, rows * cell / 2, cols * cell / 1.25
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, cols * cell, rows * cell);
  }

  function drawFood(t) {
    const cx = food.x * cell + cell / 2;
    const cy = food.y * cell + cell / 2;
    const r = cell / 2.6;

    const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, r + 7);
    glow.addColorStop(0, 'rgba(255, 209, 102, 0.5)');
    glow.addColorStop(1, 'rgba(255, 209, 102, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
    ctx.fill();

    // shadow cast on the board beneath the coin
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.55, r * 0.85, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // spin: squash horizontally to fake a coin flipping in 3D
    const spin = Math.cos(t / 480);
    const scaleX = Math.max(0.22, Math.abs(spin));
    const facingFront = scaleX > 0.45;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scaleX, 1);

    const body = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r);
    body.addColorStop(0, '#FFF3B0');
    body.addColorStop(0.45, '#FFD34D');
    body.addColorStop(0.8, '#E0A400');
    body.addColorStop(1, '#8A5B00');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(120, 78, 0, 0.75)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    if (facingFront) {
      ctx.strokeStyle = 'rgba(138, 91, 0, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.3, -r * 0.32, r * 0.32, r * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawSnake() {
    const theme = THEMES[level];

    snake.forEach((seg, i) => {
      const pad = i === 0 ? 1 : 3;
      ctx.save();
      ctx.translate(0, 3);
      ctx.globalAlpha = 0.3;
      drawRoundedCell(seg.x, seg.y, '#000000', pad);
      ctx.restore();
    });

    snake.forEach((seg, i) => {
      const px = seg.x * cell, py = seg.y * cell;

      if (i === 0) {
        const light = lighten(theme.accent, 0.4);
        const dark = darken(theme.accent, 0.35);
        const grad = ctx.createLinearGradient(px, py, px + cell, py + cell);
        grad.addColorStop(0, light);
        grad.addColorStop(1, dark);

        ctx.save();
        ctx.shadowColor = theme.accent;
        ctx.shadowBlur = 16;
        drawRoundedCell(seg.x, seg.y, grad, 1);
        ctx.restore();

        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.ellipse(px + cell * 0.32, py + cell * 0.28, cell * 0.18, cell * 0.1, -0.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const t = Math.min(0.75, i / snake.length);
        const base = mixColor(theme.accent, theme.boardA, t);
        const light = lighten(base, 0.22);
        const dark = darken(base, 0.32);
        const grad = ctx.createLinearGradient(px, py, px + cell, py + cell);
        grad.addColorStop(0, light);
        grad.addColorStop(1, dark);
        drawRoundedCell(seg.x, seg.y, grad, 3);

        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath();
        ctx.ellipse(px + cell * 0.32, py + cell * 0.28, cell * 0.12, cell * 0.06, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    const head = snake[0];
    ctx.fillStyle = '#06140F';
    const hx = head.x * cell, hy = head.y * cell;
    const eyeOffsets = getEyeOffsets(dir);
    eyeOffsets.forEach(([ex, ey]) => {
      ctx.beginPath();
      ctx.arc(hx + ex, hy + ey, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function getEyeOffsets(d) {
    if (d.x === 1) return [[cell - 7, 7], [cell - 7, cell - 7]];
    if (d.x === -1) return [[7, 7], [7, cell - 7]];
    if (d.y === -1) return [[7, 7], [cell - 7, 7]];
    return [[7, cell - 7], [cell - 7, cell - 7]];
  }

  function spawnParticles(x, y, hue) {
    for (let i = 0; i < 14; i++) {
      particles.push({
        x: x * cell + cell / 2,
        y: y * cell + cell / 2,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 1,
        hue,
      });
    }
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = `hsl(${p.hue}, 100%, 65%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    particles = particles
      .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.05 }))
      .filter(p => p.life > 0);
  }

  function step() {
    if (paused) return;
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows || snake.some(s => s.x === head.x && s.y === head.y)) {
      gameOver();
      return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      score += 10;
      scoreEl.textContent = score;
      spawnParticles(food.x, food.y, food.hue);
      playEatSound();
      checkLevelUp();
      speedMs = Math.max(70, speedMs - 2);
      placeFood();
      clearInterval(loopHandle);
      loopHandle = setInterval(step, speedMs);
    } else {
      snake.pop();
    }
  }

  function render(t) {
    drawBoard();
    drawFood(t);
    drawSnake();
    drawParticles();
    if (running) requestAnimationFrame(render);
  }

  function gameOver() {
    running = false;
    clearInterval(loopHandle);
    playGameOverSound();
    if (score > best) {
      best = score;
      localStorage.setItem('neonSnakeBest', String(best));
      bestEl.textContent = best;
    }
    overlayTitle.textContent = 'Game Over';
    overlayText.textContent = `Score: ${score}. Tap start to try again.`;
    startBtn.textContent = 'Play Again';
    overlay.classList.add('show');
  }

  function startGame() {
    resetState();
    overlay.classList.remove('show');
    running = true;
    paused = false;
    getAudioCtx().resume();
    playStartSound();
    clearInterval(loopHandle);
    loopHandle = setInterval(step, speedMs);
    requestAnimationFrame(render);
  }

  function setDirection(x, y) {
    if (dir.x === -x && dir.y === -y) return;
    if (nextDir.x !== x || nextDir.y !== y) playTurnTick();
    nextDir = { x, y };
  }

  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W': setDirection(0, -1); break;
      case 'ArrowDown': case 's': case 'S': setDirection(0, 1); break;
      case 'ArrowLeft': case 'a': case 'A': setDirection(-1, 0); break;
      case 'ArrowRight': case 'd': case 'D': setDirection(1, 0); break;
      case ' ':
        if (running) paused = !paused;
        break;
    }
  });

  dpad.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = btn.dataset.dir;
      if (d === 'up') setDirection(0, -1);
      if (d === 'down') setDirection(0, 1);
      if (d === 'left') setDirection(-1, 0);
      if (d === 'right') setDirection(1, 0);
    });
  });

  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => {
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      setDirection(dx > 0 ? 1 : -1, 0);
    } else {
      setDirection(0, dy > 0 ? 1 : -1);
    }
    touchStart = null;
  });

  startBtn.addEventListener('click', startGame);

  resetState();
  drawBoard();
  drawFood(0);
  drawSnake();
})();