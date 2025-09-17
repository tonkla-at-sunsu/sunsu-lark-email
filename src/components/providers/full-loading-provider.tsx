/* eslint-disable @next/next/no-img-element */
"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";

const FullLoadingContext = createContext((value: boolean) => value);

function FullLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#00000050] bg-opacity-50 z-50">
      <img src="loading.gif" alt="loading" className="w-[200px] h-[200px]" />
      {/* <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div> */}
    </div>
  );
}

function DinoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<{
    dinoY: number;
    dinoVelocity: number;
    obstacles: Array<{ x: number; width: number; height: number }>;
    gameSpeed: number;
    score: number;
    isJumping: boolean;
    gameRunning: boolean;
    animationId: number | null;
    lastObstacleDistance: number;
  }>({
    dinoY: 0,
    dinoVelocity: 0,
    obstacles: [],
    gameSpeed: 2,
    score: 0,
    isJumping: false,
    gameRunning: true,
    animationId: null,
    lastObstacleDistance: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const game = gameRef.current;
    const canvasWidth = 400;
    const canvasHeight = 200;
    const groundY = canvasHeight - 40;
    const dinoX = 50;
    const dinoSize = 30;

    game.dinoY = groundY - dinoSize;
    game.gameRunning = true;
    game.lastObstacleDistance = 0;

    const jump = () => {
      if (!game.isJumping && game.gameRunning) {
        game.isJumping = true;
        game.dinoVelocity = -16;
      }
    };

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        jump();
      }
    };

    const handleClick = () => {
      jump();
    };

    window.addEventListener("keydown", handleKeyPress);
    canvas.addEventListener("click", handleClick);

    const gameLoop = () => {
      if (!game.gameRunning) return;

      ctx.fillStyle = "#f7f7f7";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      ctx.fillStyle = "#535353";
      ctx.fillRect(0, groundY, canvasWidth, 40);

      if (game.isJumping) {
        game.dinoY += game.dinoVelocity;
        game.dinoVelocity += 0.8;

        if (game.dinoY >= groundY - dinoSize) {
          game.dinoY = groundY - dinoSize;
          game.dinoVelocity = 0;
          game.isJumping = false;
        }
      }

      ctx.fillStyle = "#535353";
      ctx.fillRect(dinoX, game.dinoY, dinoSize, dinoSize);
      ctx.fillStyle = "#000";
      ctx.fillRect(dinoX + 20, game.dinoY + 5, 5, 5);

      const obstacleInterval = 200;
      if (game.score - game.lastObstacleDistance >= obstacleInterval) {
        game.obstacles.push({
          x: canvasWidth,
          width: 20,
          height: 30,
        });
        game.lastObstacleDistance = game.score;
      }

      game.obstacles = game.obstacles.filter((obstacle) => {
        obstacle.x -= game.gameSpeed;

        ctx.fillStyle = "#535353";
        ctx.fillRect(
          obstacle.x,
          groundY - obstacle.height,
          obstacle.width,
          obstacle.height,
        );

        if (
          obstacle.x < dinoX + dinoSize &&
          obstacle.x + obstacle.width > dinoX &&
          game.dinoY + dinoSize > groundY - obstacle.height
        ) {
          game.obstacles = [];
          game.score = 0;
          game.gameSpeed = 2;
          game.lastObstacleDistance = 0;
        }

        return obstacle.x > -obstacle.width;
      });

      game.score += 1;
      if (game.score % 100 === 0) {
        game.gameSpeed += 0.1;
      }

      ctx.fillStyle = "#535353";
      ctx.font = "16px monospace";
      ctx.fillText(`Score: ${Math.floor(game.score / 10)}`, 10, 30);

      ctx.font = "12px monospace";
      ctx.fillText("Press SPACE or click to jump", 10, canvasHeight - 10);

      game.animationId = requestAnimationFrame(gameLoop);
    };

    game.animationId = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener("keydown", handleKeyPress);
      canvas.removeEventListener("click", handleClick);
      game.gameRunning = false;
      if (game.animationId) {
        cancelAnimationFrame(game.animationId);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center flex-col gap-3 bg-[#00000050] bg-opacity-50 z-50">
      <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
      <div className="bg-white p-4 rounded-lg shadow-lg">
        <canvas
          ref={canvasRef}
          width={400}
          height={200}
          className="border border-gray-300"
        />
        <div className="text-center mt-2 text-sm text-gray-600">
          กำลังโหลดครับใจเย็น ๆ ;-;
        </div>
      </div>
    </div>
  );
}

export function FullLoadingProvider({
  children,
}: {
  children: ReactNode;
  useDinoGame?: boolean;
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [useDino, setUseDino] = useState(false);

  const onChangeLoading = useCallback((value: boolean, useDino = false) => {
    setLoading(value);
    setUseDino(useDino)
    return value;
  }, []);

  return (
    <FullLoadingContext.Provider value={onChangeLoading}>
      {loading && (useDino ? <DinoGame /> : <FullLoading />)}
      {children}
    </FullLoadingContext.Provider>
  );
}

export const useFullLoadingContext = () => useContext(FullLoadingContext);
