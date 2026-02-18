use crate::config::PhysicsConfig;
use crate::constraints::contact::{detect_contacts, solve_contacts, ContactConstraint};
use crate::forces::pointer::{compute_pointer_force, PointerParams};
use crate::grid::SpatialHashGrid;
use crate::math::{curl, ease_in_out_cubic, hash12, noise, smoothstep};
use crate::particle::ParticleSet;
use crate::shapes::dispatcher::target_for;
use glam::Vec3;

/// Parameters controlling shape morphing, rotation, fractals, and audio.
pub struct ShapeParams {
    pub shape_a: u32,
    pub shape_b: u32,
    pub morph: f32,
    pub rot_a: glam::Mat3,
    pub rot_b: glam::Mat3,
    pub fractal_a: [f32; 4],
    pub fractal_b: [f32; 4],
    pub audio_bass: f32,
    pub audio_mid: f32,
    pub audio_treble: f32,
    pub audio_energy: f32,
    pub speed_multiplier: f32,
}

impl Default for ShapeParams {
    fn default() -> Self {
        Self {
            shape_a: 0,
            shape_b: 1,
            morph: 0.0,
            rot_a: glam::Mat3::IDENTITY,
            rot_b: glam::Mat3::IDENTITY,
            fractal_a: [0.5, 0.0, 0.0, 0.0],
            fractal_b: [0.5, 0.0, 0.0, 0.0],
            audio_bass: 0.0,
            audio_mid: 0.0,
            audio_treble: 0.0,
            audio_energy: 0.0,
            speed_multiplier: 1.0,
        }
    }
}

pub struct Solver {
    pub particles: ParticleSet,
    pub config: PhysicsConfig,
    pub shape_params: ShapeParams,
    pub pointer_params: PointerParams,
    grid: SpatialHashGrid,
    contacts: Vec<ContactConstraint>,
}

impl Solver {
    pub fn new(particle_count: usize) -> Self {
        let mut particles = ParticleSet::new(particle_count);

        // Initialize with spiral ring (matches existing init in index-webgpu.ts)
        let tex_size = (particle_count as f32).sqrt().ceil() as usize;
        for i in 0..particle_count {
            let t = i as f32 / particle_count as f32;
            let angle = t * std::f32::consts::TAU * 20.0;
            let r = 0.5 + t * 1.5;
            particles.position[i] = Vec3::new(
                angle.cos() * r,
                (t - 0.5) * 2.0,
                angle.sin() * r,
            );
            let ux = (i % tex_size) as f32 / tex_size as f32;
            let uy = (i / tex_size) as f32 / tex_size as f32;
            particles.radius[i] = 0.05 + hash12(ux, uy) * 0.05;
            particles.hash[i] = hash12(ux, uy);
        }

        Self {
            particles,
            config: PhysicsConfig::default(),
            shape_params: ShapeParams::default(),
            pointer_params: PointerParams::default(),
            grid: SpatialHashGrid::new(0.2, 131072, particle_count),
            contacts: Vec::new(),
        }
    }

