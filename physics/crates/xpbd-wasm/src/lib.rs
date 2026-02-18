use wasm_bindgen::prelude::*;
use xpbd_core::solver::Solver;

/// GPU-compatible particle struct: 32 bytes, matches WGSL Particle
#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct GpuParticle {
    position: [f32; 3], // 12 bytes
    radius: f32,        //  4 bytes
    velocity: [f32; 3], // 12 bytes
    _pad: f32,          //  4 bytes
}

#[wasm_bindgen]
pub struct PhysicsWorld {
    solver: Solver,
    gpu_buffer: Vec<GpuParticle>,
}

#[wasm_bindgen]
impl PhysicsWorld {
    #[wasm_bindgen(constructor)]
    pub fn new(particle_count: usize) -> PhysicsWorld {
        web_sys::console::log_1(
            &format!("WASM PhysicsWorld created: {} particles", particle_count).into()
        );

        let solver = Solver::new(particle_count);
        let gpu_buffer = vec![GpuParticle {
            position: [0.0; 3],
            radius: 0.05,
            velocity: [0.0; 3],
            _pad: 0.0,
        }; particle_count];

        let mut world = PhysicsWorld { solver, gpu_buffer };
        world.write_gpu_output();
        world
    }

    #[wasm_bindgen]
    pub fn step(&mut self, dt: f32, time: f32) -> f32 {
        let start = js_sys::Date::now();
        self.solver.step(dt, time);
        self.write_gpu_output();
        let elapsed = js_sys::Date::now() - start;
        elapsed as f32
    }

    #[wasm_bindgen]
    pub fn get_gpu_buffer_ptr(&self) -> *const f32 {
        self.gpu_buffer.as_ptr() as *const f32
    }

    #[wasm_bindgen]
    pub fn get_gpu_buffer_byte_length(&self) -> usize {
        self.gpu_buffer.len() * std::mem::size_of::<GpuParticle>()
    }

    #[wasm_bindgen]
    pub fn particle_count(&self) -> usize {
        self.solver.particles.count
    }
}

impl PhysicsWorld {
    fn write_gpu_output(&mut self) {
        for i in 0..self.solver.particles.count {
            let pos = self.solver.particles.position[i];
            let vel = self.solver.particles.velocity[i];
            self.gpu_buffer[i] = GpuParticle {
                position: [pos.x, pos.y, pos.z],
                radius: self.solver.particles.radius[i],
                velocity: [vel.x, vel.y, vel.z],
                _pad: 0.0,
            };
        }
    }
}
