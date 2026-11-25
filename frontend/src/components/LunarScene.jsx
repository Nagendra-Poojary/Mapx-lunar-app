import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Line, Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

const TERRAIN_SIZE = 22;
const HEIGHT_SCALE = 2.8;

function sampleGrid(grid, nx, ny) {
    if (!grid || !grid.length) return 0;
    const rows = grid.length;
    const cols = grid[0].length;
    const r = Math.min(rows - 1, Math.max(0, Math.floor(ny * (rows - 1))));
    const c = Math.min(cols - 1, Math.max(0, Math.floor(nx * (cols - 1))));
    return grid[r]?.[c] ?? 0;
}

function sampleTerrainY(nx, ny, heightmap) {
    if (!heightmap || !heightmap.length) return 0.8;
    return sampleGrid(heightmap, nx, ny) * HEIGHT_SCALE;
}

/* 1. PHOTOREALISTIC LUNAR TERRAIN (ACTUAL ORBITAL IMAGE TEXTURE + BUMP MAP) */
function PhotorealisticLunarTerrain({ heightmap, enhancedImageB64, wireframe }) {
    const [texture, setTexture] = useState(null);

    useEffect(() => {
        if (!enhancedImageB64) {
            setTexture(null);
            return;
        }
        const loader = new THREE.TextureLoader();
        loader.load(enhancedImageB64, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 8;
            setTexture(tex);
        });
    }, [enhancedImageB64]);

    const geometry = useMemo(() => {
        const segs = 140;
        const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, segs, segs);
        geo.rotateX(-Math.PI / 2);

        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            const nx = x / TERRAIN_SIZE + 0.5;
            const ny = z / TERRAIN_SIZE + 0.5;

            let h = 0;
            if (heightmap && heightmap.length) {
                // Real heightmap + subtle high-frequency lunar regolith micro-relief
                const micro = (Math.sin(x * 7.3) * Math.cos(z * 7.1) + Math.sin(x * 15.2 - z * 11.4) * 0.5) * 0.035;
                h = sampleGrid(heightmap, nx, ny) * HEIGHT_SCALE + micro;
            } else {
                // Procedural cratered terrain before upload
                const d1 = Math.hypot(x - 3, z + 2);
                const d2 = Math.hypot(x + 4, z - 3);
                const crater1 = d1 < 3.5 ? -Math.cos((d1 / 3.5) * Math.PI * 0.5) * 0.7 : 0;
                const crater2 = d2 < 2.8 ? -Math.cos((d2 / 2.8) * Math.PI * 0.5) * 0.55 : 0;
                h = 0.8 + Math.sin(x * 0.45) * Math.cos(z * 0.45) * 0.45 + crater1 + crater2;
            }
            pos.setY(i, h);
        }

        geo.computeVertexNormals();
        return geo;
    }, [heightmap]);

    return (
        <group>
            <mesh geometry={geometry} receiveShadow castShadow>
                <meshStandardMaterial
                    map={texture}
                    bumpMap={texture}
                    bumpScale={0.28}
                    color={texture ? '#e2e8f0' : '#64748b'}
                    roughness={0.96}
                    metalness={0.04}
                    wireframe={wireframe}
                />
            </mesh>
            {/* Subtle sci-fi coordinate grid under the terrain slab */}
            <gridHelper args={[TERRAIN_SIZE + 6, 28, '#1e3a5f', '#0c192c']} position={[0, -0.35, 0]} />
        </group>
    );
}

/* 2. TRANSLUCENT HOLOGRAPHIC HAZARD OVERLAY (LETS REAL ROCK TEXTURE SHINE THROUGH) */
function HolographicHazardOverlay({ heightmap, riskGrid, visible }) {
    const geometry = useMemo(() => {
        if (!visible || !riskGrid || !heightmap) return null;
        const rows = riskGrid.length;
        const cols = riskGrid[0].length;
        const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, cols - 1, rows - 1);
        geo.rotateX(-Math.PI / 2);

        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);

        for (let i = 0; i < pos.count; i++) {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const h = (heightmap[r]?.[c] || 0) * HEIGHT_SCALE + 0.045;
            pos.setY(i, h);

            const risk = riskGrid[r]?.[c] ?? 0;
            if (risk > 0.65) {
                colors[i * 3] = 0.95; colors[i * 3 + 1] = 0.15; colors[i * 3 + 2] = 0.18; // Red Unsafe
            } else if (risk >= 0.30) {
                colors[i * 3] = 0.95; colors[i * 3 + 1] = 0.65; colors[i * 3 + 2] = 0.15; // Amber Caution
            } else {
                colors[i * 3] = 0.12; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 0.45; // Emerald Safe
            }
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        return geo;
    }, [heightmap, riskGrid, visible]);

    if (!geometry || !visible) return null;

    return (
        <group>
            {/* Translucent tinted hologram */}
            <mesh geometry={geometry}>
                <meshBasicMaterial vertexColors transparent opacity={0.28} depthWrite={false} />
            </mesh>
            {/* Subtle glowing topographic wireframe */}
            <mesh geometry={geometry} position={[0, 0.015, 0]}>
                <meshBasicMaterial vertexColors wireframe transparent opacity={0.18} depthWrite={false} />
            </mesh>
        </group>
    );
}