    /// Step the full particle physics simulation.
    ///
    /// `dt` is the frame delta time in seconds. `time` is the accumulated
    /// simulation time used for animated noise and shape parameters.
    pub fn step(&mut self, dt: f32, time: f32) {
        let sp = &self.shape_params;
        let speed_multiplier = sp.speed_multiplier;
        let sim_dt = dt * speed_multiplier;

        if sim_dt.abs() < 1.0e-9 {
            return;
        }

        let count = self.particles.count;
        let tex_size = (count as f32).sqrt().ceil() as usize;

        // Compute shape targets ONCE (they don't change within substeps)
        self.compute_shape_targets(time, tex_size);

        if self.config.collisions_enabled {
            // --- XPBD path: substeps with prediction + constraint solving ---
            let sub_dt = sim_dt / self.config.substeps.max(1) as f32;

            for _substep in 0..self.config.substeps {
                // STEP 1: Apply forces -> update velocities
                self.apply_forces(sub_dt, time, tex_size);

                // STEP 2: Predict positions
                for i in 0..count {
                    self.particles.predicted[i] =
                        self.particles.position[i] + self.particles.velocity[i] * sub_dt;
                }

                // STEP 3: Build grid and solve constraints
                self.grid.build(&self.particles.predicted, count);

                self.contacts = detect_contacts(
                    &self.particles.predicted,
                    &self.particles.radius,
                    count,
                    &self.grid,
                );

                for _iter in 0..self.config.solver_iterations {
                    // Reset corrections
                    for i in 0..count {
                        self.particles.corrections[i] = Vec3::ZERO;
                        self.particles.correction_counts[i] = 0;
                    }

                    // Solve contact constraints
                    solve_contacts(
                        &self.contacts,
                        &self.particles.predicted,
                        &mut self.particles.corrections,
                        &mut self.particles.correction_counts,
                    );

                    // Solve boundary constraint
                    self.solve_boundary_constraint();

                    // Apply averaged corrections
                    for i in 0..count {
                        if self.particles.correction_counts[i] > 0 {
                            self.particles.predicted[i] += self.particles.corrections[i]
                                / self.particles.correction_counts[i] as f32;
                        }
                    }
                }

                // STEP 4: Update velocities from position change and finalize
                for i in 0..count {
                    self.particles.velocity[i] =
                        (self.particles.predicted[i] - self.particles.position[i]) / sub_dt;
                    self.particles.position[i] = self.particles.predicted[i];
                }
            }
        } else {
            // --- Original path: single-pass integration (preserves exact behavior) ---
            self.apply_forces(sim_dt, time, tex_size);

            for i in 0..count {
                self.particles.position[i] +=
                    self.particles.velocity[i] * sim_dt;
            }
        }
    }

    /// Compute shape targets for all particles (Phase 1).
    ///
    /// This is called once per step (not per substep) since shape targets
    /// don't change within a frame.
    fn compute_shape_targets(&mut self, time: f32, tex_size: usize) {
        let sp = &self.shape_params;
        let morph_blend = ease_in_out_cubic(sp.morph);
        let shape_a = sp.shape_a;
        let shape_b = sp.shape_b;
        let rot_a = sp.rot_a;
        let rot_b = sp.rot_b;
        let fractal_a = sp.fractal_a;
        let fractal_b = sp.fractal_b;
        let audio_bass = sp.audio_bass;
        let audio_mid = sp.audio_mid;
        let audio_treble = sp.audio_treble;
        let count = self.particles.count;

        for i in 0..count {
            let id_x = (i % tex_size) as f32 / tex_size as f32;
            let id_y = (i / tex_size) as f32 / tex_size as f32;

            let target_a = target_for(
                shape_a, id_x, id_y,
                time * 0.55,
                &rot_a, &fractal_a,
                audio_bass, audio_mid, audio_treble,
            );
            let target_b = target_for(
                shape_b, id_x, id_y,
                time * 0.58 + 2.5,
                &rot_b, &fractal_b,
                audio_bass, audio_mid, audio_treble,
            );
            self.particles.target_pos[i] = target_a.lerp(target_b, morph_blend);
            self.particles.target_weight[i] = smoothstep(0.03, 0.9, self.particles.hash[i]);
        }
    }

