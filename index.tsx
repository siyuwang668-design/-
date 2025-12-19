import React, { useState, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sparkles, Float, Text, useCursor, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';
import FluorescentParticles from './FluorescentParticles';

// --- Constants & Styles ---
const COLORS = {
  bg: '#1a103c',
  cap: '#ffb7d5', // Brighter pink
  capSpots: '#ffffff',
  stem: '#fffdd0',
  jelly: '#fff0f5', // Pale pinkish white for the jelly film
  // Maximum brightness colors (Neon Pastels)
  hearts: [
    '#ffffff', // Pure white (sparkle)
    '#ffeaf5', // Very pale pink
    '#ff6ec7', // Hot pink (neon)
    '#fff0a3', // Bright yellow
    '#adffff', // Cyan glow
    '#e0baff', // Lavender glow
  ],
};

// --- Geometry Helpers ---

// Generate a nice 3D heart shape
const createHeartGeometry = () => {
  const x = 0, y = 0;
  const heartShape = new THREE.Shape();
  heartShape.moveTo(x + 0.25, y + 0.25);
  heartShape.bezierCurveTo(x + 0.25, y + 0.25, x + 0.20, y, x, y);
  heartShape.bezierCurveTo(x - 0.30, y, x - 0.30, y + 0.35, x - 0.30, y + 0.35);
  heartShape.bezierCurveTo(x - 0.30, y + 0.55, x - 0.10, y + 0.77, x + 0.25, y + 0.95);
  heartShape.bezierCurveTo(x + 0.60, y + 0.77, x + 0.80, y + 0.55, x + 0.80, y + 0.35);
  heartShape.bezierCurveTo(x + 0.80, y + 0.35, x + 0.80, y, x + 0.50, y);
  heartShape.bezierCurveTo(x + 0.35, y, x + 0.25, y + 0.25, x + 0.25, y + 0.25);

  const extrudeSettings = {
    depth: 0.1,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 2,
    bevelSize: 0.05,
    bevelThickness: 0.05,
  };

  const geometry = new THREE.ExtrudeGeometry(heartShape, extrudeSettings);
  geometry.center(); // Center the geometry
  return geometry;
};

// --- Components ---

/**
 * The Solid Mushroom Mesh
 * Appears when "hand is closed" (isExploded = false)
 */
const Mushroom = ({ isExploded }: { isExploded: boolean }) => {
  const groupRef = useRef<THREE.Group>(null);
  const jellyRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  
  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;

    if (groupRef.current) {
      // Smooth scale transition
      const targetScale = isExploded ? 0 : 1;
      const step = delta * 8; // Speed of transition
      
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), step);
      
      // Rotate slightly for life
      if (!isExploded) {
        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, Math.sin(time * 0.5) * 0.1, step * 0.1);
      }
    }

    // "QQ" Bouncy Animation for the Jelly Layer
    if (jellyRef.current && !isExploded) {
       const bounceFreq = 4; // Speed of the wobble
       const bounceAmp = 0.03; // Intensity of the wobble
       
       const scaleBase = 1.08; // Base scale
       const wobble = Math.sin(time * bounceFreq) * bounceAmp;

       jellyRef.current.scale.set(
         scaleBase + wobble,       
         scaleBase - wobble,       
         scaleBase + wobble        
       );
    }
  });

  return (
    <group ref={groupRef}>
      {/* Stem */}
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[0.3, 0.5, 2, 16]} />
        <meshStandardMaterial color={COLORS.stem} roughness={0.3} />
      </mesh>
      
      {/* Cap Group */}
      <group position={[0, 2, 0]}>
        <mesh>
            <sphereGeometry args={[1.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial 
            ref={matRef}
            color={COLORS.cap} 
            roughness={0.3} 
            metalness={0.1}
            />
        </mesh>
        <mesh ref={jellyRef}>
            <sphereGeometry args={[1.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshPhysicalMaterial 
                color={COLORS.jelly}
                roughness={0.05}        
                metalness={0.1}
                transmission={0.6}      
                thickness={2}           
                ior={1.4}               
                clearcoat={1}           
                clearcoatRoughness={0}
                transparent={true}
                opacity={0.5}           
                side={THREE.DoubleSide}
            />
        </mesh>
        <FluorescentParticles count={100} />
        <group>
          {[[-0.5, 0.8, 0.5], [0.8, 0.5, -0.4], [-0.8, 0.4, -0.6], [0.2, 1.1, 0.2], [0, 0.6, 1.0]].map((pos, i) => (
             <mesh key={i} position={new THREE.Vector3(...pos)} scale={0.2}>
               <sphereGeometry args={[1, 16, 16]} />
               <meshStandardMaterial 
                 color={COLORS.capSpots} 
                 roughness={0.2}
               />
             </mesh>
          ))}
        </group>
      </group>
    </group>
  );
};

/**
 * The Heart Particles System
 * Explodes when isExploded = true
 * 
 * Target Distribution (Optimized for 1900 particles):
 * Total: 1900
 * Front: 220 (approx 11.6%)
 * Surround: 800 (approx 42.1%)
 * Scatter: 880 (approx 46.3% - increased by 500 for depth)
 */
const HeartParticles = ({ isExploded }: { isExploded: boolean }) => {
  const count = 1900; 
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const heartGeo = useMemo(() => createHeartGeometry(), []);
  
  const data = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const isCap = Math.random() > 0.3;
      let home = new THREE.Vector3();
      
      if (isCap) {
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const r = 1.2 * Math.cbrt(Math.random()); 
        home.set(
          r * Math.sin(phi) * Math.cos(theta),
          2 + Math.abs(r * Math.cos(phi)), 
          r * Math.sin(phi) * Math.sin(theta)
        );
      } else {
        const theta = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.4;
        const h = Math.random() * 2;
        home.set(r * Math.cos(theta), h, r * Math.sin(theta));
      }

      let type: 'front' | 'surround' | 'scatter';
      let offset = new THREE.Vector3(); 
      let fixedTarget = new THREE.Vector3(); 

      const rand = Math.random();

      // Cumulative probabilities for 1900 particles:
      // Front: 220/1900 ~ 0.116
      // Surround: 800/1900 ~ 0.421 -> cumulative 0.537
      // Scatter: 880/1900 ~ 0.463 -> cumulative 1.0
      if (rand < 0.116) {
          type = 'front';
          const dist = 1.5 + Math.random() * 4.5;
          const spread = 0.5 + (dist * 0.2); 
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * spread;
          offset.set(Math.cos(angle) * radius, Math.sin(angle) * radius, -dist);
      } else if (rand < 0.537) {
          type = 'surround';
          const r = 2.0 + Math.random() * 5.0; 
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          offset.setFromSphericalCoords(r, phi, theta);
      } else {
          type = 'scatter';
          const explodeDir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
          // Extended range for deeper spatial depth
          const dist = 6 + Math.random() * 16; 
          fixedTarget = explodeDir.multiplyScalar(dist).add(new THREE.Vector3(0, 2, 0));
      }

      const color = new THREE.Color(COLORS.hearts[Math.floor(Math.random() * COLORS.hearts.length)]);
      const rotSpeed = (Math.random() - 0.5) * 2;
      const scale = 0.04 + Math.random() * 0.14; 
      const phase = Math.random() * Math.PI * 2;

      temp.push({ 
          home, 
          type,
          offset, 
          fixedTarget, 
          color, 
          rotSpeed, 
          scale, 
          currentPos: home.clone(), 
          phase 
      });
    }
    return temp;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);
  const tempVec = useMemo(() => new THREE.Vector3(), []);
  const camLocalPos = useMemo(() => new THREE.Vector3(), []);
  const tempWorldTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const speed = isExploded ? 3 : 6;
    const time = state.clock.getElapsedTime();
    meshRef.current.updateMatrixWorld();
    camLocalPos.copy(state.camera.position);
    meshRef.current.worldToLocal(camLocalPos);

    data.forEach((d, i) => {
      let target = tempVec;
      if (isExploded) {
          if (d.type === 'front') {
              tempWorldTarget.copy(d.offset);
              tempWorldTarget.applyQuaternion(state.camera.quaternion);
              tempWorldTarget.add(state.camera.position);
              meshRef.current!.worldToLocal(tempWorldTarget);
              target.copy(tempWorldTarget);
          } else if (d.type === 'surround') {
              target.copy(camLocalPos).add(d.offset);
          } else {
              target.copy(d.fixedTarget);
          }
          target.y += Math.sin(time + i * 0.1) * 0.2;
          target.x += Math.cos(time * 0.5 + i * 0.1) * 0.1;
      } else {
          target.copy(d.home);
      }

      d.currentPos.lerp(target, delta * speed * (0.8 + Math.random() * 0.4));
      dummy.position.copy(d.currentPos);
      dummy.rotation.set(time * d.rotSpeed, time * d.rotSpeed * 0.5, 0);
      let s = d.scale;
      if (!isExploded) {
        const dist = d.currentPos.distanceTo(d.home);
        if (dist < 0.2) s = d.scale * (dist * 5); 
      }
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      const twinkle = Math.sin(time * 5 + d.phase); 
      const intensity = 1.5 + (twinkle > 0.5 ? twinkle * 2 : 0);
      tempColor.copy(d.color).multiplyScalar(intensity);
      meshRef.current!.setColorAt(i, tempColor);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[heartGeo, undefined, count]}>
      <meshStandardMaterial 
        toneMapped={false} 
        emissiveIntensity={1} 
        roughness={0.1}
        metalness={0.5}
        transparent
        opacity={1}
      />
    </instancedMesh>
  );
};