/* 3. JAGGED 3D BOULDERS + FLOATING "HAZARD ZONE" & "H: X.Xm" CALLOUTS */
function DetectedBoulders3D({ boulders, imageSize, heightmap }) {
    const topBoulders = useMemo(() => {
        if (!boulders || !boulders.length || !imageSize || !heightmap) return [];
        const imgW = imageSize.width || 1024;
        const imgH = imageSize.height || 1024;

        return [...boulders]
            .sort((a, b) => b.height_m - a.height_m)
            .slice(0, 18)
            .map((b, idx) => {
                const nx = b.center_px[0] / imgW;
                const ny = b.center_px[1] / imgH;
                const x = (nx - 0.5) * TERRAIN_SIZE;
                const z = (ny - 0.5) * TERRAIN_SIZE;
                const y = sampleTerrainY(nx, ny, heightmap);

                const radius = Math.min(0.45, Math.max(0.14, b.diameter_m * 0.035));
                const rockH = Math.min(0.55, Math.max(0.16, b.height_m * 0.06));
                return {
                    id: b.id,
                    height_m: b.height_m,
                    confidence: Math.round((b.confidence || 0.92) * 100),
                    position: [x, y + rockH * 0.35, z],
                    scale: [radius, rockH, radius * (0.85 + (idx % 3) * 0.12)],
                    rotation: [idx * 0.4, idx * 1.1, idx * 0.25],
                    showLabel: idx < 4, // Keep top 4 labeled for a clean cinematic HUD
                };
            });
    }, [boulders, imageSize, heightmap]);

    return (
        <group>
            {topBoulders.map((b) => (
                <group key={b.id} position={b.position}>
                    {/* High-contrast dark lunar rock */}
                    <mesh scale={b.scale} rotation={b.rotation} castShadow receiveShadow>
                        <dodecahedronGeometry args={[1, 0]} />
                        <meshStandardMaterial color="#475569" roughness={0.95} metalness={0.05} flatShading />
                    </mesh>

                    {/* Red hazard perimeter ring on the ground */}
                    <mesh position={[0, -b.scale[1] * 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[b.scale[0] * 1.4, b.scale[0] * 1.58, 24]} />
                        <meshBasicMaterial color={[2.4, 0.25, 0.25]} side={THREE.DoubleSide} toneMapped={false} />
                    </mesh>

                    {/* Cinematic floating callout tag */}
                    {b.showLabel && (
                        <Html position={[0, b.scale[1] + 0.55, 0]} center>
                            <div className="px-2 py-0.5 rounded bg-rose-950/85 border border-rose-500/70 text-[9px] font-mono text-rose-200 whitespace-nowrap shadow-lg backdrop-blur-sm">
                                HAZARD • H: {b.height_m}m
                            </div>
                        </Html>
                    )}
                </group>
            ))}
        </group>
    );
}

/* 4. DETAILED LUNAR LANDER WITH GLOWING THRUSTER PLUME */
function LunarLander({ targetPos, animateDescent }) {
    const landerRef = useRef();
    const plumeRef = useRef();

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        if (landerRef.current) {
            const hoverY = animateDescent
                ? targetPos[1] + 2.3 + Math.sin(t * 1.1) * 0.75
                : targetPos[1] + 2.6 + Math.sin(t * 1.8) * 0.08;
            landerRef.current.position.set(targetPos[0], hoverY, targetPos[2]);
            landerRef.current.rotation.y = t * 0.12;
        }
        if (plumeRef.current) {
            const flicker = 0.92 + Math.sin(t * 32) * 0.1;
            plumeRef.current.scale.set(1, flicker, 1);
        }
    });

    return (
        <group ref={landerRef} position={[targetPos[0], targetPos[1] + 2.8, targetPos[2]]}>
            {/* Gold thermal-foil descent stage */}
            <mesh position={[0, 0.35, 0]} castShadow>
                <cylinderGeometry args={[0.62, 0.72, 0.5, 8]} />
                <meshStandardMaterial color="#d4af37" metalness={0.88} roughness={0.28} />
            </mesh>
            {/* Faceted silver ascent cabin */}
            <mesh position={[0, 0.92, 0]} castShadow>
                <dodecahedronGeometry args={[0.56, 0]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.35} flatShading />
            </mesh>
            {/* Engine bell */}
            <mesh position={[0, 0.02, 0]}>
                <cylinderGeometry args={[0.14, 0.24, 0.22, 16]} />
                <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
            </mesh>
            {/* 4 Landing legs + footpads */}
            {[0, 1, 2, 3].map((i) => {
                const angle = (i * Math.PI) / 2 + Math.PI / 4;
                return (
                    <group key={i}>
                        <mesh
                            position={[Math.cos(angle) * 0.72, -0.08, Math.sin(angle) * 0.72]}
                            rotation={[0, -angle, 0.48]}
                        >
                            <cylinderGeometry args={[0.035, 0.035, 1.05, 6]} />
                            <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.25} />
                        </mesh>
                        <mesh position={[Math.cos(angle) * 0.96, -0.52, Math.sin(angle) * 0.96]}>
                            <cylinderGeometry args={[0.14, 0.16, 0.04, 12]} />
                            <meshStandardMaterial color="#d4af37" metalness={0.85} roughness={0.3} />
                        </mesh>
                    </group>
                );
            })}
            {/* Glowing blue-amber descent thruster plume */}
            <group ref={plumeRef} position={[0, -0.85, 0]}>
                <mesh>
                    <coneGeometry args={[0.24, 1.5, 20, 1, true]} />
                    <meshBasicMaterial color={[1.2, 2.2, 3.2]} transparent opacity={0.65} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
                </mesh>
                <mesh position={[0, -0.15, 0]}>
                    <coneGeometry args={[0.14, 1.2, 16, 1, true]} />
                    <meshBasicMaterial color={[3.0, 1.8, 0.6]} transparent opacity={0.75} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
                </mesh>
            </group>
        </group>
    );
}