    /// Apply all forces to particle velocities (Phase 2).
    ///
    /// This computes flow forces, shape attraction, pointer interaction,
    /// boundary push, audio reactivity, and free-flight forces, then
    /// integrates acceleration into velocity with damping and speed cap.
    ///
    /// Position update is NOT done here; it happens in the caller
    /// (either simple Euler or XPBD prediction).
    fn apply_forces(&mut self, sub_dt: f32, time: f32, tex_size: usize) {
        let shape_strength = self.config.shape_strength;
        let speed_multiplier = self.shape_params.speed_multiplier;
        let roam_radius = self.config.boundary_radius;
        let count = self.particles.count;

        // Snapshot audio params to avoid borrow issues
        let audio_bass = self.shape_params.audio_bass;
        let audio_mid = self.shape_params.audio_mid;
        let audio_treble = self.shape_params.audio_treble;
        let audio_energy = self.shape_params.audio_energy;
        let shape_a = self.shape_params.shape_a;
        let shape_b = self.shape_params.shape_b;

        // Derived constants from shape_strength
        let structure = smoothstep(0.1, 0.9, shape_strength);
        let calm_factor = smoothstep(0.5, 1.0, shape_strength);

        let is_equalizer_mode = shape_a == 12 || shape_b == 12;
        let is_free_flight = shape_strength < 0.05;

        for i in 0..count {
            let pos = self.particles.position[i];
            let mut vel = self.particles.velocity[i];
            let id_hash = self.particles.hash[i];
            let id_x = (i % tex_size) as f32 / tex_size as f32;
            let id_y = (i / tex_size) as f32 / tex_size as f32;
            let layer_hash = hash12(id_x * 23.7, id_y * 23.7);

            // ==== 1. FLOW FORCES ====
            // Curl noise for organic movement (large + mid + fine)
            let (curl_lx, curl_ly) = curl(pos.x * 0.4 + time * 0.1, pos.y * 0.4 + time * 0.1);
            let curl_large = (curl_lx * 0.7, curl_ly * 0.7);

            let (curl_mx, curl_my) = curl(
                pos.x * 1.0 + pos.z * 0.3 - time * 0.12,
                pos.y * 1.0 + pos.z * 0.3 - time * 0.12,
            );
            let curl_mid = (curl_mx * 0.5, curl_my * 0.5);

            let (curl_fx, curl_fy) = curl(
                pos.x * 2.5 + time * 0.2 + id_hash * 3.0,
                pos.y * 2.5 + time * 0.2 + id_hash * 3.0,
            );
            let curl_fine = (curl_fx * 0.25, curl_fy * 0.25);

            let curl_z = noise(pos.x * 1.5 + time * 0.15, pos.y * 1.5 + time * 0.15) - 0.5;

            let swirl_x = curl_large.0 + curl_mid.0 + curl_fine.0;
            let swirl_y = curl_large.1 + curl_mid.1 + curl_fine.1;

            // Vortex
            let vortex_cx = (time * 0.08).sin() * 0.4;
            let vortex_cy = (time * 0.1).cos() * 0.4;
            let rel_x = pos.x - vortex_cx;
            let rel_y = pos.y - vortex_cy;
            let r2 = (rel_x * rel_x + rel_y * rel_y).max(0.15);
            let vortex_x = -rel_y / r2 * 0.35;
            let vortex_y = rel_x / r2 * 0.35;

            let base_flow_x = swirl_x * 0.55 + vortex_x * 0.35;
            let base_flow_y = swirl_y * 0.55 + vortex_y * 0.35;

            let damped_flow_x = mix_f32(base_flow_x, swirl_x * 0.25, calm_factor);
            let damped_flow_y = mix_f32(base_flow_y, swirl_y * 0.25, calm_factor);

            let mut flow_z = curl_z * 0.4;
            flow_z += (time * 0.25 + pos.x * 1.2 + pos.y * 0.8).sin() * 0.35;

            let flow_scale = mix_f32(0.35, 0.55, 1.0 - structure);
            let mut acc = Vec3::new(
                damped_flow_x * flow_scale,
                damped_flow_y * flow_scale,
                flow_z * flow_scale,
            );
            acc.y -= 0.04; // gravity

            let vel_mag = vel.length();
            acc -= vel * vel_mag * 0.018; // quadratic drag

            let drag = mix_f32(0.93, 0.965, calm_factor);
            vel *= drag;

            // ==== 2. SHAPE ATTRACTION ====
            let desired = self.particles.target_pos[i];
            let affinity = self.particles.target_weight[i];
            let shape_weight = shape_strength * affinity;

            let to_shape = desired - pos;
            let dist = to_shape.length().max(0.005);
            let dir_to_shape = to_shape / dist;

            let spring_strength = 15.0 + 10.0 * calm_factor;
            let damping_factor = (-dist * 0.4_f32).exp();
            let mut shape_force = to_shape * spring_strength * shape_weight * damping_factor;

            // Close-range corrections
            let close_range = smoothstep(0.5, 0.0, dist);
            shape_force += dir_to_shape * 6.0 * shape_weight * close_range;

            let near_target = smoothstep(0.15, 0.0, dist);
            shape_force += dir_to_shape * 3.0 * shape_weight * near_target;
            vel *= mix_f32(1.0, 0.85, near_target * shape_weight);

            let cohesion = smoothstep(0.0, 0.55, shape_weight);
            acc = Vec3::lerp(acc, shape_force * 2.2, cohesion * 0.92);
            acc += shape_force * 0.6;
            vel *= mix_f32(0.96, 0.87, cohesion * calm_factor);

            // ==== POINTER INTERACTION ====
            if self.pointer_params.active {
                let result = compute_pointer_force(
                    pos, vel, id_hash, time, &self.pointer_params,
                );
                acc += result.acc;
                vel += result.vel_add;
                vel *= result.vel_scale;
                if let Some(cap) = result.speed_cap {
                    let speed = vel.length();
                    if speed > cap {
                        vel = vel / speed * cap;
                    }
                }
            }

            // ==== 3. BOUNDARY ====
            let dist_center = pos.length();
            if dist_center > roam_radius {
                acc -= pos / dist_center * (dist_center - roam_radius) * 0.6;
            }

            // ==== 4. AUDIO REACTIVITY (equalizer mode) ====
            if is_equalizer_mode {
                let audio_boost = 1.0 + audio_energy * 1.2;
                acc *= audio_boost;

                let bass_force = audio_bass * 4.5;
                let outward_raw = pos - desired + Vec3::new(0.001, 0.0, 0.0);
                let outward_len = outward_raw.length().max(0.001);
                let outward = outward_raw / outward_len;
                acc += outward * bass_force;
                vel += outward * audio_bass * 0.8;

                let mid_angle = audio_mid * std::f32::consts::PI + time;
                let mid_swirl_x = mid_angle.cos();
                let mid_swirl_y = mid_angle.sin();
                acc += Vec3::new(
                    mid_swirl_x * audio_mid * 3.2,
                    mid_swirl_y * audio_mid * 3.2,
                    0.0,
                );
                let mid_tangent = Vec3::new(
                    -mid_swirl_y,
                    mid_swirl_x,
                    (time * 2.0).sin() * 0.5,
                );
                acc += mid_tangent * audio_mid * 2.0;

                acc.y += audio_treble * 3.8;
                acc.z += (time * 5.0 + id_hash * std::f32::consts::TAU).sin()
                    * audio_treble * 2.5;
                let sparkle = Vec3::new(
                    (time * 7.0 + id_hash * 12.56).sin(),
                    (time * 8.0 + layer_hash * 9.42).cos(),
                    (time * 6.0 + id_hash * 15.7).sin(),
                ) * audio_treble * 1.8;
                acc += sparkle;
            }

            // ==== 5. FREE-FLIGHT MODE ====
            if is_free_flight {
                let turbulence1 = Vec3::new(
                    (time * 1.2 + pos.y * 3.0 + id_hash * std::f32::consts::TAU).sin(),
                    (time * 0.9 + pos.x * 2.5 + layer_hash * 4.71).cos(),
                    (time * 1.1 + pos.z * 3.2 + id_hash * std::f32::consts::PI).sin(),
                ) * 2.8;

                let turbulence2 = Vec3::new(
                    (time * 1.8 + pos.z * 2.2 - layer_hash * 5.0).cos(),
                    (time * 1.5 + pos.y * 2.0 + id_hash * 7.5).sin(),
                    (time * 1.3 + pos.x * 2.5 - layer_hash * 2.8).cos(),
                ) * 2.2;

                let pos_len = pos.length();
                let spiral_angle1 = time * 0.8 + pos_len * 2.5;
                let spiral_angle2 = time * 1.2 - pos_len * 1.8;
                let spiral_flow1 = Vec3::new(
                    spiral_angle1.cos() * pos.y - spiral_angle1.sin() * pos.z,
                    spiral_angle1.sin() * pos.x + spiral_angle1.cos() * pos.z,
                    spiral_angle1.cos() * pos.x - spiral_angle1.sin() * pos.y,
                ) * 1.8;
                let spiral_flow2 = Vec3::new(
                    -spiral_angle2.sin() * pos.z,
                    spiral_angle2.cos() * pos.x,
                    spiral_angle2.sin() * pos.y,
                ) * 1.5;

                let (cf1x, cf1y) = curl(pos.x * 2.2 + time * 0.5, pos.y * 2.2 + time * 0.5);
                let (cf2x, cf2y) = curl(
                    pos.y * 1.8 - time * 0.4 + 5.7,
                    pos.z * 1.8 - time * 0.4 + 3.2,
                );
                let (cf3x, _cf3y) = curl(
                    pos.x * 2.5 + time * 0.3 + 2.1,
                    pos.z * 2.5 + time * 0.3 + 8.4,
                );
                let curl_flow1 = Vec3::new(cf1x, cf1y, cf2x) * 3.5;
                let curl_flow2 = Vec3::new(cf3x, cf1y, cf2y) * 2.8;

                let vert_wave =
                    (time * 2.0 + pos.x * 2.5 + pos.z * 2.0).sin() * 1.5;
                let horiz_wave = (time * 1.8 + pos.y * 2.2).cos() * 1.2;

                acc += turbulence1 * 0.7;
                acc += turbulence2 * 0.65;
                acc += spiral_flow1 * 0.9;
                acc += spiral_flow2 * 0.75;
                acc += curl_flow1 * 1.0;
                acc += curl_flow2 * 0.85;
                acc.y += vert_wave;
                acc.x += horiz_wave;

                let random_drift = Vec3::new(
                    noise(id_x * 18.3 + time * 0.6, id_y * 18.3 + time * 0.6),
                    noise(id_x * 27.7 - time * 0.5, id_y * 27.7 - time * 0.5),
                    noise(id_x * 35.1 + time * 0.7, id_y * 35.1 + time * 0.7),
                ) * 2.2
                    - Vec3::splat(1.1);
                acc += random_drift;

                let to_center_x = -pos.x;
                let to_center_y = -pos.y;
                let dist_to_center =
                    (to_center_x * to_center_x + to_center_y * to_center_y)
                        .sqrt()
                        .max(0.5);
                let vortex_force_x = -to_center_y / dist_to_center;
                let vortex_force_y = to_center_x / dist_to_center;
                acc += Vec3::new(
                    vortex_force_x * 1.5,
                    vortex_force_y * 1.5,
                    (time + pos.z).sin() * 0.8,
                );
            }

            // ==== 6. INTEGRATION (velocity only) ====
            vel += acc * sub_dt;
            // Additional damping when speed multiplier is active
            vel *= mix_f32(1.0, 0.915, step_f32(0.0001, speed_multiplier));
            // Speed cap
            let speed = vel.length();
            if speed > 18.0 {
                vel = vel / speed * 18.0;
            }

            self.particles.velocity[i] = vel;
        }
    }

