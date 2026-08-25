import { useCallback, useEffect, useRef, useState } from "react";
import { Gamepad2, Pause, Play, RotateCcw } from "lucide-react";
import { Button, Card, Modal } from "./ui";

const COLS = 18;
const ROWS = 14;
const CELL = 16;

type Point = { x: number; y: number };

function randFood(snake: Point[]): Point {
  let p: Point;
  do {
    p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
  } while (snake.some((s) => s.x === p.x && s.y === p.y));
  return p;
}

/** Mini Snake en modal centrado — las flechas no scrollean la página. */
export default function DashboardSnake() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [dead, setDead] = useState(false);
  const snakeRef = useRef<Point[]>([
    { x: 5, y: 7 },
    { x: 4, y: 7 },
    { x: 3, y: 7 },
  ]);
  const dirRef = useRef<Point>({ x: 1, y: 0 });
  const foodRef = useRef<Point>({ x: 12, y: 7 });
  const [, tick] = useState(0);

  const reset = useCallback(() => {
    snakeRef.current = [
      { x: 5, y: 7 },
      { x: 4, y: 7 },
      { x: 3, y: 7 },
    ];
    dirRef.current = { x: 1, y: 0 };
    foodRef.current = { x: 12, y: 7 };
    setScore(0);
    setDead(false);
    setRunning(false);
    tick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!open || !running || dead) return;
    const id = window.setInterval(() => {
      const snake = snakeRef.current;
      const dir = dirRef.current;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (
        head.x < 0 ||
        head.y < 0 ||
        head.x >= COLS ||
        head.y >= ROWS ||
        snake.some((s) => s.x === head.x && s.y === head.y)
      ) {
        setDead(true);
        setRunning(false);
        return;
      }
      const next = [head, ...snake];
      if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
        foodRef.current = randFood(next);
        setScore((s) => s + 1);
      } else {
        next.pop();
      }
      snakeRef.current = next;
      tick((n) => n + 1);
    }, 140);
    return () => window.clearInterval(id);
  }, [open, running, dead]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const d = dirRef.current;
      if (e.key === "ArrowUp" && d.y === 0) dirRef.current = { x: 0, y: -1 };
      if (e.key === "ArrowDown" && d.y === 0) dirRef.current = { x: 0, y: 1 };
      if (e.key === "ArrowLeft" && d.x === 0) dirRef.current = { x: -1, y: 0 };
      if (e.key === "ArrowRight" && d.x === 0) dirRef.current = { x: 1, y: 0 };
      if (e.key === " " && !dead) setRunning((r) => !r);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, dead]);

  const snake = snakeRef.current;
  const food = foodRef.current;

  return (
    <>
      <Card className="overflow-hidden border-dashed border-brand-400/40">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Gamepad2 size={18} className="text-brand-600 dark:text-brand-300" />
            Pausa · Snake
          </span>
          <span className="text-xs text-ink-muted">Abrir</span>
        </button>
      </Card>

      <Modal
        open={open}
        title="Pausa · Snake"
        onClose={() => {
          setOpen(false);
          setRunning(false);
        }}
      >
        <div className="space-y-4">
          <p className="text-center text-sm text-ink-muted">
            Flechas para mover · Espacio pausa · Puntaje:{" "}
            <strong className="text-ink">{score}</strong>
            {dead ? " · Fin" : ""}
          </p>
          <div
            className="relative mx-auto rounded-xl border border-slate-700 bg-slate-950 shadow-inner"
            style={{ width: COLS * CELL, height: ROWS * CELL }}
            tabIndex={0}
          >
            {snake.map((p, i) => (
              <div
                key={`${p.x}-${p.y}-${i}`}
                className="absolute rounded-sm bg-emerald-400"
                style={{
                  left: p.x * CELL,
                  top: p.y * CELL,
                  width: CELL - 1,
                  height: CELL - 1,
                  opacity: i === 0 ? 1 : 0.75,
                }}
              />
            ))}
            <div
              className="absolute rounded-full bg-rose-400"
              style={{
                left: food.x * CELL + 2,
                top: food.y * CELL + 2,
                width: CELL - 4,
                height: CELL - 4,
              }}
            />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (dead) reset();
                setRunning((r) => !r);
              }}
            >
              {running ? <Pause size={14} /> : <Play size={14} />}
              {running ? "Pausa" : "Jugar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw size={14} /> Reiniciar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