const Rig = ({ children, handPos, cameraEnabled }: { children?: React.ReactNode, handPos: React.MutableRefObject<{x: number, y: number}>, cameraEnabled: boolean }) => {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    let targetX = 0;
    let targetY = 0;
    if (cameraEnabled) {
      targetX = handPos.current.x * 3.0; 
      targetY = handPos.current.y * 3.0;
    } else {
      targetX = state.pointer.x;
      targetY = state.pointer.y;
    }
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetX / 2, 0.1);
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, -targetY / 2, 0.1);
  });
  return <group ref={group}>{children}</group>;
};

const MagicalScene = ({ isHandOpen, setHandOpen, cameraEnabled, handPos }: { isHandOpen: boolean, setHandOpen: (v: boolean) => void, cameraEnabled: boolean, handPos: React.MutableRefObject<{x: number, y: number}> }) => {
  useCursor(!cameraEnabled, 'pointer', 'auto');
  const handlers = !cameraEnabled ? {
      onPointerDown: () => setHandOpen(false),
      onPointerUp: () => setHandOpen(true)
  } : {};
  const sparklesScale = isHandOpen ? 12 : 2;
  const sparklesCount = isHandOpen ? 200 : 50;
  const sparklesSpeed = isHandOpen ? 0.8 : 0.2;
  return (
    <>
      <OrbitControls enablePan={false} enableZoom={true} minDistance={3} maxDistance={10} maxPolarAngle={Math.PI / 1.8} />
      <ambientLight intensity={0.6} color="#c0a0ff" />
      <pointLight position={[10, 10, 10]} intensity={2} color="#ffddff" />
      <pointLight position={[-10, -5, -5]} intensity={1} color="#55aaff" />
      <pointLight position={[0, 2, -5]} intensity={2} color="#ff0080" distance={10} />
      <Environment preset="night" />
      <Sparkles count={100} scale={15} size={3} speed={0.4} opacity={0.5} color="#fff" />
      <Rig handPos={handPos} cameraEnabled={cameraEnabled}>
          <group position={[0, -1, 0]} {...handlers}>
            <Mushroom isExploded={isHandOpen} />
            <HeartParticles isExploded={isHandOpen} />
            <Sparkles 
                count={sparklesCount} 
                scale={sparklesScale} 
                size={isHandOpen ? 6 : 2} 
                speed={sparklesSpeed} 
                opacity={isHandOpen ? 1 : 0} 
                color={isHandOpen ? "#ffffaa" : "#ffb7d5"} 
                position={[0, 2, 0]}
            />
            <mesh visible={false}>
                <sphereGeometry args={[2.5, 16, 16]} />
                <meshBasicMaterial transparent opacity={0} />
            </mesh>
          </group>
      </Rig>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.05, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color={COLORS.bg} roughness={0.1} metalness={0.8} transparent opacity={0.6} />
      </mesh>
    </>
  );
};