    /// Solve boundary constraint for XPBD mode.
    ///
    /// Pushes predicted positions back inside the boundary sphere.
    fn solve_boundary_constraint(&mut self) {
        let boundary = self.config.boundary_radius;
        for i in 0..self.particles.count {
            let pos = self.particles.predicted[i];
            let dist = pos.length();
            if dist > boundary {
                let correction = pos / dist * (boundary - dist);
                self.particles.corrections[i] += correction;
                self.particles.correction_counts[i] += 1;
            }
        }
    }

    /// Re-initialize particle positions in a spiral ring pattern.
    pub fn reinitialize(&mut self, _seed: u32) {
        for i in 0..self.particles.count {
            let t = i as f32 / self.particles.count as f32;
            let angle = t * std::f32::consts::TAU * 20.0;
            let r = 0.5 + t * 1.5;
            self.particles.position[i] =
                Vec3::new(angle.cos() * r, (t - 0.5) * 2.0, angle.sin() * r);
            self.particles.velocity[i] = Vec3::ZERO;
        }
    }
}

// ---------- helper functions ----------

/// GLSL-style `mix(a, b, t)` for scalars.
#[inline]
fn mix_f32(a: f32, b: f32, t: f32) -> f32 {
    a * (1.0 - t) + b * t
}

/// GLSL-style `step(edge, x)`: returns 0.0 if x < edge, else 1.0.
#[inline]
fn step_f32(edge: f32, x: f32) -> f32 {
    if x < edge {
        0.0
    } else {
        1.0
    }
}
