import React from 'react';

export const ShaderBackground = () => {
  return (
    <div className="absolute inset-0 -z-10 h-full w-full overflow-hidden bg-zinc-950 pointer-events-none">
      
      {/* Massive Emerald Ambient Glow */}
      <div 
        className="absolute top-[-30%] left-[-10%] w-[80%] h-[80%] rounded-full opacity-60 mix-blend-screen blur-3xl animate-pulse"
        style={{ backgroundColor: '#10b981', animationDuration: '8s' }} 
      />
      
      {/* Bright Green Accent Orb */}
      <div 
        className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full opacity-50 mix-blend-screen blur-3xl animate-pulse"
        style={{ backgroundColor: '#22c55e', animationDuration: '12s', animationDelay: '2s' }} 
      />

      {/* Subtle Teal Cross-fade */}
      <div 
        className="absolute top-[20%] right-[20%] w-[50%] h-[50%] rounded-full opacity-40 mix-blend-screen blur-3xl animate-pulse"
        style={{ backgroundColor: '#14b8a6', animationDuration: '10s', animationDelay: '4s' }} 
      />

      {/* SVG Noise Texture for that "Premium/Textured" matte look */}
      <div 
        className="absolute inset-0 opacity-[0.1]"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")'
        }}
      />
      
      {/* Bottom Vignette to let the text read cleanly */}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
    </div>
  );
};
