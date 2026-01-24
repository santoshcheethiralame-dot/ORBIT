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
    const [stars, setStars] = useState([]);
    const [shootingStars, setShootingStars] = useState([]);

    useEffect(() => {
        const newStars = Array.from({ length: 150 }).map((_, i) => ({
            id: i,
            top: Math.random() * 100,
            left: Math.random() * 100,
            delay: Math.random() * 5,
            opacity: Math.random() * 0.5 + 0.2
        }));
        setStars(newStars);

        const spawnShootingStar = () => {
            const id = Date.now();
            setShootingStars(prev => [...prev, { id, top: Math.random() * 40, left: Math.random() * 40, delay: 0 }]);
            setTimeout(() => {
                setShootingStars(prev => prev.filter(s => s.id !== id));
            }, 2500);
        };

        const interval = setInterval(spawnShootingStar, 6000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 z-[-1] overflow-hidden bg-[#050508] pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,_#111122_0%,_#000000_100%)]" />
            
            <HangingAlienScholar />

            {stars.map((star) => (
                <div
                    key={star.id}
                    className="absolute bg-white rounded-full animate-twinkle"
                    style={{
                        top: `${star.top}%`,
                        left: `${star.left}%`,
                        width: star.id % 25 === 0 ? '2px' : '1px',
                        height: star.id % 25 === 0 ? '2px' : '1px',
                        opacity: star.opacity,
                        animationDelay: `${star.delay}s`,
                    }}
                />
            ))}

            {shootingStars.map((star) => (
                <div
                    key={star.id}
                    className="absolute h-[1px] w-[120px] animate-shooting-star"
                    style={{ top: `${star.top}%`, left: `${star.left}%` }}
                >
                    <div className="w-full h-full bg-gradient-to-r from-transparent via-white/20 to-white/60" />
                </div>
            ))}

            <style>{`
                @keyframes twinkle {
                    0%, 100% { opacity: 0.3; }
                    50% { opacity: 0.8; }
                }
                .animate-twinkle { animation: twinkle 4s ease-in-out infinite; }

                @keyframes shooting-star {
                    0% { transform: translate(0, 0) rotate(35deg); opacity: 0; }
                    10% { opacity: 1; }
                    100% { transform: translate(500px, 350px) rotate(35deg); opacity: 0; }
                }
                .animate-shooting-star { animation: shooting-star 1.8s linear forwards; }
            `}</style>
        </div>
    );
};