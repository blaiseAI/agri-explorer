import React from 'react';
import { ShaderGradientCanvas, ShaderGradient } from '@shadergradient/react';

export const ShaderBackground = () => {
  return (
    <div className="absolute inset-0 -z-10 h-full w-full overflow-hidden opacity-40 mix-blend-screen pointer-events-none">
      <ShaderGradientCanvas
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        pointerEvents="none"
      >
        <ShaderGradient
          control="query"
          urlString="https://www.shadergradient.co/customize?animate=on&axesHelper=off&bgColor1=%23000000&bgColor2=%23000000&brightness=1.2&cAzimuthAngle=180&cDistance=3.6&cPolarAngle=90&cameraZoom=1&color1=%23022c22&color2=%2315803d&color3=%2310b981&envPreset=city&fov=45&gizmoHelper=hide&lightType=3d&pixelDensity=1.5&positionX=-1.4&positionY=0&positionZ=0&reflection=0.1&rotationX=0&rotationY=10&rotationZ=50&shader=fluid&type=sphere&uAmplitude=0&uDensity=1.3&uFrequency=5.5&uSpeed=0.15&uStrength=2.4&uTime=0&wireframe=false"
        />
      </ShaderGradientCanvas>
      {/* Fallback gradient / tint just in case WebGL fails to load instantly */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/95" />
    </div>
  );
};