/* 5. MULTI-RING CONCENTRIC RADAR BULLSEYE (LIKE YOUR REFERENCE FRAME) */
function ConcentricRadarBullseye({ targetPos, radiusWorld, safeZone }) {
    const outerRef = useRef();
    useFrame(({ clock }) => {
        if (outerRef.current) {
            outerRef.current.rotation.z = clock.getElapsedTime() * 0.2;
        }
    });

    const r = Math.max(1.2, radiusWorld);

    return (
        <group position={[targetPos[0], targetPos[1] + 0.09, targetPos[2]]}>
            <group ref={outerRef} rotation={[-Math.PI / 2, 0, 0]}>
                {[0.25, 0.5, 0.75, 1.0].map((mult, idx) => (
                    <mesh key={idx}>
                        <ringGeometry args={[r * mult - 0.05, r * mult, 64]} />
                        <meshBasicMaterial
                            color={[0.2, 2.5, 0.95]}
                            transparent
                            opacity={idx === 3 ? 0.95 : 0.65}
                            side={THREE.DoubleSide}
                            toneMapped={false}
                        />
                    </mesh>
                ))}
                {/* Crosshair ticks */}
                <mesh>
                    <planeGeometry args={[r * 2.15, 0.03]} />
                    <meshBasicMaterial color={[0.2, 2.2, 0.9]} transparent opacity={0.5} side={THREE.DoubleSide} toneMapped={false} />
                </mesh>
                <mesh rotation={[0, 0, Math.PI / 2]}>
                    <planeGeometry args={[r * 2.15, 0.03]} />
                    <meshBasicMaterial color={[0.2, 2.2, 0.9]} transparent opacity={0.5} side={THREE.DoubleSide} toneMapped={false} />
                </mesh>
            </group>
            {safeZone && (
                <Html position={[0, 0.5, 0]} center>
                    <div className="px-2.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-400/70 text-[10px] font-mono text-emerald-300 whitespace-nowrap shadow-lg backdrop-blur-sm">
                        LZ-1 VERIFIED • R={safeZone.radius_m}m • {safeZone.slope_deg}°
                    </div>
                </Html>
            )}
        </group>
    );
}

