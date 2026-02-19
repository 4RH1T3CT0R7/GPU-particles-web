use glam::Vec3;

/// Audio-reactive forces for equalizer mode.
///
/// Applies bass outward push, mid-frequency swirl, treble vertical movement,
/// and sparkle effects based on audio frequency bands.
///
/// Returns `(acceleration_contribution, velocity_addition)` so the caller can
/// apply them to the particle's accumulated acceleration and velocity.
///
/// # Arguments
///
/// * `pos` - Current particle position.
/// * `desired` - Shape target position the particle is attracted to.
/// * `id_hash` - Per-particle hash in \[0,1) for phase variation.
/// * `layer_hash` - Secondary hash for layer-based variation.
/// * `time` - Accumulated simulation time in seconds.
/// * `audio_bass` - Bass frequency band energy \[0,1+\].
/// * `audio_mid` - Mid frequency band energy \[0,1+\].
/// * `audio_treble` - Treble frequency band energy \[0,1+\].
/// * `audio_energy` - Overall audio energy level \[0,1+\].
pub fn compute_audio_force(
    pos: Vec3,
    desired: Vec3,
    id_hash: f32,
    layer_hash: f32,
    time: f32,
    audio_bass: f32,
    audio_mid: f32,
    audio_treble: f32,
    _audio_energy: f32,
) -> (Vec3, Vec3) {
    // The audio boost is applied multiplicatively to existing acceleration
    // by the caller. Here we compute the additive audio contributions.
    //
    // The caller is responsible for: acc *= 1.0 + audio_energy * 1.2

    let mut acc = Vec3::ZERO;
    let mut vel_add = Vec3::ZERO;

    // Bass: outward push from desired position
    let bass_force = audio_bass * 4.5;
    let outward_raw = pos - desired + Vec3::new(0.001, 0.0, 0.0);
    let outward_len = outward_raw.length().max(0.001);
    let outward = outward_raw / outward_len;
    acc += outward * bass_force;
    vel_add += outward * audio_bass * 0.8;

    // Mid: swirl based on mid frequency
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

    // Treble: vertical + sparkle effects
    acc.y += audio_treble * 3.8;
    acc.z += (time * 5.0 + id_hash * std::f32::consts::TAU).sin()
        * audio_treble * 2.5;
    let sparkle = Vec3::new(
        (time * 7.0 + id_hash * 12.56).sin(),
        (time * 8.0 + layer_hash * 9.42).cos(),
        (time * 6.0 + id_hash * 15.7).sin(),
    ) * audio_treble * 1.8;
    acc += sparkle;

    (acc, vel_add)
}

/// Returns the multiplicative audio boost factor for existing acceleration.
///
/// In equalizer mode the accumulated acceleration is scaled by this factor
/// before the additive audio contributions are applied.
#[inline]
pub fn audio_boost_factor(audio_energy: f32) -> f32 {
    1.0 + audio_energy * 1.2
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_force_bass_pushes_outward() {
        let pos = Vec3::new(1.0, 0.0, 0.0);
        let desired = Vec3::ZERO;
        let (acc, _vel) = compute_audio_force(pos, desired, 0.5, 0.3, 0.0, 1.0, 0.0, 0.0, 0.5);
        // Bass should push away from desired (outward)
        assert!(acc.x > 0.0, "bass should push particle outward from target");
    }

    #[test]
    fn test_audio_force_zero_audio_zero_force() {
        let pos = Vec3::new(1.0, 0.0, 0.0);
        let desired = Vec3::ZERO;
        let (acc, vel) = compute_audio_force(pos, desired, 0.5, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0);
        // With zero audio, forces should be minimal
        assert!(acc.length() < 0.01, "zero audio should produce near-zero force");
        assert!(vel.length() < 0.01);
    }

    #[test]
    fn test_audio_boost_factor_zero_energy() {
        assert!((audio_boost_factor(0.0) - 1.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_audio_boost_factor_full_energy() {
        assert!((audio_boost_factor(1.0) - 2.2).abs() < f32::EPSILON);
    }

    #[test]
    fn test_audio_force_mid_produces_swirl() {
        let pos = Vec3::new(1.0, 0.0, 0.0);
        let desired = Vec3::ZERO;
        let (acc, _vel) = compute_audio_force(pos, desired, 0.5, 0.3, 0.0, 0.0, 1.0, 0.0, 0.5);
        // Mid should produce rotation/swirl forces
        assert!(acc.length() > 0.5, "mid-only should produce substantial force: {}", acc.length());
    }

    #[test]
    fn test_audio_force_treble_vertical() {
        let pos = Vec3::new(1.0, 0.0, 0.0);
        let desired = Vec3::ZERO;
        let (acc, _vel) = compute_audio_force(pos, desired, 0.5, 0.3, 0.0, 0.0, 0.0, 1.0, 0.5);
        // Treble should add positive Y force (line: acc.y += audio_treble * 3.8),
        // partially offset by sparkle cos term; net Y should still be well above 1.0
        assert!(acc.y > 1.5, "treble should push upward: acc.y={}", acc.y);
    }
}
