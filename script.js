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

  const rainbow = ['#FF6B6B', '#FFD93D', '#4ECDC4', '#C77DFF', '#FF6EC7'];

  let snake, dir, nextDir, food, score, best, running, paused, speedMs, loopHandle;
  let particles = [];

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
    speedMs = 130;
    particles = [];
    scoreEl.textContent = score;
    placeFood();
  }

  function placeFood() {
    let pos;
    do {
      pos = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
    } while (snake.some(s => s.x === pos.x && s.y === pos.y));
    food = pos;
    food.hue = Math.random() * 360;
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
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const stripe = Math.floor((x + y) / 2) % 2 === 0;
        ctx.fillStyle = stripe ? '#4C8C3B' : '#579941';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 40; i++) {
      const gx = (i * 53) % (cols * cell);
      const gy = (i * 97) % (rows * cell);
      ctx.fillRect(gx, gy, 2, 6);
    }
  }

  function drawFood(t) {
    const pulse = 3 + Math.sin(t / 150) * 2;
    const cx = food.x * cell + cell / 2;
    const cy = food.y * cell + cell / 2;
    const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, cell / 2 + pulse);
    grad.addColorStop(0, `hsl(${food.hue}, 95%, 70%)`);
    grad.addColorStop(1, `hsla(${food.hue}, 95%, 55%, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, cell / 2 + pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `hsl(${food.hue}, 85%, 55%)`;
    ctx.beginPath();
    ctx.arc(cx, cy + 1, cell / 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(cx - 2.5, cy - 2, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3E8E41';
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy - cell / 3, 3.5, 2, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSnake() {
    snake.forEach((seg, i) => {
      if (i === 0) {
        drawRoundedCell(seg.x, seg.y, '#FFD93D', 1);
      } else {
        drawRoundedCell(seg.x, seg.y, '#3B82F6', 3);
      }
    });

    const head = snake[0];
    ctx.fillStyle = '#170B2E';
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