const GestureController = ({ onGesture, onHandMove, isCameraEnabled, setCameraEnabled }: { onGesture: (isOpen: boolean) => void, onHandMove: (pos: {x: number, y: number}) => void, isCameraEnabled: boolean, setCameraEnabled: (v: boolean) => void }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [gestureName, setGestureName] = useState<string>("None");
    const recognizerRef = useRef<GestureRecognizer | null>(null);
    const requestRef = useRef<number>();

    useEffect(() => {
        if (!isCameraEnabled) return;
        const init = async () => {
            setIsLoading(true);
            try {
                const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm");
                recognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numHands: 1
                });
                startCamera();
            } catch (error) {
                console.error("Failed to load gesture recognizer:", error);
                setIsLoading(false);
                setCameraEnabled(false);
            }
        };
        init();
        return () => {
             if (videoRef.current && videoRef.current.srcObject) {
                 const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
                 tracks.forEach(track => track.stop());
             }
             if (requestRef.current) cancelAnimationFrame(requestRef.current);
             if (recognizerRef.current) {
                 recognizerRef.current.close();
                 recognizerRef.current = null;
             }
        };
    }, [isCameraEnabled]);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadeddata = () => {
                    if (recognizerRef.current) predictWebcam();
                };
            }
        } catch (err) {
            console.error("Error accessing webcam:", err);
            setCameraEnabled(false);
        } finally {
            setIsLoading(false);
        }
    };

    const predictWebcam = () => {
        if (!recognizerRef.current || !videoRef.current) return;
        let nowInMs = Date.now();
        if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0 || videoRef.current.paused) {
             requestRef.current = requestAnimationFrame(predictWebcam);
             return;
        }
        try {
            const results = recognizerRef.current.recognizeForVideo(videoRef.current, nowInMs);
            if (results.gestures.length > 0) {
                const categoryName = results.gestures[0][0].categoryName;
                const score = results.gestures[0][0].score;
                if (score > 0.5) {
                    setGestureName(categoryName);
                    if (categoryName === "Closed_Fist") onGesture(false);
                    else if (categoryName === "Open_Palm") onGesture(true);
                }
            } else {
                setGestureName("None");
            }
            if (results.landmarks && results.landmarks.length > 0) {
                const hand = results.landmarks[0];
                const centerPoint = hand[9];
                if (centerPoint) {
                    const x = (centerPoint.x - 0.5) * 2;
                    const y = (centerPoint.y - 0.5) * 2;
                    onHandMove({ x, y });
                }
            }
        } catch (e) {
            console.warn("Prediction error:", e);
        }
        requestRef.current = requestAnimationFrame(predictWebcam);
    };

    if (!isCameraEnabled) return null;

    return (
        <div style={{ position: 'absolute', bottom: '20px', right: '20px', width: '160px', height: '120px', borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(255, 255, 255, 0.5)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 20, background: '#000' }}>
            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} autoPlay playsInline muted />
            {isLoading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', color: 'white', fontSize: '0.8rem' }}>Loading AI...</div>}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '0.7rem', padding: '4px', textAlign: 'center' }}>Detected: {gestureName}</div>
        </div>
    );
};

