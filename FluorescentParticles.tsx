import React, { useRef, useMemo, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const FluorescentParticles = ({ count = 200 }: { count?: number }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const particles = useMemo(() => {
    const temp = [];
    const neonColors = ['#ccff00', '#00ffcc', '#ff00ff', '#ffffff', '#ffff00', '#ff3333'];
    
    for (let i = 0; i < count; i++) {
      // Place in the jelly shell layer
      // Radius of solid cap is 1.5
      // Radius of jelly is roughly 1.5 * 1.08 = 1.62
      // We want particles distributed in the "jelly" volume
      const r = 1.52 + Math.random() * 0.12; 
      
      // Spherical coordinates for top hemisphere distribution
      const u = Math.random();
      const v = Math.random();
      
      const theta = 2 * Math.PI * u; // Horizontal angle
      // phi is angle from Top (Y axis). 0 is Top, PI/2 is Equator.
      const phi = Math.acos(1 - Math.random()); // Uniform distribution on sphere cap?
      // Actually simple random for phi range 0 to PI/2 is good enough visually
      const phiClamped = Math.random() * (Math.PI / 2 - 0.1); 
      
      const x = r * Math.sin(phiClamped) * Math.cos(theta);
      const y = r * Math.cos(phiClamped);
      const z = r * Math.sin(phiClamped) * Math.sin(theta);

      const color = new THREE.Color(neonColors[Math.floor(Math.random() * neonColors.length)]);
      const scale = 0.5 + Math.random() * 1.0; // Random size factor
      const phase = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 0.5;

      temp.push({ position: new THREE.Vector3(x, y, z), color, scale, phase, speed, basePos: new THREE.Vector3(x,y,z) });
    }
    return temp;
  }, [count]);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    particles.forEach((p, i) => {
      dummy.position.copy(p.position);
      dummy.scale.set(p.scale, p.scale, p.scale);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      meshRef.current!.setColorAt(i, p.color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [particles, dummy]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.elapsedTime;
    
    particles.forEach((p, i) => {
      // Floating animation relative to base position
      // Add some bouncy motion to match jelly feel
      const bounceY = Math.sin(time * 3 + p.phase) * 0.03;
      const wobbleX = Math.cos(time * 2 + p.phase) * 0.01;
      
      dummy.position.copy(p.basePos);
      dummy.position.y += bounceY;
      dummy.position.x += wobbleX;
      
      // Pulse scale
      const pulse = 1 + Math.sin(time * 4 + p.phase) * 0.3;
      const s = p.scale * pulse;
      dummy.scale.set(s, s, s);
      
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      {/* Round particles: 0.05 radius sphere */}
      <sphereGeometry args={[0.05, 16, 16]} /> 
      <meshBasicMaterial toneMapped={false} transparent opacity={0.8} />
    </instancedMesh>
  );
};

export default FluorescentParticles;