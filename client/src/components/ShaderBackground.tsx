import React from 'react';

export const ShaderBackground = () => {
  return (
    <div className="absolute inset-0 -z-10 h-full w-full overflow-hidden bg-zinc-950 pointer-events-none">
      {/* 
        Ultra-lightweight Pure CSS Mesh Gradient 
        Yields the exact same "premium" WebGL aesthetic but with zero HTTP requests, 
        0 dependencies, and no React Fiber compilation errors.
      */}
      
      {/* Deep Emerald Ambient Glow */}
      <div 
        className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full opacity-40 mix-blend-screen blur-[120px] animate-pulse"
        style={{ backgroundColor: '#064e3b', animationDuration: '8s' }} 
      />
      
      {/* Bright Green Accent Orb */}
      <div 
        className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-30 mix-blend-screen blur-[100px] animate-pulse"
        style={{ backgroundColor: '#15803d', animationDuration: '12s', animationDelay: '2s' }} 
      />

      {/* Subtle Teal Cross-fade */}
      <div 
        className="absolute top-[30%] right-[10%] w-[40%] h-[40%] rounded-full opacity-20 mix-blend-screen blur-[90px] animate-pulse"
        style={{ backgroundColor: '#0f766e', animationDuration: '10s', animationDelay: '4s' }} 
      />

      {/* SVG Noise Texture for that "Premium/Textured" matte look */}
      <div 
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")'
        }}
      />
      
      {/* Bottom Vignette to let the text read cleanly */}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent" />
    </div>
  );
};