/* 6. ANIMATED 6-WHEELED ROVER ALONG GLOWING A* PATH */
function AnimatedRover({ points }) {
    const roverRef = useRef();
    const progressRef = useRef(0);

    useFrame((_, delta) => {
        if (!roverRef.current || points.length < 2) return;
        progressRef.current = (progressRef.current + delta * 0.08) % 1;
        const totalSegments = points.length - 1;
        const scaled = progressRef.current * totalSegments;
        const idx = Math.min(totalSegments - 1, Math.floor(scaled));
        const frac = scaled - idx;

        const p0 = points[idx];
        const p1 = points[idx + 1];
        roverRef.current.position.set(
            THREE.MathUtils.lerp(p0[0], p1[0], frac),
            THREE.MathUtils.lerp(p0[1], p1[1], frac) + 0.14,
            THREE.MathUtils.lerp(p0[2], p1[2], frac)
        );
        roverRef.current.lookAt(p1[0], p1[1] + 0.14, p1[2]);
    });

    if (points.length < 2) return null;

    return (
        <group ref={roverRef}>
            <mesh position={[0, 0.14, 0]} castShadow>
                <boxGeometry args={[0.34, 0.15, 0.48]} />
                <meshStandardMaterial color="#eab308" metalness={0.85} roughness={0.28} />
            </mesh>
            <mesh position={[0, 0.24, -0.04]}>
                <boxGeometry args={[0.4, 0.03, 0.38]} />
                <meshStandardMaterial color="#1e3a8a" metalness={0.75} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0.15, 0.25]}>
                <sphereGeometry args={[0.04, 8, 8]} />
                <meshBasicMaterial color={[0.3, 2.8, 3.2]} toneMapped={false} />
            </mesh>
            {[-0.2, 0.2].map((wx, si) =>
                [-0.18, 0, 0.18].map((wz, wi) => (
                    <mesh key={`${si}-${wi}`} position={[wx, 0.05, wz]} rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[0.06, 0.06, 0.05, 12]} />
                        <meshStandardMaterial color="#1e293b" roughness={0.9} />
                    </mesh>
                ))
            )}
        </group>
    );
}

export default function LunarScene({ data, showHazardOverlay, wireframe, animateDescent }) {
    const heightmap = data?.heightmap;
    const riskGrid = data?.risk_grid;
    const safeZone = data?.safe_zone;

    const targetPos = useMemo(() => {
        if (!safeZone || !heightmap) return [0, 0.9, 0];
        const x = (safeZone.norm_x - 0.5) * TERRAIN_SIZE;
        const z = (safeZone.norm_y - 0.5) * TERRAIN_SIZE;
        const y = sampleTerrainY(safeZone.norm_x, safeZone.norm_y, heightmap);
        return [x, y, z];
    }, [safeZone, heightmap]);

    const roverPoints = useMemo(() => {
        if (!data?.rover_path || data.rover_path.length < 2) return [];
        return data.rover_path.map(([nx, ny]) => [
            (nx - 0.5) * TERRAIN_SIZE,
            sampleTerrainY(nx, ny, heightmap) + 0.12,
            (ny - 0.5) * TERRAIN_SIZE,
        ]);
    }, [data?.rover_path, heightmap]);

    const radiusWorld = safeZone ? Math.min(3.4, Math.max(1.2, (safeZone.radius_cells / 96) * TERRAIN_SIZE)) : 1.8;

    return (
        <div className="w-full h-full relative">
            {/* Floating Physics Formula HUD Badge (top-right of 3D viewport) */}
            <div className="absolute top-3 right-3 z-10 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-amber-400/40 backdrop-blur-md pointer-events-none shadow-lg">
                <div className="text-[9px] font-mono text-slate-400 tracking-wider">SHADOW-HEIGHT PHYSICS</div>
                <div className="text-sm font-mono font-bold text-amber-300 tracking-wide">H ≈ L × tan(θ)</div>
            </div>

            <Canvas shadows camera={{ position: [12, 10, 14], fov: 44 }} className="w-full h-full">
                <color attach="background" args={['#03050a']} />
                <fog attach="fog" args={['#03050a', 26, 58]} />
                <Stars radius={90} depth={40} count={4000} factor={3} saturation={0} fade />

                {/* Dramatic low-angle lunar sunlight (crisp shadows, zero flat washout) */}
                <ambientLight intensity={0.14} />
                <directionalLight position={[22, 7, 10]} intensity={3.2} castShadow color="#ffffff" />
                <pointLight position={[-14, 8, -12]} intensity={0.35} color="#38bdf8" />

                <PhotorealisticLunarTerrain
                    heightmap={heightmap}
                    enhancedImageB64={data?.enhanced_image_b64}
                    wireframe={wireframe}
                />

                <HolographicHazardOverlay
                    heightmap={heightmap}
                    riskGrid={riskGrid}
                    visible={showHazardOverlay}
                />

                <DetectedBoulders3D
                    boulders={data?.boulders}
                    imageSize={data?.image_size}
                    heightmap={heightmap}
                />

                <ConcentricRadarBullseye targetPos={targetPos} radiusWorld={radiusWorld} safeZone={safeZone} />
                <LunarLander targetPos={targetPos} animateDescent={animateDescent} />

                {roverPoints.length >= 2 && (
                    <>
                        <Line points={roverPoints} color={[0.25, 2.4, 3.2]} lineWidth={3} toneMapped={false} />
                        <AnimatedRover points={roverPoints} />
                    </>
                )}

                <EffectComposer>
                    <Bloom mipmapBlur luminanceThreshold={1.0} intensity={0.85} />
                </EffectComposer>

                <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.08} minDistance={4} maxDistance={34} />
            </Canvas>
        </div>
    );
}