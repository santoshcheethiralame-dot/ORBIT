import React, { useEffect, useState } from 'react';

const C = {
  outline: '#1a1a2e',
  skin: '#84e0a3',
  skinHL: '#c7f2d3',
  eye: '#080810',
  white: '#ffffff',
  suit: '#1a1a2e',
  gear: '#475569',
  bookCover: '#6d4c41',
  bookDark: '#4e342e',
  bookHighlight: '#8d6e63',
  page: '#f5f5dc',
  pageShadow: '#eaddcf',
  chain: '#334155',
  ideaGold: '#fbbf24'
};

const AlienSVG = ({ scale = 1 }: { scale?: number }) => (
  <svg
    width={120 * scale}
    height={240 * scale}
    viewBox="0 0 40 80"
    style={{ overflow: 'visible' }}
    shapeRendering="crispEdges"
  >
    {/* Chain */}
    <g fill={C.chain}>
      <rect x="19" y="0" width="2" height="6" />
      <rect x="18" y="4" width="4" height="2" />
      <rect x="19" y="8" width="2" height="6" />
      <rect x="18" y="12" width="4" height="2" />
      <rect x="19" y="16" width="2" height="6" />
      <rect x="18" y="20" width="4" height="2" />
      <rect x="19" y="24" width="2" height="6" />
      <rect x="18" y="28" width="4" height="2" />
      <rect x="19" y="32" width="2" height="6" />
      <rect x="18" y="36" width="4" height="2" />
      <rect x="19" y="40" width="2" height="6" />
    </g>

    {/* Perch/Seat */}
    <g transform="translate(10, 46)">
      <rect x="0" y="22" width="20" height="2" fill={C.outline} />
      <rect x="1" y="21" width="18" height="2" fill={C.gear} />
    </g>

    {/* Alien Assembly */}
    <g transform="translate(4, 38)">
      {/* Idea Bubble */}
      <g className="animate-idea-bubble" transform="translate(10, -12)">
        <rect x="4" y="3" width="4" height="4" fill={C.ideaGold} />
        <rect x="5" y="2" width="2" height="6" fill={C.ideaGold} />
        <rect x="3" y="4" width="6" height="2" fill={C.ideaGold} />
        <rect x="1" y="1" width="1" height="1" fill={C.ideaGold} />
        <rect x="10" y="1" width="1" height="1" fill={C.ideaGold} />
        <rect x="0" y="5" width="1" height="1" fill={C.ideaGold} />
        <rect x="11" y="5" width="1" height="1" fill={C.ideaGold} />
        <rect x="5" y="0" width="2" height="1" fill={C.ideaGold} />
      </g>

      {/* Body */}
      <rect x="10" y="20" width="12" height="10" fill={C.outline} />
      <rect x="11" y="21" width="10" height="8" fill={C.suit} />
      
      {/* Head & Face */}
      <g className="animate-alien-interaction">
        <rect x="8" y="7" width="16" height="14" fill={C.outline} />
        <rect x="9" y="8" width="14" height="12" fill={C.skin} />
        <rect x="11" y="9" width="3" height="1" fill={C.skinHL} />
        
        <g className="animate-eye-focus">
          <rect x="10" y="13" width="5" height="5" fill={C.eye} />
          <rect x="17" y="13" width="5" height="5" fill={C.eye} />
          <rect x="13" y="14" width="1" height="1" fill={C.white} />
          <rect x="20" y="14" width="1" height="1" fill={C.white} />
        </g>

        {/* Antennas */}
        <rect x="11" y="4" width="2" height="4" fill={C.outline} />
        <rect x="11" y="4" width="2" height="2" fill={C.skin} className="animate-bounce" />
        <rect x="19" y="4" width="2" height="4" fill={C.outline} />
        <rect x="19" y="4" width="2" height="2" fill={C.skin} className="animate-bounce" style={{ animationDelay: '0.2s' }} />
      </g>

      {/* Book */}
      <g transform="translate(6, 20)">
        <rect x="-1" y="1" width="22" height="16" fill={C.outline} />
        <rect x="1" y="0" width="18" height="2" fill={C.page} />
        <rect x="2" y="1" width="16" height="1" fill={C.pageShadow} />
        <rect x="0" y="2" width="20" height="14" fill={C.bookCover} />
        <rect x="9" y="2" width="2" height="14" fill={C.bookDark} />
        
        <g fill={C.bookHighlight}>
          <rect x="9" y="4" width="2" height="1" />
          <rect x="9" y="8" width="2" height="1" />
          <rect x="9" y="12" width="2" height="1" />
        </g>

        <g fill={C.bookDark} opacity="0.4">
          <rect x="1" y="3" width="7" height="1" />
          <rect x="1" y="14" width="7" height="1" />
          <rect x="1" y="4" width="1" height="10" />
          <rect x="7" y="4" width="1" height="10" />
          <rect x="12" y="3" width="7" height="1" />
          <rect x="12" y="14" width="7" height="1" />
          <rect x="12" y="4" width="1" height="10" />
          <rect x="18" y="4" width="1" height="10" />
        </g>

        <g fill={C.bookHighlight}>
          <rect x="0" y="2" width="1" height="1" />
          <rect x="1" y="2" width="1" height="1" opacity="0.5"/>
          <rect x="19" y="2" width="1" height="1" />
          <rect x="18" y="2" width="1" height="1" opacity="0.5"/>
          <rect x="0" y="15" width="1" height="1" />
          <rect x="1" y="15" width="1" height="1" opacity="0.5"/>
          <rect x="19" y="15" width="1" height="1" />
          <rect x="18" y="15" width="1" height="1" opacity="0.5"/>
        </g>
        
        <g fill={C.bookDark} opacity="0.3">
          <rect x="3" y="6" width="1" height="1" />
          <rect x="5" y="8" width="1" height="1" />
          <rect x="2" y="11" width="1" height="1" />
          <rect x="6" y="12" width="1" height="1" />
          <rect x="15" y="5" width="1" height="1" />
          <rect x="13" y="7" width="1" height="1" />
          <rect x="16" y="10" width="1" height="1" />
          <rect x="14" y="13" width="1" height="1" />
        </g>

        {/* Hands */}
        <rect x="-1" y="6" width="3" height="4" fill={C.skin} />
        <rect x="18" y="6" width="3" height="4" fill={C.skin} />
      </g>

      {/* Feet */}
      <rect x="7" y="28" width="4" height="3" fill={C.gear} />
      <rect x="21" y="28" width="4" height="3" fill={C.gear} />
    </g>
  </svg>
);

