import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { EyeMood } from '../types';

interface EyesCompanionProps {
  mood: EyeMood;
  isMusicPlaying: boolean;
  cpuUsage: number;
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
}

export const EyesCompanion: React.FC<EyesCompanionProps> = ({
  mood: externalMood,
  isMusicPlaying,
  cpuUsage,
  size = 'small',
  onClick,
}) => {
  const [internalWink, setInternalWink] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });

  // Resolve current effective mood
  const currentMood: EyeMood = useMemo(() => {
    if (internalWink) return 'wink';
    if (cpuUsage > 80) return 'stress';
    if (externalMood === 'sleepy') return 'sleepy';
    if (isMusicPlaying) return 'groove';
    return externalMood;
  }, [internalWink, cpuUsage, externalMood, isMusicPlaying]);

  // Periodic natural blinking
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const triggerBlink = () => {
      setIsBlinking(true);
      setTimeout(() => {
        setIsBlinking(false);
        const nextDelay = 3000 + Math.random() * 4000;
        timeoutId = setTimeout(triggerBlink, nextDelay);
      }, 180);
    };

    timeoutId = setTimeout(triggerBlink, 2500);
    return () => clearTimeout(timeoutId);
  }, []);

  // Mouse look-at tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Relative offset towards screen center
      const centerX = window.innerWidth / 2;
      const centerY = 30;
      const dx = (e.clientX - centerX) / (window.innerWidth / 2);
      const dy = (e.clientY - centerY) / 400;
      // Clamp between -3 and +3 pixels
      setMouseOffset({
        x: Math.max(-3, Math.min(3, dx * 3)),
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

  const eyeScale = size === 'large' ? 1.4 : size === 'medium' ? 1.1 : 0.85;

  return (
    <div
      onClick={handleClick}
      className="flex items-center justify-center gap-1.5 cursor-pointer px-1 py-0.5 rounded-full hover:opacity-90 transition-opacity"
      title="Aether Companion Eyes"
      style={{ transform: `scale(${eyeScale})` }}
    >
      {/* Left Eye */}
      <motion.div
        animate={
          currentMood === 'groove'
            ? { y: [0, -1.5, 0] }
            : currentMood === 'stress'
            ? { x: [-1, 1, -1] }
            : {}
        }
        transition={
          currentMood === 'groove'
            ? { repeat: Infinity, duration: 0.8, ease: 'easeInOut' }
            : currentMood === 'stress'
            ? { repeat: Infinity, duration: 0.15 }
            : undefined
        }
      >
        <svg width="18" height="18" viewBox="0 0 20 20" className="overflow-visible">
          {/* Eyes rendering based on mood */}
          {currentMood === 'groove' ? (
            // Happy crescent eye ^
            <path
              d="M 4 12 Q 10 4 16 12"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          ) : currentMood === 'sleepy' ? (
            // Sleepy slit eye -
            <line
              x1="4"
              y1="10"
              x2="16"
              y2="10"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          ) : (
            // Normal / Stress / Look-at capsule eye
            <g>
              <rect
                x="4"
                y={isBlinking ? "9" : "3"}
                width="12"
                height={isBlinking ? "2" : "14"}
                rx={isBlinking ? "1" : "6"}
                fill="#FFFFFF"
                className="transition-all duration-100 ease-out"
              />
              {!isBlinking && (
                <circle
                  cx={10 + mouseOffset.x}
                  cy={10 + mouseOffset.y}
                  r={currentMood === 'stress' ? 2 : 3}
                  fill="#111827"
                  className="transition-all duration-75"
                />
              )}
            </g>
          )}
        </svg>
      </motion.div>

      {/* Right Eye */}
      <motion.div
        animate={
          currentMood === 'groove'
            ? { y: [0, -1.5, 0] }
            : currentMood === 'stress'
            ? { x: [1, -1, 1] }
            : {}
        }
        transition={
          currentMood === 'groove'
            ? { repeat: Infinity, duration: 0.8, ease: 'easeInOut', delay: 0.1 }
            : currentMood === 'stress'
            ? { repeat: Infinity, duration: 0.15 }
            : undefined
        }
      >
        <svg width="18" height="18" viewBox="0 0 20 20" className="overflow-visible">
          {currentMood === 'wink' ? (
            // Winking right eye ;-)
            <path
              d="M 4 11 Q 10 16 16 11"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          ) : currentMood === 'groove' ? (
            // Happy crescent eye ^
            <path
              d="M 4 12 Q 10 4 16 12"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          ) : currentMood === 'sleepy' ? (
            // Sleepy slit eye -
            <line
              x1="4"
              y1="10"
              x2="16"
              y2="10"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          ) : (
            // Normal / Stress capsule eye
            <g>
              <rect
                x="4"
                y={isBlinking ? "9" : "3"}
                width="12"
                height={isBlinking ? "2" : "14"}
                rx={isBlinking ? "1" : "6"}
                fill="#FFFFFF"
                className="transition-all duration-100 ease-out"
              />
              {!isBlinking && (
                <circle
                  cx={10 + mouseOffset.x}
                  cy={10 + mouseOffset.y}
                  r={currentMood === 'stress' ? 2 : 3}
                  fill="#111827"
                  className="transition-all duration-75"
                />
              )}
            </g>
          )}
        </svg>
      </motion.div>
    </div>
  );
};
