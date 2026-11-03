import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { EyeMood } from '../types';

interface EyesCompanionProps {
  mood?: EyeMood;
  isMusicPlaying: boolean;
  cpuUsage: number;
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
}

export const EyesCompanion: React.FC<EyesCompanionProps> = ({
  mood: externalMood = 'idle',
  isMusicPlaying,
  cpuUsage,
  size = 'small',
  onClick,
}) => {
  const [internalWink, setInternalWink] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });

  // Determine current effective mood
  const currentMood: EyeMood = useMemo(() => {
    if (internalWink) return 'wink';
    if (cpuUsage > 80) return 'stress';
    if (externalMood === 'sleepy') return 'sleepy';
    if (isMusicPlaying) return 'groove';
    return externalMood;
  }, [internalWink, cpuUsage, externalMood, isMusicPlaying]);

  // Natural intermittent blinking
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleBlink = () => {
      setIsBlinking(true);
      setTimeout(() => {
        setIsBlinking(false);
        // Double blink chance (20%)
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
  }, []);

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

  const scale = size === 'large' ? 1.3 : size === 'medium' ? 1.1 : 0.88;

  // Dynamic glow color based on system health & music
  const eyeColor =
    currentMood === 'stress'
      ? '#FB7185' // soft rose/coral
      : isMusicPlaying
      ? '#38BDF8' // electric sky blue
      : '#E0F2FE'; // crisp soft ice-white

  const glowStyle =
    currentMood === 'stress'
      ? 'drop-shadow(0 0 5px rgba(251, 113, 133, 0.6))'
      : isMusicPlaying
      ? 'drop-shadow(0 0 5px rgba(56, 189, 248, 0.5))'
      : 'drop-shadow(0 0 4px rgba(224, 242, 254, 0.4))';

  return (
    <div
      onClick={handleClick}
      className="flex items-center justify-center gap-2 cursor-pointer py-0.5 px-1 rounded-full select-none hover:opacity-90 transition-opacity"
      title="Aether Companion (Click to wink)"
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
      {/* Left Eye */}
      <motion.div
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        animate={
          currentMood === 'groove'
            ? { y: [0, -2, 0], rotate: [-2, 2, -2] }
            : currentMood === 'stress'
            ? { x: [-1.2, 1.2, -1.2], scaleY: [0.8, 1.1, 0.8] }
            : { x: mouseOffset.x, y: mouseOffset.y }
        }
        transition={
          currentMood === 'groove'
            ? { repeat: Infinity, duration: 0.7, ease: 'easeInOut' }
            : currentMood === 'stress'
            ? { repeat: Infinity, duration: 0.12 }
            : { type: 'spring', stiffness: 350, damping: 25 }
        }
      >
        <svg width="16" height="18" viewBox="0 0 16 18" className="overflow-visible">
          {currentMood === 'groove' ? (
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
            ? { scaleY: 0.2 }
            : currentMood === 'groove'
            ? { y: [0, -2, 0], rotate: [2, -2, 2] }
            : currentMood === 'stress'
            ? { x: [1.2, -1.2, 1.2], scaleY: [0.8, 1.1, 0.8] }
            : { x: mouseOffset.x, y: mouseOffset.y }
        }
        transition={
          currentMood === 'groove'
            ? { repeat: Infinity, duration: 0.7, ease: 'easeInOut', delay: 0.08 }
            : currentMood === 'stress'
            ? { repeat: Infinity, duration: 0.12 }
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
