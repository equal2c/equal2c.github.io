(() => {
  const GRID_SIZE = 24;
  const BOARD_CELLS = 20;
  const STORAGE_KEY = "equal2c-snake-high-score";
  const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  class SnakeGame {
    constructor(elements) {
      this.canvas = elements.canvas;
      this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
      this.scoreEl = elements.scoreEl;
      this.bestScoreEl = elements.bestScoreEl;
      this.stateEl = elements.stateEl;
      this.startButton = elements.startButton;
      this.pauseButton = elements.pauseButton;
      this.restartButton = elements.restartButton;
      this.boostButton = elements.boostButton;
      this.directionButtons = Array.from(elements.directionButtons || []);
      this.timerId = null;
      this.running = false;
      this.paused = false;
      this.gameOver = false;
      this.boostActive = false;
      this.score = 0;
      this.bestScore = this.readBestScore();
      this.direction = DIRECTIONS.right;
      this.nextDirection = DIRECTIONS.right;
      this.snake = [];
      this.food = { x: 0, y: 0 };
      this.boardPx = 0;
      this.cellPx = 0;
      this.lastFrame = 0;
      this.bindHandlers();
      this.syncHUD();
      this.resizeCanvas();
      window.addEventListener("resize", () => this.resizeCanvas());
    }

    init() {
      this.reset();
      this.render();
    }

    bindHandlers() {
      if (this.startButton) {
        this.startButton.addEventListener("click", () => this.start());
      }
      if (this.pauseButton) {
        this.pauseButton.addEventListener("click", () => this.togglePause());
      }
      if (this.restartButton) {
        this.restartButton.addEventListener("click", () => this.restart());
      }
      if (this.boostButton) {
        this.boostButton.addEventListener("pointerdown", () => this.setBoost(true));
        this.boostButton.addEventListener("pointerup", () => this.setBoost(false));
        this.boostButton.addEventListener("pointerleave", () => this.setBoost(false));
        this.boostButton.addEventListener("pointercancel", () => this.setBoost(false));
      }

      this.directionButtons.forEach((button) => {
        button.addEventListener("click", () => {
          this.queueDirection(button.dataset.direction);
        });
      });

      document.addEventListener("keydown", (event) => this.handleKeydown(event));
      document.addEventListener("keyup", (event) => this.handleKeyup(event));
    }

    handleKeydown(event) {
      const key = event.key.toLowerCase();
      if (key === " " || key === "spacebar") {
        event.preventDefault();
        this.setBoost(true);
        return;
      }

      if (key === "p") {
        event.preventDefault();
        this.togglePause();
        return;
      }

      if (key === "enter") {
        event.preventDefault();
        this.start();
        return;
      }

      const directionMap = {
        arrowup: "up",
        w: "up",
        arrowdown: "down",
        s: "down",
        arrowleft: "left",
        a: "left",
        arrowright: "right",
        d: "right",
      };

      if (directionMap[key]) {
        event.preventDefault();
        this.queueDirection(directionMap[key]);
      }
    }

    handleKeyup(event) {
      const key = event.key.toLowerCase();
      if (key === " " || key === "spacebar") {
        this.setBoost(false);
      }
    }

    resizeCanvas() {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      const size = Math.floor(Math.max(320, Math.min(rect.width || 600, 640)));
      this.boardPx = size;
      this.cellPx = Math.floor(size / BOARD_CELLS);
      this.canvas.width = this.cellPx * BOARD_CELLS;
      this.canvas.height = this.cellPx * BOARD_CELLS;
      this.render();
    }

    readBestScore() {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        return stored ? Number(stored) || 0 : 0;
      } catch {
        return 0;
      }
    }

    saveBestScore() {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(this.bestScore));
      } catch {
        // Ignore storage failures.
      }
    }

    syncHUD() {
      if (this.scoreEl) this.scoreEl.textContent = String(this.score);
      if (this.bestScoreEl) this.bestScoreEl.textContent = String(this.bestScore);
      if (this.stateEl) {
        const state = this.gameOver ? "Game Over" : this.paused ? "Paused" : this.running ? "Playing" : "Ready";
        this.stateEl.textContent = state;
      }
      if (this.pauseButton) {
        this.pauseButton.textContent = this.paused ? "Resume" : "Pause";
      }
      if (this.boostButton) {
        this.boostButton.setAttribute("aria-pressed", String(this.boostActive));
      }
    }

    reset() {
      const middle = Math.floor(BOARD_CELLS / 2);
      this.snake = [
        { x: middle, y: middle },
        { x: middle - 1, y: middle },
        { x: middle - 2, y: middle },
      ];
      this.direction = DIRECTIONS.right;
      this.nextDirection = DIRECTIONS.right;
      this.score = 0;
      this.paused = false;
      this.gameOver = false;
      this.running = false;
      this.boostActive = false;
      this.food = this.spawnFood();
      this.stopLoop();
      this.syncHUD();
      this.render();
    }

    start() {
      if (this.gameOver) {
        this.reset();
      }
      this.running = true;
      this.paused = false;
      this.syncHUD();
      this.startLoop();
    }

    restart() {
      this.reset();
      this.start();
    }

    togglePause() {
      if (!this.running && !this.gameOver) {
        this.start();
        return;
      }
      if (this.gameOver) {
        this.restart();
        return;
      }
      this.paused = !this.paused;
      this.syncHUD();
      this.restartLoopIfNeeded();
    }

    setBoost(active) {
      if (this.boostActive === active) return;
      this.boostActive = active;
      if (!this.running || this.paused || this.gameOver) {
        this.syncHUD();
        return;
      }
      this.syncHUD();
      this.restartLoopIfNeeded();
    }

    queueDirection(name) {
      const next = DIRECTIONS[name];
      if (!next) return;
      const current = this.direction;
      const opposite = current.x + next.x === 0 && current.y + next.y === 0;
      if (opposite && this.snake.length > 1) return;
      this.nextDirection = next;
      if (!this.running && !this.gameOver) {
        this.start();
      }
    }

    getDelay() {
      const baseDelay = 140;
      return this.boostActive ? 70 : Math.max(70, baseDelay - this.score * 2);
    }

    startLoop() {
      if (this.timerId != null || this.paused || this.gameOver || !this.running) return;
      this.timerId = window.setTimeout(() => this.tick(), this.getDelay());
    }

    stopLoop() {
      if (this.timerId != null) {
        window.clearTimeout(this.timerId);
        this.timerId = null;
      }
    }

    restartLoopIfNeeded() {
      if (!this.running || this.paused || this.gameOver) {
        this.stopLoop();
        return;
      }
      this.stopLoop();
      this.startLoop();
    }

    tick() {
      this.timerId = null;
      if (!this.running || this.paused || this.gameOver) {
        return;
      }

      this.direction = this.nextDirection;
      const head = this.snake[0];
      const nextHead = {
        x: head.x + this.direction.x,
        y: head.y + this.direction.y,
      };

      const willEat = nextHead.x === this.food.x && nextHead.y === this.food.y;
      const body = this.snake.slice(0, willEat ? this.snake.length : this.snake.length - 1);

      if (this.collidesWithWall(nextHead) || body.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y)) {
        this.finishGame();
        return;
      }

      this.snake.unshift(nextHead);

      if (willEat) {
        this.score += 10;
        if (this.score > this.bestScore) {
          this.bestScore = this.score;
          this.saveBestScore();
        }
        this.food = this.spawnFood();
      } else {
        this.snake.pop();
      }

      this.syncHUD();
      this.render();
      this.startLoop();
    }

    collidesWithWall(point) {
      return point.x < 0 || point.y < 0 || point.x >= BOARD_CELLS || point.y >= BOARD_CELLS;
    }

    spawnFood() {
      let food = { x: 0, y: 0 };
      let tries = 0;
      do {
        food = {
          x: Math.floor(Math.random() * BOARD_CELLS),
          y: Math.floor(Math.random() * BOARD_CELLS),
        };
        tries += 1;
      } while (this.snake.some((segment) => segment.x === food.x && segment.y === food.y) && tries < 200);
      return food;
    }

    finishGame() {
      this.gameOver = true;
      this.running = false;
      this.paused = false;
      this.stopLoop();
      this.syncHUD();
      this.render();
    }

    drawCell(x, y, fill, radius = 6) {
      if (!this.ctx) return;
      const px = x * this.cellPx;
      const py = y * this.cellPx;
      const size = this.cellPx;
      const r = Math.min(radius, size / 2 - 1);
      this.ctx.beginPath();
      this.ctx.moveTo(px + r, py);
      this.ctx.arcTo(px + size, py, px + size, py + size, r);
      this.ctx.arcTo(px + size, py + size, px, py + size, r);
      this.ctx.arcTo(px, py + size, px, py, r);
      this.ctx.arcTo(px, py, px + size, py, r);
      this.ctx.closePath();
      this.ctx.fillStyle = fill;
      this.ctx.fill();
    }

    renderBackground() {
      if (!this.ctx) return;
      const { ctx } = this;
      const width = this.canvas.width;
      const height = this.canvas.height;

      ctx.clearRect(0, 0, width, height);

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#10192b");
      gradient.addColorStop(1, "#0d1320");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      for (let index = 1; index < BOARD_CELLS; index += 1) {
        const offset = index * this.cellPx + 0.5;
        ctx.beginPath();
        ctx.moveTo(offset, 0);
        ctx.lineTo(offset, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, offset);
        ctx.lineTo(width, offset);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    render() {
      if (!this.ctx) return;
      this.renderBackground();

      this.drawCell(this.food.x, this.food.y, "#f5a236", 8);
      this.snake.forEach((segment, index) => {
        const fill = index === 0 ? "#8ef0a4" : "#2abf74";
        this.drawCell(segment.x, segment.y, fill, index === 0 ? 8 : 6);
      });

      if (!this.running && !this.gameOver) {
        this.drawOverlay("Press Start to play", "Use arrow keys, WASD, or the buttons below.");
      }

      if (this.paused) {
        this.drawOverlay("Paused", "Press Pause or P to continue.");
      }

      if (this.gameOver) {
        this.drawOverlay("Game Over", "Press Restart or Enter to try again.");
      }
    }

    drawOverlay(title, subtitle) {
      const { ctx } = this;
      const width = this.canvas.width;
      const height = this.canvas.height;
      ctx.save();
      ctx.fillStyle = "rgba(10, 14, 22, 0.62)";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 34px Georgia, serif";
      ctx.fillText(title, width / 2, height / 2 - 20);
      ctx.font = "500 16px Avenir Next, Segoe UI, sans-serif";
      ctx.fillStyle = "rgba(255, 255, 255, 0.84)";
      ctx.fillText(subtitle, width / 2, height / 2 + 20);
      ctx.restore();
    }
  }

  window.SnakeGame = SnakeGame;
})();
