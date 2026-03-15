import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

const GRID = 20;
const CELL = 24;
const CANVAS = GRID * CELL;

type Dir = { x: number; y: number };
type Point = { x: number; y: number };
type GameState = "idle" | "playing" | "game_over";

const DIRS: Record<string, Dir> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
  W: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  A: { x: -1, y: 0 },
  D: { x: 1, y: 0 },
};

function randomFood(snake: Point[]): Point {
  let pos: Point;
  do {
    pos = {
      x: Math.floor(Math.random() * GRID),
      y: Math.floor(Math.random() * GRID),
    };
  } while (snake.some((s) => s.x === pos.x && s.y === pos.y));
  return pos;
}

function getSpeed(score: number): number {
  return Math.max(60, 150 - Math.floor(score / 5) * 15);
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function renderGame(
  ctx: CanvasRenderingContext2D,
  snake: Point[],
  food: Point,
  score: number,
) {
  // Background
  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, 0, CANVAS, CANVAS);

  // Grid lines
  ctx.strokeStyle = "rgba(100,255,180,0.05)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= GRID; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL, 0);
    ctx.lineTo(i * CELL, CANVAS);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * CELL);
    ctx.lineTo(CANVAS, i * CELL);
    ctx.stroke();
  }

  // Draw snake body (tail to head-1)
  for (let i = snake.length - 1; i > 0; i--) {
    const seg = snake[i];
    const t = 1 - i / snake.length;
    const lightness = 0.45 + t * 0.3;
    const chroma = 0.15 + t * 0.1;
    ctx.fillStyle = `oklch(${lightness} ${chroma} 155)`;
    ctx.shadowColor = "oklch(0.75 0.2 155)";
    ctx.shadowBlur = 8;
    const pad = 2;
    drawRoundRect(
      ctx,
      seg.x * CELL + pad,
      seg.y * CELL + pad,
      CELL - pad * 2,
      CELL - pad * 2,
      5,
    );
  }

  // Draw snake head
  const head = snake[0];
  ctx.shadowColor = "#00ffaa";
  ctx.shadowBlur = 20;
  const grd = ctx.createLinearGradient(
    head.x * CELL,
    head.y * CELL,
    (head.x + 1) * CELL,
    (head.y + 1) * CELL,
  );
  grd.addColorStop(0, "#00ffcc");
  grd.addColorStop(1, "#00dd88");
  ctx.fillStyle = grd;
  drawRoundRect(
    ctx,
    head.x * CELL + 1,
    head.y * CELL + 1,
    CELL - 2,
    CELL - 2,
    7,
  );

  // Eyes on head
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#0a0a12";
  const eyeSize = 3;
  const eyeOff = 5;
  ctx.beginPath();
  ctx.arc(
    head.x * CELL + eyeOff,
    head.y * CELL + eyeOff,
    eyeSize,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.beginPath();
  ctx.arc(
    head.x * CELL + CELL - eyeOff,
    head.y * CELL + eyeOff,
    eyeSize,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Food (pulsing apple)
  const now = performance.now();
  const pulse = 1 + Math.sin(now * 0.004) * 0.12;
  const fc = CELL / 2;
  const fr = (CELL / 2 - 3) * pulse;
  ctx.shadowColor = "#ff4400";
  ctx.shadowBlur = 20;
  const fg = ctx.createRadialGradient(
    food.x * CELL + fc - 2,
    food.y * CELL + fc - 3,
    1,
    food.x * CELL + fc,
    food.y * CELL + fc,
    fr,
  );
  fg.addColorStop(0, "#ff9966");
  fg.addColorStop(0.5, "#ff3300");
  fg.addColorStop(1, "#cc1100");
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(food.x * CELL + fc, food.y * CELL + fc, fr, 0, Math.PI * 2);
  ctx.fill();

  // Leaf on food
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#44ff88";
  ctx.beginPath();
  ctx.ellipse(
    food.x * CELL + fc + 2,
    food.y * CELL + fc - fr + 1,
    4,
    2.5,
    -Math.PI / 4,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Border glow
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(0,255,160,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, CANVAS - 1, CANVAS - 1);

  // Score on canvas
  ctx.fillStyle = "rgba(0,255,160,0.9)";
  ctx.font = `bold 13px 'JetBrains Mono', monospace`;
  ctx.shadowColor = "rgba(0,255,160,0.6)";
  ctx.shadowBlur = 8;
  ctx.fillText(`SCORE: ${score}`, 10, 20);
  ctx.shadowBlur = 0;
}

type ScorePopup = { id: number; x: number; y: number };

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState>("idle");
  const snakeRef = useRef<Point[]>([{ x: 10, y: 10 }]);
  const dirRef = useRef<Dir>({ x: 1, y: 0 });
  const nextDirRef = useRef<Dir>({ x: 1, y: 0 });
  const foodRef = useRef<Point>({ x: 15, y: 10 });
  const scoreRef = useRef(0);
  const lastTimeRef = useRef(0);
  const rafRef = useRef<number>(0);
  const accRef = useRef(0);
  // Store callbacks in refs to avoid stale closures in rAF loop
  const setScoreRef = useRef<(n: number) => void>(() => {});
  const setGameStateRef = useRef<(s: GameState) => void>(() => {});
  const setHighScoreRef = useRef<(n: number) => void>(() => {});
  const addPopupRef = useRef<(p: ScorePopup) => void>(() => {});

  const [gameState, setGameState] = useState<GameState>("idle");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    try {
      return Number.parseInt(localStorage.getItem("snake_hs") || "0", 10);
    } catch {
      return 0;
    }
  });
  const [scorePopups, setScorePopups] = useState<ScorePopup[]>([]);
  const popupIdRef = useRef(0);

  // Keep refs in sync with latest state setters
  useEffect(() => {
    setScoreRef.current = setScore;
    setGameStateRef.current = setGameState;
    setHighScoreRef.current = setHighScore;
    addPopupRef.current = (p: ScorePopup) => {
      setScorePopups((prev) => [...prev, p]);
      setTimeout(() => {
        setScorePopups((prev) => prev.filter((x) => x.id !== p.id));
      }, 800);
    };
  });

  const initGame = useCallback(() => {
    const initSnake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];
    snakeRef.current = initSnake;
    dirRef.current = { x: 1, y: 0 };
    nextDirRef.current = { x: 1, y: 0 };
    foodRef.current = randomFood(initSnake);
    scoreRef.current = 0;
    lastTimeRef.current = 0;
    accRef.current = 0;
    setScore(0);
    setScorePopups([]);
  }, []);

  // The game loop lives in a ref — no stale closure issues
  const gameLoopRef = useRef<(timestamp: number) => void>(() => {});

  useEffect(() => {
    gameLoopRef.current = (timestamp: number) => {
      if (gameStateRef.current !== "playing") return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;

      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;
      accRef.current += delta;

      const speed = getSpeed(scoreRef.current);

      if (accRef.current >= speed) {
        accRef.current -= speed;

        dirRef.current = nextDirRef.current;
        const head = snakeRef.current[0];
        const newHead = {
          x: (head.x + dirRef.current.x + GRID) % GRID,
          y: (head.y + dirRef.current.y + GRID) % GRID,
        };

        // Collision with self
        if (
          snakeRef.current.some((s) => s.x === newHead.x && s.y === newHead.y)
        ) {
          // End game via refs — no stale state
          cancelAnimationFrame(rafRef.current);
          const final = scoreRef.current;
          const hs = Number.parseInt(
            localStorage.getItem("snake_hs") || "0",
            10,
          );
          if (final > hs) {
            localStorage.setItem("snake_hs", String(final));
            setHighScoreRef.current(final);
          }
          gameStateRef.current = "game_over";
          setGameStateRef.current("game_over");
          return;
        }

        const newSnake = [newHead, ...snakeRef.current];

        // Eat food
        if (
          newHead.x === foodRef.current.x &&
          newHead.y === foodRef.current.y
        ) {
          scoreRef.current += 1;
          setScoreRef.current(scoreRef.current);
          // Trigger +1 popup near canvas score area
          addPopupRef.current({
            id: ++popupIdRef.current,
            x: Math.random() * 40 + 30,
            y: Math.random() * 20 + 10,
          });
          foodRef.current = randomFood(newSnake);
        } else {
          newSnake.pop();
        }

        snakeRef.current = newSnake;
      }

      renderGame(ctx, snakeRef.current, foodRef.current, scoreRef.current);
      rafRef.current = requestAnimationFrame((ts) => gameLoopRef.current(ts));
    };
  });

  const startGame = useCallback(() => {
    initGame();
    gameStateRef.current = "playing";
    setGameState("playing");
    // Start loop directly — no stale closure
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame((ts) => gameLoopRef.current(ts));
  }, [initGame]);

  // Draw idle frame
  useEffect(() => {
    if (gameState !== "playing") {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;
      const demoSnake = [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 },
        { x: 7, y: 10 },
        { x: 6, y: 10 },
      ];
      renderGame(ctx, demoSnake, { x: 14, y: 10 }, 0);
    }
  }, [gameState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const changeDir = useCallback((dir: Dir) => {
    const cur = dirRef.current;
    if (dir.x === -cur.x && dir.y === -cur.y) return;
    nextDirRef.current = dir;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
      }
      if (gameStateRef.current !== "playing") return;
      const d = DIRS[e.key];
      if (d) changeDir(d);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeDir]);

  return (
    <div className="min-h-screen bg-background game-bg flex flex-col items-center justify-between relative overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, oklch(0.82 0.18 155 / 0.04) 0%, transparent 70%)",
        }}
      />

      {/* Header */}
      <header className="w-full flex items-center justify-center py-6 px-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1
            className="text-4xl md:text-5xl font-extrabold tracking-tight neon-text text-primary animate-flicker"
            style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
          >
            🐍 SNAKE
          </h1>
          <p
            className="text-muted-foreground text-sm mt-1 tracking-widest uppercase"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            Arcade Classic
          </p>
        </motion.div>
      </header>

      {/* Main game area */}
      <main className="flex flex-col items-center gap-6 px-4 flex-1 justify-center">
        {/* Score panel */}
        <motion.div
          data-ocid="game.score_panel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex gap-8 items-center"
        >
          {/* Prominent score display */}
          <div className="text-center relative">
            <p
              className="text-muted-foreground text-xs tracking-widest uppercase mb-1"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Score
            </p>
            <AnimatePresence mode="popLayout">
              <motion.p
                key={score}
                initial={{ scale: 1.6, color: "#00ffcc" }}
                animate={{ scale: 1, color: "oklch(0.82 0.18 155)" }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="text-4xl font-bold neon-text"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {score}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="w-px h-10 bg-border" />
          <div className="text-center">
            <p
              className="text-muted-foreground text-xs tracking-widest uppercase mb-1"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Best
            </p>
            <p
              className="text-3xl font-bold text-accent neon-cyan"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {highScore}
            </p>
          </div>
          {gameState === "playing" && (
            <div className="text-center">
              <p
                className="text-muted-foreground text-xs tracking-widest uppercase mb-1"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Speed
              </p>
              <p
                className="text-lg font-bold text-yellow-400"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {Math.round((150 / getSpeed(score)) * 10) / 10}x
              </p>
            </div>
          )}
        </motion.div>

        {/* Canvas wrapper */}
        <div className="relative scanlines">
          <canvas
            ref={canvasRef}
            data-ocid="game.canvas_target"
            width={CANVAS}
            height={CANVAS}
            className="block rounded-lg neon-border border"
            style={{ imageRendering: "pixelated" }}
          />

          {/* +1 floating popups */}
          <AnimatePresence>
            {scorePopups.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 1, y: p.y, x: p.x, scale: 1 }}
                animate={{ opacity: 0, y: p.y - 50, x: p.x, scale: 1.4 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="absolute pointer-events-none select-none font-extrabold text-xl"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "#00ffcc",
                  textShadow: "0 0 12px #00ffcc, 0 0 24px #00ffcc",
                  top: 0,
                  left: 0,
                }}
              >
                +1
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Overlays */}
          <AnimatePresence>
            {gameState === "idle" && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center rounded-lg z-10"
                style={{ background: "oklch(0.08 0.01 260 / 0.88)" }}
              >
                {/* Nasif dedication text */}
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mb-4 text-center px-4"
                >
                  <p
                    className="text-xs tracking-widest uppercase text-muted-foreground mb-1"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    Made for
                  </p>
                  <p
                    className="text-2xl font-extrabold tracking-wide"
                    style={{
                      fontFamily: "'Bricolage Grotesque', sans-serif",
                      background:
                        "linear-gradient(90deg, #00ffcc, #00aaff, #aa00ff)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      filter: "drop-shadow(0 0 8px rgba(0,200,255,0.6))",
                    }}
                  >
                    Nasif
                  </p>
                </motion.div>

                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{
                    duration: 2,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                  }}
                  className="text-6xl mb-4"
                >
                  🐍
                </motion.div>
                <h2 className="text-2xl font-bold text-primary neon-text mb-2">
                  Ready to Play?
                </h2>
                <p className="text-muted-foreground text-sm mb-1 text-center max-w-xs">
                  Use Arrow Keys or WASD to move
                </p>
                <p className="text-muted-foreground text-xs mb-6 text-center max-w-xs">
                  Eat 🍎 to grow &amp; score points!
                </p>
                {highScore > 0 && (
                  <p
                    className="text-accent text-sm mb-4 neon-cyan"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    🏆 Best: {highScore}
                  </p>
                )}
                <Button
                  data-ocid="game.primary_button"
                  onClick={startGame}
                  size="lg"
                  className="neon-btn bg-primary text-primary-foreground font-bold text-lg px-10 py-6 rounded-xl tracking-wider"
                >
                  PLAY
                </Button>
              </motion.div>
            )}

            {gameState === "game_over" && (
              <motion.div
                key="gameover"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute inset-0 flex flex-col items-center justify-center rounded-lg z-10"
                style={{ background: "oklch(0.08 0.01 260 / 0.92)" }}
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="text-5xl mb-3"
                >
                  💀
                </motion.div>
                <h2
                  className="text-3xl font-extrabold text-destructive mb-1"
                  style={{ textShadow: "0 0 20px oklch(0.65 0.22 25 / 0.8)" }}
                >
                  GAME OVER
                </h2>
                <div className="flex gap-6 my-4">
                  <div className="text-center">
                    <p className="text-muted-foreground text-xs tracking-widest uppercase">
                      Score
                    </p>
                    <p
                      className="text-4xl font-bold text-primary neon-text"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {score}
                    </p>
                  </div>
                  <div className="w-px bg-border" />
                  <div className="text-center">
                    <p className="text-muted-foreground text-xs tracking-widest uppercase">
                      Best
                    </p>
                    <p
                      className="text-4xl font-bold text-accent neon-cyan"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {highScore}
                    </p>
                  </div>
                </div>
                {score >= highScore && score > 0 && (
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-yellow-400 font-bold text-sm mb-3 tracking-wider"
                  >
                    🎉 NEW HIGH SCORE!
                  </motion.p>
                )}
                <Button
                  data-ocid="game.primary_button"
                  onClick={startGame}
                  size="lg"
                  className="neon-btn bg-primary text-primary-foreground font-bold text-lg px-10 py-6 rounded-xl tracking-wider mt-2"
                >
                  PLAY AGAIN
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* D-Pad controls */}
        <div className="flex flex-col items-center gap-1 mt-2">
          <Button
            data-ocid="game.up_button"
            variant="outline"
            size="icon"
            className="w-12 h-12 border-border hover:border-primary hover:text-primary text-xl"
            onPointerDown={() => changeDir(DIRS.ArrowUp)}
          >
            ▲
          </Button>
          <div className="flex gap-1">
            <Button
              data-ocid="game.left_button"
              variant="outline"
              size="icon"
              className="w-12 h-12 border-border hover:border-primary hover:text-primary text-xl"
              onPointerDown={() => changeDir(DIRS.ArrowLeft)}
            >
              ◀
            </Button>
            <div
              className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center"
              style={{ border: "1px solid oklch(var(--border))" }}
            >
              <span className="text-muted-foreground text-xs">D-PAD</span>
            </div>
            <Button
              data-ocid="game.right_button"
              variant="outline"
              size="icon"
              className="w-12 h-12 border-border hover:border-primary hover:text-primary text-xl"
              onPointerDown={() => changeDir(DIRS.ArrowRight)}
            >
              ▶
            </Button>
          </div>
          <Button
            data-ocid="game.down_button"
            variant="outline"
            size="icon"
            className="w-12 h-12 border-border hover:border-primary hover:text-primary text-xl"
            onPointerDown={() => changeDir(DIRS.ArrowDown)}
          >
            ▼
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-4 px-4">
        <p className="text-muted-foreground text-xs">
          © {new Date().getFullYear()}. Built with ❤️ using{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
          >
            caffeine.ai
          </a>
        </p>
      </footer>
    </div>
  );
}
