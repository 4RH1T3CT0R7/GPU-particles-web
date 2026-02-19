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

    #[wasm_bindgen]
    pub fn set_shapes(
        &mut self,
        shape_a: u32,
        shape_b: u32,
        morph: f32,
        shape_strength: f32,
        speed_multiplier: f32,
    ) {
        self.solver.shape_params.shape_a = shape_a;
        self.solver.shape_params.shape_b = shape_b;
        self.solver.shape_params.morph = morph;
        self.solver.config.shape_strength = shape_strength;
        self.solver.shape_params.speed_multiplier = speed_multiplier;
    }

    #[wasm_bindgen]
    pub fn set_shape_rotations(&mut self, rot_a: &[f32], rot_b: &[f32]) {
        if let (Ok(a), Ok(b)) = (rot_a.try_into(), rot_b.try_into()) {
            self.solver.shape_params.rot_a = glam::Mat3::from_cols_array(a);
            self.solver.shape_params.rot_b = glam::Mat3::from_cols_array(b);
        }
    }

    #[wasm_bindgen]
    pub fn set_fractal_seeds(&mut self, seed_a: &[f32], seed_b: &[f32]) {
        if let (Ok(a), Ok(b)) = (seed_a.try_into(), seed_b.try_into()) {
            self.solver.shape_params.fractal_a = a;
            self.solver.shape_params.fractal_b = b;
        }
    }

    #[wasm_bindgen]
    pub fn set_audio(&mut self, bass: f32, mid: f32, treble: f32, energy: f32) {
        self.solver.shape_params.audio_bass = bass;
        self.solver.shape_params.audio_mid = mid;
        self.solver.shape_params.audio_treble = treble;
        self.solver.shape_params.audio_energy = energy;
    }

    #[wasm_bindgen]
    pub fn set_pointer(
        &mut self,
        active: bool,
        mode: u32,
        x: f32, y: f32, z: f32,
        strength: f32,
        radius: f32,
        pressing: bool,
        pulse: bool,
        view_dir_x: f32, view_dir_y: f32, view_dir_z: f32,
    ) {
        self.solver.pointer_params = xpbd_core::forces::pointer::PointerParams {
            active,
            mode,
            position: glam::Vec3::new(x, y, z),
            strength,
            radius,
            pressing,
            pulse,
            view_dir: glam::Vec3::new(view_dir_x, view_dir_y, view_dir_z),
        };
    }

    #[wasm_bindgen]
    pub fn set_solver_config(
        &mut self,
        substeps: u32,
        solver_iterations: u32,
        collisions_enabled: bool,
    ) {
        self.solver.config.substeps = substeps;
        self.solver.config.solver_iterations = solver_iterations;
        self.solver.config.collisions_enabled = collisions_enabled;
    }

    #[wasm_bindgen]
    pub fn create_cloth(
        &mut self,
        start_idx: u32,
        width: u32,
        height: u32,
        spacing: f32,
        stiffness: f32,
        bending_stiffness: f32,
    ) {
        self.solver.create_cloth(
            start_idx as usize,
            width as usize,
            height as usize,
            spacing,
            stiffness,
            bending_stiffness,
        );
        self.write_gpu_output();
    }

    #[wasm_bindgen]
    pub fn create_rigid_body(&mut self, start_idx: u32, count: u32, stiffness: f32) {
        self.solver.create_rigid_body(start_idx as usize, count as usize, stiffness);
    }

    #[wasm_bindgen]
    pub fn clear_constraints(&mut self) {
        self.solver.clear_constraints();
    }

    #[wasm_bindgen]
    pub fn reinitialize(&mut self, seed: u32) {
        self.solver.reinitialize(seed);
        self.write_gpu_output();
    }

    #[wasm_bindgen]
    pub fn set_fluid_config(
        &mut self,
        rest_density: f32,
        viscosity: f32,
        vorticity: f32,
        smoothing_radius: f32,
    ) {
        self.solver.config.fluid_rest_density = rest_density;
        self.solver.config.fluid_viscosity = viscosity;
        self.solver.config.fluid_vorticity = vorticity;
        self.solver.config.smoothing_radius = smoothing_radius;
    }

    #[wasm_bindgen]
    pub fn set_particle_phase(&mut self, index: usize, phase: u8) {
        if index < self.solver.particles.count {
            self.solver.particles.phase[index] = match phase {
                1 => xpbd_core::particle::Phase::Fluid,
                2 => xpbd_core::particle::Phase::Cloth,
                3 => xpbd_core::particle::Phase::Rigid,
                4 => xpbd_core::particle::Phase::Granular,
                5 => xpbd_core::particle::Phase::Gas,
                6 => xpbd_core::particle::Phase::Static,
                _ => xpbd_core::particle::Phase::Free,
            };
        }
    }

    #[wasm_bindgen]
    pub fn set_nbody_config(
        &mut self,
        enabled: bool,
        gravitational_constant: f32,
        softening: f32,
        theta: f32,
    ) {
        self.solver.config.nbody_enabled = enabled;
        self.solver.config.nbody_g = gravitational_constant;
        self.solver.config.nbody_softening = softening;
        self.solver.config.nbody_theta = theta;
    }

    #[wasm_bindgen]
    pub fn set_em_config(
        &mut self,
        enabled: bool,
        coulomb_k: f32,
        magnetic_bx: f32,
        magnetic_by: f32,
        magnetic_bz: f32,
    ) {
        self.solver.config.em_enabled = enabled;
        self.solver.config.em_coulomb_k = coulomb_k;
        self.solver.config.em_magnetic_field = glam::Vec3::new(magnetic_bx, magnetic_by, magnetic_bz);
    }

    #[wasm_bindgen]
    pub fn set_particle_charge(&mut self, index: usize, charge: f32) {
        if index < self.solver.particles.count {
            self.solver.particles.charge[index] = charge;
        }
    }

    /// Set all particles to a given phase at once (for bulk mode changes).
    #[wasm_bindgen]
    pub fn set_all_particles_phase(&mut self, phase: u8) {
        let p = match phase {
            1 => xpbd_core::particle::Phase::Fluid,
            2 => xpbd_core::particle::Phase::Cloth,
            3 => xpbd_core::particle::Phase::Rigid,
            4 => xpbd_core::particle::Phase::Granular,
            5 => xpbd_core::particle::Phase::Gas,
            6 => xpbd_core::particle::Phase::Static,
            _ => xpbd_core::particle::Phase::Free,
        };
        for i in 0..self.solver.particles.count {
            self.solver.particles.phase[i] = p;
        }
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
