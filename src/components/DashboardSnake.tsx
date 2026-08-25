import { useCallback, useEffect, useRef, useState } from "react";
import { Gamepad2, Pause, Play, RotateCcw } from "lucide-react";
import { Button, Card } from "./ui";

const COLS = 16;
const ROWS = 12;
const CELL = 14;

type Point = { x: number; y: number };

function randFood(snake: Point[]): Point {
  let p: Point;
  do {
    p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
  } while (snake.some((s) => s.x === p.x && s.y === p.y));
  return p;
}

/** Mini Snake opcional en el inicio — pausa corta entre turnos. */
export default function DashboardSnake() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [dead, setDead] = useState(false);
  const snakeRef = useRef<Point[]>([
    { x: 4, y: 6 },
    { x: 3, y: 6 },
    { x: 2, y: 6 },
  ]);
  const dirRef = useRef<Point>({ x: 1, y: 0 });
  const foodRef = useRef<Point>({ x: 10, y: 6 });
  const [, tick] = useState(0);

  const reset = useCallback(() => {
    snakeRef.current = [
      { x: 4, y: 6 },
      { x: 3, y: 6 },
      { x: 2, y: 6 },
    ];
    dirRef.current = { x: 1, y: 0 };
    foodRef.current = { x: 10, y: 6 };
    setScore(0);
    setDead(false);
    tick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!open || !running || dead) return;
    const id = window.setInterval(() => {
      const snake = snakeRef.current;
      const dir = dirRef.current;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || snake.some((s) => s.x === head.x && s.y === head.y)) {
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
      const d = dirRef.current;
      if (e.key === "ArrowUp" && d.y === 0) dirRef.current = { x: 0, y: -1 };
      if (e.key === "ArrowDown" && d.y === 0) dirRef.current = { x: 0, y: 1 };
      if (e.key === "ArrowLeft" && d.x === 0) dirRef.current = { x: -1, y: 0 };
      if (e.key === "ArrowRight" && d.x === 0) dirRef.current = { x: 1, y: 0 };
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const snake = snakeRef.current;
  const food = foodRef.current;

  return (
    <Card className="overflow-hidden border-dashed border-brand-400/40">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) reset();
        }}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Gamepad2 size={18} className="text-brand-600 dark:text-brand-300" />
          Pausa · Snake
        </span>
        <span className="text-xs text-ink-muted">{open ? "Ocultar" : "Abrir"}</span>
      </button>
      {open && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-ink-muted">
            Flechas del teclado. Puntaje: <strong className="text-ink">{score}</strong>
            {dead ? " · Fin — reiniciá" : ""}
          </p>
          <div
            className="relative mx-auto rounded-lg border border-[var(--color-panel-border)] bg-slate-950"
            style={{ width: COLS * CELL, height: ROWS * CELL }}
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
          <div className="mt-3 flex flex-wrap justify-center gap-2">
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
          <p className="mt-2 text-center text-[10px] text-ink-muted">
            Spotify / YouTube con cuenta no van en la app de escritorio (OAuth + políticas). Snake sí.
          </p>
        </div>
      )}
    </Card>
  );
}
