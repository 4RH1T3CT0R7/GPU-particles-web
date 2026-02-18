// src/physics/wasm-loader.ts
//
// Shared WASM physics loader for both WebGL2 and WebGPU render paths.
// Loads the xpbd-wasm module, manages PhysicsWorld lifecycle.

import init, { PhysicsWorld } from '../../wasm/pkg/xpbd_wasm.js';

export interface PhysicsEngine {
    world: PhysicsWorld;
    wasmMemory: WebAssembly.Memory;
    ready: boolean;
}

let wasmMemory: WebAssembly.Memory | null = null;

/**
 * Initialize the WASM physics engine.
 * Call once at startup before the render loop begins.
 */
export async function initPhysicsEngine(particleCount: number): Promise<PhysicsEngine> {
    const wasm = await init();
    wasmMemory = wasm.memory;

    const world = new PhysicsWorld(particleCount);

    console.log(`WASM physics loaded: ${particleCount} particles, buffer: ${world.get_gpu_buffer_byte_length()} bytes`);

    return { world, wasmMemory: wasm.memory, ready: true };
}

/**
 * Step physics simulation. Returns time taken in ms.
 */
export function stepPhysics(engine: PhysicsEngine, dt: number, time: number): number {
    return engine.world.step(dt, time);
}

/**
 * Get a Float32Array view into the WASM GPU output buffer.
 * This is a zero-copy view — valid until next WASM allocation.
 * Use for WebGPU: device.queue.writeBuffer(buf, 0, view)
 */
export function getGpuBufferView(engine: PhysicsEngine): Float32Array {
    const ptr = engine.world.get_gpu_buffer_ptr();
    const byteLen = engine.world.get_gpu_buffer_byte_length();
    return new Float32Array(engine.wasmMemory.buffer, ptr, byteLen / 4);
}

/**
 * Write separate position and velocity arrays for WebGL2 texture upload.
 * pos: Float32Array(N*4) — [x,y,z,1, x,y,z,1, ...]
 * vel: Float32Array(N*4) — [vx,vy,vz,1, vx,vy,vz,1, ...]
 */
export function getWebGLBuffers(
    engine: PhysicsEngine
): { pos: Float32Array; vel: Float32Array } {
    const count = engine.world.particle_count();
    const gpuView = getGpuBufferView(engine);

    // GpuParticle layout: [px,py,pz,radius, vx,vy,vz,pad] = 8 floats
    const pos = new Float32Array(count * 4);
    const vel = new Float32Array(count * 4);

    for (let i = 0; i < count; i++) {
        const base = i * 8;
        // Position texture: RGBA = (x, y, z, 1.0)
        pos[i * 4 + 0] = gpuView[base + 0];
        pos[i * 4 + 1] = gpuView[base + 1];
        pos[i * 4 + 2] = gpuView[base + 2];
        pos[i * 4 + 3] = 1.0;
        // Velocity texture: RGBA = (vx, vy, vz, 1.0)
        vel[i * 4 + 0] = gpuView[base + 4];
        vel[i * 4 + 1] = gpuView[base + 5];
        vel[i * 4 + 2] = gpuView[base + 6];
        vel[i * 4 + 3] = 1.0;
    }

    return { pos, vel };
}