const HangingAlienScholar = () => (
  <>
    {/* Desktop Version - Only on extra large screens (90%+ width) */}
    <div className="hidden 2xl:block absolute top-0 left-[24px] z-20 origin-top animate-hanging-sway">
      <AlienSVG scale={1} />
    </div>

    {/* Mobile Version - Only when navbar is mobile (below md breakpoint) */}
    <div 
      className="md:hidden fixed z-[60] animate-hanging-sway" 
      style={{ 
        right: '16px', 
        top: '-5px',
        transformOrigin: 'top right'
      }}
    >
      <AlienSVG scale={0.40} />
    </div>

    <style>{`
      @keyframes hanging-sway {
        0%, 100% { transform: rotate(-1.5deg); }
        50% { transform: rotate(1.5deg); }
      }
      .animate-hanging-sway {
        animation: hanging-sway 6s ease-in-out infinite;
      }

      @keyframes alien-interaction {
        0%, 30%, 100% { transform: translateY(0) rotate(2deg); } 
        35%, 55% { transform: translateY(-2px) rotate(-2deg); } 
        60%, 90% { transform: translateY(-1px) rotate(0deg); }   
      }
      .animate-alien-interaction {
        animation: alien-interaction 12s steps(1) infinite;
        transform-origin: center 25px;
      }

      @keyframes eye-focus {
        0%, 30%, 100% { transform: translateY(1px); }  
        35%, 55% { transform: translateY(-2px); }       
        60%, 90% { transform: translateY(-1px); }       
      }
      .animate-eye-focus {
        animation: eye-focus 12s steps(1) infinite;
      }

      @keyframes idea-bubble-appear {
        0%, 34% { opacity: 0; transform: translateY(2px); }
        35%, 55% { opacity: 1; transform: translateY(0px); } 
        56%, 100% { opacity: 0; transform: translateY(2px); }
      }
      .animate-idea-bubble {
        animation: idea-bubble-appear 12s steps(1) infinite;
      }
    `}</style>
  </>
);

