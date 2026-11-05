import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { EyeMood } from '../types';

interface EyesCompanionProps {
  mood?: EyeMood;
  isMusicPlaying: boolean;
  cpuUsage: number;
  isCharging?: boolean;
  isDragging?: boolean;
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export const EyesCompanion: React.FC<EyesCompanionProps> = ({
  mood: externalMood = 'idle',
  isMusicPlaying,
  cpuUsage,
  isCharging = false,
  isDragging = false,
  size = 'small',
  onClick,
  onDoubleClick,
}) => {
  const [internalWink, setInternalWink] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });

  // Charging transition flash (⚡ ⚡ for 2 seconds on plugin)
  const [chargingFlash, setChargingFlash] = useState(false);
  const prevChargingRef = useRef(isCharging);

  useEffect(() => {
    if (!prevChargingRef.current && isCharging) {
      setChargingFlash(true);
      const timer = setTimeout(() => setChargingFlash(false), 2200);
      return () => clearTimeout(timer);
    }
    prevChargingRef.current = isCharging;
  }, [isCharging]);

  // Petting / Scratching interaction (^ ^)
  const [pettingHappy, setPettingHappy] = useState(false);
  const pettingStrokesRef = useRef<{ count: number; lastX: number; lastDir: number; lastTime: number }>({
    count: 0,
    lastX: 0,
    lastDir: 0,
    lastTime: 0,
  });

  const handlePointerMoveOverEyes = (e: React.PointerEvent) => {
    const now = Date.now();
    const state = pettingStrokesRef.current;
    const deltaX = e.clientX - state.lastX;

    if (Math.abs(deltaX) > 4) {
      const dir = deltaX > 0 ? 1 : -1;
      if (state.lastDir !== 0 && dir !== state.lastDir && now - state.lastTime < 450) {
        state.count++;
        if (state.count >= 3) {
          setPettingHappy(true);
          setTimeout(() => setPettingHappy(false), 1400);
          state.count = 0;
        }
      }
      state.lastDir = dir;
      state.lastX = e.clientX;
      state.lastTime = now;
    }
  };

  // Deep sleep after 3 minutes of total user inactivity (idle & no music)
  const [isDeepSleeping, setIsDeepSleeping] = useState(false);

  useEffect(() => {
    let sleepTimeout: ReturnType<typeof setTimeout>;

    const resetSleepTimer = () => {
      setIsDeepSleeping(false);
      clearTimeout(sleepTimeout);
      if (!isMusicPlaying) {
        sleepTimeout = setTimeout(() => {
          setIsDeepSleeping(true);
        }, 180000); // 3 minutes
      }
    };

    resetSleepTimer();

    window.addEventListener('mousemove', resetSleepTimer);
    window.addEventListener('keydown', resetSleepTimer);
    window.addEventListener('pointerdown', resetSleepTimer);

    return () => {
      clearTimeout(sleepTimeout);
      window.removeEventListener('mousemove', resetSleepTimer);
      window.removeEventListener('keydown', resetSleepTimer);
      window.removeEventListener('pointerdown', resetSleepTimer);
    };
  }, [isMusicPlaying]);

  // Determine current effective mood
  const currentMood: EyeMood = useMemo(() => {
    if (isDragging) return 'dizzy';
    if (chargingFlash) return 'charging';
    if (internalWink) return 'wink';
    if (pettingHappy) return 'happy';
    if (cpuUsage > 80) return 'stress';
    if (isMusicPlaying) return 'groove';
    if (isDeepSleeping || externalMood === 'sleepy') return 'sleepy';
    return externalMood;
  }, [isDragging, chargingFlash, internalWink, pettingHappy, cpuUsage, isMusicPlaying, isDeepSleeping, externalMood]);

  // Natural intermittent blinking (suppressed during dizzy, wink, or sleep)
  useEffect(() => {
    if (currentMood === 'sleepy' || currentMood === 'dizzy' || currentMood === 'charging') {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleBlink = () => {
      setIsBlinking(true);
      setTimeout(() => {
        setIsBlinking(false);
        // Double blink chance (25%)
        if (Math.random() < 0.25) {
          setTimeout(() => {
            setIsBlinking(true);
            setTimeout(() => {
              setIsBlinking(false);
              timeoutId = setTimeout(scheduleBlink, 3000 + Math.random() * 4000);
            }, 120);
          }, 150);
        } else {
          timeoutId = setTimeout(scheduleBlink, 3000 + Math.random() * 4500);
        }
      }, 160);
    };

    timeoutId = setTimeout(scheduleBlink, 2000);
    return () => clearTimeout(timeoutId);
  }, [currentMood]);

  // Parallax mouse look-at tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const centerX = window.innerWidth / 2;
      const centerY = 30;
      const dx = (e.clientX - centerX) / (window.innerWidth / 2 || 1);
      const dy = (e.clientY - centerY) / 300;
      setMouseOffset({
        x: Math.max(-2.5, Math.min(2.5, dx * 2.5)),
        y: Math.max(-2, Math.min(2, dy * 2)),
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInternalWink(true);
    setTimeout(() => setInternalWink(false), 900);
    onClick?.();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick?.();
  };

  const scale = size === 'large' ? 1.3 : size === 'medium' ? 1.1 : 0.88;

  // Dynamic glow color based on system health, charging, & music
  const eyeColor =
    currentMood === 'stress'
      ? '#FB7185' // soft rose/coral
      : currentMood === 'charging'
      ? '#FACC15' // vibrant electric amber-yellow
      : isMusicPlaying
      ? '#38BDF8' // electric sky blue
      : currentMood === 'happy'
      ? '#34D399' // mint emerald
      : currentMood === 'dizzy'
      ? '#A78BFA' // purple lilac
      : '#E0F2FE'; // crisp soft ice-white

  const glowStyle =
    currentMood === 'stress'
      ? 'drop-shadow(0 0 5px rgba(251, 113, 133, 0.6))'
      : currentMood === 'charging'
      ? 'drop-shadow(0 0 6px rgba(250, 204, 21, 0.8))'
      : isMusicPlaying
      ? 'drop-shadow(0 0 5px rgba(56, 189, 248, 0.5))'
      : currentMood === 'happy'
      ? 'drop-shadow(0 0 5px rgba(52, 211, 153, 0.6))'
      : currentMood === 'dizzy'
      ? 'drop-shadow(0 0 5px rgba(167, 139, 250, 0.6))'
      : 'drop-shadow(0 0 4px rgba(224, 242, 254, 0.4))';

  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerMove={handlePointerMoveOverEyes}
      className="relative flex items-center justify-center gap-2 cursor-pointer py-0.5 px-1 rounded-full select-none hover:opacity-90 transition-opacity"
      title="Aether Companion (Click to wink, stroke to pet, double-click to toggle stats)"
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transform: `scale(${scale})`,
        filter: glowStyle,
      }}
    >
      {/* Floating 'z' particle during deep sleep */}
      {currentMood === 'sleepy' && (
        <motion.div
          initial={{ y: 0, opacity: 0, scale: 0.6 }}
          animate={{ y: -8, opacity: [0, 0.8, 0], scale: [0.6, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 2.8, ease: 'easeOut' }}
          className="absolute -top-1.5 right-0.5 text-[8px] font-bold text-sky-300 pointer-events-none select-none font-mono"
        >
          z
        </motion.div>
      )}

      {/* Left Eye */}
      <motion.div
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        animate={
          currentMood === 'dizzy'
            ? { rotate: 360, x: 0, y: 0, scale: 1, scaleY: 1 }
            : currentMood === 'charging'
            ? { scale: [0.95, 1.1, 0.95], rotate: 0, x: 0, y: 0 }
            : currentMood === 'happy'
            ? { y: [0, -2, 0], rotate: 0, x: 0, scale: 1, scaleY: 1 }
            : currentMood === 'groove'
            ? { y: [0, -2, 0], rotate: [-2, 2, -2], x: 0, scale: 1, scaleY: 1 }
            : currentMood === 'stress'
            ? { x: [-1.2, 1.2, -1.2], scaleY: [0.8, 1.1, 0.8], rotate: 0, y: 0 }
            : currentMood === 'sleepy'
            ? { scaleY: [1, 0.7, 1], y: [0, 0.6, 0], rotate: 0, x: 0 }
            : { x: mouseOffset.x, y: mouseOffset.y, rotate: 0, scale: 1, scaleY: 1 }
        }
        transition={
          currentMood === 'dizzy'
            ? { repeat: Infinity, duration: 0.65, ease: 'linear' }
            : currentMood === 'charging'
            ? { repeat: Infinity, duration: 0.4 }
            : currentMood === 'happy'
            ? { repeat: Infinity, duration: 0.5, ease: 'easeInOut' }
            : currentMood === 'groove'
            ? { repeat: Infinity, duration: 0.7, ease: 'easeInOut' }
            : currentMood === 'stress'
            ? { repeat: Infinity, duration: 0.12 }
            : currentMood === 'sleepy'
            ? { repeat: Infinity, duration: 3.2, ease: 'easeInOut' }
            : { type: 'spring', stiffness: 350, damping: 25 }
        }
      >
        <svg width="16" height="18" viewBox="0 0 16 18" className="overflow-visible">
          {currentMood === 'dizzy' ? (
            // Spinning swirl spiral
            <path
              d="M 8 9 C 7 8 7 6.5 8 5.5 C 9.5 4 12 5 12.5 7.5 C 13 10.5 10 13 7 12.5 C 4 12 2.5 9 3.5 6 C 4.5 2.5 9 1 12.5 2.5"
              fill="none"
              stroke={eyeColor}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          ) : currentMood === 'charging' ? (
            // Electric lightning bolt
            <path
              d="M 9 1 L 4 9 L 8.5 9 L 7 17 L 13 8 L 8.5 8 Z"
              fill={eyeColor}
            />
          ) : currentMood === 'happy' ? (
            // Joyful pet squint (^ ^)
            <path
              d="M 2 11 Q 8 4 14 11"
              fill="none"
              stroke={eyeColor}
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          ) : currentMood === 'groove' ? (
            // Curved joyful crescent
            <path
              d="M 2 11 Q 8 3 14 11"
              fill="none"
              stroke={eyeColor}
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          ) : currentMood === 'sleepy' ? (
            // Relaxed resting slit
            <line
              x1="2"
              y1="9"
              x2="14"
              y2="9"
              stroke={eyeColor}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          ) : (
            // Sleek OLED Capsule Eye with smooth blinking
            <rect
              x="2"
              y={isBlinking ? "8" : "2"}
              width="12"
              height={isBlinking ? "2" : "14"}
              rx={isBlinking ? "1" : "5.5"}
              fill={eyeColor}
              className="transition-all duration-100 ease-out"
            />
          )}
        </svg>
      </motion.div>

      {/* Right Eye */}
      <motion.div
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        animate={
          currentMood === 'wink'
            ? { scaleY: 0.2, rotate: 0, x: 0, y: 0 }
            : currentMood === 'dizzy'
            ? { rotate: 360, x: 0, y: 0, scale: 1, scaleY: 1 }
            : currentMood === 'charging'
            ? { scale: [0.95, 1.1, 0.95], rotate: 0, x: 0, y: 0 }
            : currentMood === 'happy'
            ? { y: [0, -2, 0], rotate: 0, x: 0, scale: 1, scaleY: 1 }
            : currentMood === 'groove'
            ? { y: [0, -2, 0], rotate: [2, -2, 2], x: 0, scale: 1, scaleY: 1 }
            : currentMood === 'stress'
            ? { x: [1.2, -1.2, 1.2], scaleY: [0.8, 1.1, 0.8], rotate: 0, y: 0 }
            : currentMood === 'sleepy'
            ? { scaleY: [1, 0.7, 1], y: [0, 0.6, 0], rotate: 0, x: 0 }
            : { x: mouseOffset.x, y: mouseOffset.y, rotate: 0, scale: 1, scaleY: 1 }
        }
        transition={
          currentMood === 'dizzy'
            ? { repeat: Infinity, duration: 0.65, ease: 'linear' }
            : currentMood === 'charging'
            ? { repeat: Infinity, duration: 0.4, delay: 0.05 }
            : currentMood === 'happy'
            ? { repeat: Infinity, duration: 0.5, ease: 'easeInOut', delay: 0.06 }
            : currentMood === 'groove'
            ? { repeat: Infinity, duration: 0.7, ease: 'easeInOut', delay: 0.08 }
            : currentMood === 'stress'
            ? { repeat: Infinity, duration: 0.12 }
            : currentMood === 'sleepy'
            ? { repeat: Infinity, duration: 3.2, ease: 'easeInOut', delay: 0.1 }
            : { type: 'spring', stiffness: 350, damping: 25 }
        }
      >
        <svg width="16" height="18" viewBox="0 0 16 18" className="overflow-visible">
          {currentMood === 'wink' ? (
            // Playful wink arc
            <path
              d="M 2 10 Q 8 15 14 10"
              fill="none"
              stroke={eyeColor}
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          ) : currentMood === 'dizzy' ? (
            // Spinning swirl spiral
            <path
              d="M 8 9 C 7 8 7 6.5 8 5.5 C 9.5 4 12 5 12.5 7.5 C 13 10.5 10 13 7 12.5 C 4 12 2.5 9 3.5 6 C 4.5 2.5 9 1 12.5 2.5"
              fill="none"
              stroke={eyeColor}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          ) : currentMood === 'charging' ? (
            // Electric lightning bolt
            <path
              d="M 9 1 L 4 9 L 8.5 9 L 7 17 L 13 8 L 8.5 8 Z"
              fill={eyeColor}
            />
          ) : currentMood === 'happy' ? (
            // Joyful pet squint (^ ^)
            <path
              d="M 2 11 Q 8 4 14 11"
              fill="none"
              stroke={eyeColor}
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          ) : currentMood === 'groove' ? (
            // Curved joyful crescent
            <path
              d="M 2 11 Q 8 3 14 11"
              fill="none"
              stroke={eyeColor}
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          ) : currentMood === 'sleepy' ? (
            // Relaxed resting slit
            <line
              x1="2"
              y1="9"
              x2="14"
              y2="9"
              stroke={eyeColor}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          ) : (
            // Sleek OLED Capsule Eye
            <rect
              x="2"
              y={isBlinking ? "8" : "2"}
              width="12"
              height={isBlinking ? "2" : "14"}
              rx={isBlinking ? "1" : "5.5"}
              fill={eyeColor}
              className="transition-all duration-100 ease-out"
            />
          )}
        </svg>
      </motion.div>
    </div>
  );
};