const App = () => {
  const [isHandOpen, setHandOpen] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const handPos = useRef({ x: 0, y: 0 });
  const handleHandMove = (pos: {x: number, y: number}) => { handPos.current = pos; };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: COLORS.bg, overflow: 'hidden' }}>
      <Canvas shadows camera={{ position: [0, 2, 7], fov: 45 }} dpr={[1, 2]}>
        <MagicalScene isHandOpen={isHandOpen} setHandOpen={setHandOpen} cameraEnabled={cameraEnabled} handPos={handPos} />
      </Canvas>
      <GestureController isCameraEnabled={cameraEnabled} setCameraEnabled={setCameraEnabled} onGesture={setHandOpen} onHandMove={handleHandMove} />
      <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', pointerEvents: 'none', zIndex: 10, fontFamily: "'Fredoka', 'Varela Round', sans-serif", color: 'white', userSelect: 'none' }}>
        <div style={{ fontSize: '1.2rem', textShadow: '0 2px 4px rgba(0,0,0,0.5)', textAlign: 'center', opacity: 0.9 }}>
          {isHandOpen ? "✨ Magic Released ✨" : "✊ Magic Gathered ✊"}
        </div>
        <div style={{ display: 'flex', gap: '10px', pointerEvents: 'auto' }}>
            <button style={{ background: !cameraEnabled ? 'rgba(255, 105, 180, 0.3)' : 'rgba(255, 255, 255, 0.1)', border: !cameraEnabled ? '2px solid #ff69b4' : '1px solid rgba(255,255,255,0.3)', borderRadius: '20px', padding: '8px 16px', color: 'white', cursor: 'pointer', backdropFilter: 'blur(5px)', transition: 'all 0.3s' }} onClick={() => setCameraEnabled(false)}>👆 Touch Mode</button>
            <button style={{ background: cameraEnabled ? 'rgba(255, 105, 180, 0.3)' : 'rgba(255, 255, 255, 0.1)', border: cameraEnabled ? '2px solid #ff69b4' : '1px solid rgba(255,255,255,0.3)', borderRadius: '20px', padding: '8px 16px', color: 'white', cursor: 'pointer', backdropFilter: 'blur(5px)', transition: 'all 0.3s' }} onClick={() => setCameraEnabled(true)}>📷 Camera Mode</button>
        </div>
        {!cameraEnabled ? (
            <div style={{ fontSize: '0.8rem', opacity: 0.6, maxWidth: '300px', textAlign: 'center' }}><strong>Hold Mouse</strong> = Close Hand | <strong>Release Mouse</strong> = Open Hand<br/>Move cursor to look around</div>
        ) : (
            <div style={{ fontSize: '0.8rem', opacity: 0.6, maxWidth: '300px', textAlign: 'center' }}>Show your hand to the camera!<br/><strong>Closed Fist</strong> = Gather | <strong>Open Palm</strong> = Explode<br/>Move hand to look around</div>
        )}
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600&display=swap');`}</style>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);