export const SpaceBackground = () => {
    const [stars, setStars] = useState<any[]>([]);
    const [shootingStars, setShootingStars] = useState<any[]>([]);
    const [nebulaClouds, setNebulaClouds] = useState<any[]>([]);

    useEffect(() => {
        // Enhanced star field with depth layers
        const newStars = Array.from({ length: 200 }).map((_, i) => ({
            id: i,
            top: Math.random() * 100,
            left: Math.random() * 100,
            delay: Math.random() * 5,
            opacity: Math.random() * 0.7 + 0.3,
            size: i % 30 === 0 ? 2.5 : i % 15 === 0 ? 2 : i % 8 === 0 ? 1.5 : 1,
            layer: i % 3 // depth layers for parallax
        }));
        setStars(newStars);

        // Nebula clouds for depth
        const clouds = Array.from({ length: 5 }).map((_, i) => ({
            id: i,
            top: Math.random() * 100,
            left: Math.random() * 100,
            size: 300 + Math.random() * 400,
            opacity: 0.03 + Math.random() * 0.05,
            color: i % 3 === 0 ? '#6366f1' : i % 3 === 1 ? '#8b5cf6' : '#06b6d4',
            delay: i * 2
        }));
        setNebulaClouds(clouds);

        // Enhanced shooting stars
        const spawnShootingStar = () => {
            const id = Date.now();
            const angle = Math.random() * 60 - 30; // -30 to 30 degrees
            setShootingStars(prev => [...prev, { 
                id, 
                top: Math.random() * 50, 
                left: Math.random() * 50, 
                angle,
                length: 80 + Math.random() * 60
            }]);
            setTimeout(() => {
                setShootingStars(prev => prev.filter(s => s.id !== id));
            }, 2800);
        };

        const interval = setInterval(spawnShootingStar, 5000);
        spawnShootingStar(); // Initial shooting star
        
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 z-[-1] overflow-hidden bg-[#030307] pointer-events-none">
            {/* Multi-layer gradient foundation */}
            <div className="absolute inset-0">
                {/* Base gradient */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#0a0a1a_0%,_#030307_50%,_#000000_100%)]" />
                
                {/* Secondary gradient for depth */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,_rgba(99,102,241,0.08)_0%,_transparent_50%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_60%,_rgba(139,92,246,0.06)_0%,_transparent_50%)]" />
                
                {/* Subtle vignette */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(0,0,0,0.4)_100%)]" />
            </div>

            {/* Animated nebula clouds */}
            {nebulaClouds.map((cloud) => (
                <div
                    key={cloud.id}
                    className="absolute rounded-full blur-[100px] animate-nebula-drift"
                    style={{
                        top: `${cloud.top}%`,
                        left: `${cloud.left}%`,
                        width: `${cloud.size}px`,
                        height: `${cloud.size}px`,
                        background: `radial-gradient(circle, ${cloud.color} 0%, transparent 70%)`,
                        opacity: cloud.opacity,
                        animationDelay: `${cloud.delay}s`,
                        animationDuration: `${30 + Math.random() * 20}s`
                    }}
                />
            ))}

            {/* Grid overlay for depth */}
            <div 
                className="absolute inset-0 opacity-[0.015]"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(99,102,241,0.3) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(99,102,241,0.3) 1px, transparent 1px)
                    `,
                    backgroundSize: '80px 80px',
                    maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 80%)',
                    WebkitMaskImage: 'radial-gradient(ellipse at center, black 0%, transparent 80%)'
                }}
            />
            
            <HangingAlienScholar />

            {/* Enhanced star field with layers */}
            {stars.map((star) => (
                <div
                    key={star.id}
                    className="absolute rounded-full animate-twinkle"
                    style={{
                        top: `${star.top}%`,
                        left: `${star.left}%`,
                        width: `${star.size}px`,
                        height: `${star.size}px`,
                        background: star.size > 2 
                            ? `radial-gradient(circle, rgba(255,255,255,${star.opacity}) 0%, rgba(200,220,255,${star.opacity * 0.6}) 100%)`
                            : 'white',
                        opacity: star.opacity,
                        animationDelay: `${star.delay}s`,
                        animationDuration: `${3 + star.layer}s`,
                        boxShadow: star.size > 2 
                            ? `0 0 ${star.size * 2}px rgba(255,255,255,${star.opacity * 0.5})`
                            : 'none',
                        filter: star.layer === 2 ? 'blur(0.3px)' : 'none'
                    }}
                />
            ))}

            {/* Enhanced shooting stars */}
            {shootingStars.map((star) => (
                <div
                    key={star.id}
                    className="absolute animate-shooting-star"
                    style={{ 
                        top: `${star.top}%`, 
                        left: `${star.left}%`,
                        width: `${star.length}px`,
                        height: '2px',
                        transform: `rotate(${star.angle}deg)`
                    }}
                >
                    <div 
                        className="w-full h-full"
                        style={{
                            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 20%, rgba(255,255,255,0.8) 80%, rgba(200,220,255,1) 100%)',
                            boxShadow: '0 0 6px rgba(255,255,255,0.8), 0 0 12px rgba(200,220,255,0.4)'
                        }}
                    />
                </div>
            ))}

            {/* Subtle particle field */}
            <div className="absolute inset-0 opacity-20">
                {Array.from({ length: 30 }).map((_, i) => (
                    <div
                        key={i}
                        className="absolute w-px h-px bg-indigo-400 rounded-full animate-float-particle"
                        style={{
                            top: `${Math.random() * 100}%`,
                            left: `${Math.random() * 100}%`,
                            animationDelay: `${Math.random() * 10}s`,
                            animationDuration: `${20 + Math.random() * 20}s`
                        }}
                    />
                ))}
            </div>

            <style>{`
                @keyframes twinkle {
                    0%, 100% { opacity: 0.3; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.2); }
                }
                .animate-twinkle { 
                    animation: twinkle 4s ease-in-out infinite; 
                }

                @keyframes shooting-star {
                    0% { 
                        transform: translate(0, 0) rotate(var(--angle, 35deg)); 
                        opacity: 0; 
                    }
                    10% { opacity: 1; }
                    90% { opacity: 0.8; }
                    100% { 
                        transform: translate(600px, 400px) rotate(var(--angle, 35deg)); 
                        opacity: 0; 
                    }
                }
                .animate-shooting-star { 
                    animation: shooting-star 2.2s cubic-bezier(0.4, 0, 0.2, 1) forwards; 
                }

                @keyframes nebula-drift {
                    0%, 100% { 
                        transform: translate(0, 0) scale(1); 
                        opacity: 0.03;
                    }
                    50% { 
                        transform: translate(40px, -30px) scale(1.1); 
                        opacity: 0.05;
                    }
                }
                .animate-nebula-drift {
                    animation: nebula-drift ease-in-out infinite;
                }

                @keyframes float-particle {
                    0% { 
                        transform: translate(0, 0); 
                        opacity: 0;
                    }
                    10% { opacity: 0.6; }
                    90% { opacity: 0.6; }
                    100% { 
                        transform: translate(
                            calc(var(--tx, 100px) * 1), 
                            calc(var(--ty, -100px) * 1)
                        ); 
                        opacity: 0;
                    }
                }
                .animate-float-particle {
                    animation: float-particle linear infinite;
                    --tx: ${Math.random() * 200 - 100}px;
                    --ty: ${Math.random() * 200 - 100}px;
                }
            `}</style>
        </div>
    );
};