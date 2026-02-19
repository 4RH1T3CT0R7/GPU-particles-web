use glam::Vec3;
use xpbd_core::forces::pointer::{compute_pointer_force, PointerForceResult, PointerParams};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/// Build a reasonable default `PointerParams` for the given mode.
///
/// active = true, position = origin, strength = 1.0, radius = 2.0,
/// pressing = true, pulse = false, view_dir = -Z.
fn make_params(mode: u32) -> PointerParams {
    PointerParams {
        active: true,
        mode,
        position: Vec3::ZERO,
        strength: 1.0,
        radius: 2.0,
        pressing: true,
        pulse: false,
        view_dir: Vec3::NEG_Z,
    }
}

/// Convenience: magnitude of a `Vec3`.
fn mag(v: Vec3) -> f32 {
    v.length()
}

/// Assert that no component of the result is NaN.
fn assert_no_nan(r: &PointerForceResult, label: &str) {
    assert!(
        !r.acc.x.is_nan() && !r.acc.y.is_nan() && !r.acc.z.is_nan(),
        "{label}: acc contains NaN: {:?}",
        r.acc,
    );
    assert!(
        !r.vel_add.x.is_nan() && !r.vel_add.y.is_nan() && !r.vel_add.z.is_nan(),
        "{label}: vel_add contains NaN: {:?}",
        r.vel_add,
    );
    assert!(!r.vel_scale.is_nan(), "{label}: vel_scale is NaN");
    if let Some(cap) = r.speed_cap {
        assert!(!cap.is_nan(), "{label}: speed_cap is NaN");
    }
}

// ---------------------------------------------------------------------------
// 1. Inactive pointer produces zero output
// ---------------------------------------------------------------------------

#[test]
fn test_inactive_pointer_no_force() {
    let params = PointerParams {
        active: false,
        ..make_params(0)
    };
    let r = compute_pointer_force(Vec3::new(1.0, 0.0, 0.0), Vec3::ZERO, 0.5, 0.0, &params);

    assert_eq!(r.acc, Vec3::ZERO);
    assert_eq!(r.vel_add, Vec3::ZERO);
    assert!((r.vel_scale - 1.0).abs() < f32::EPSILON);
    assert!(r.speed_cap.is_none());
}

// ---------------------------------------------------------------------------
// 2. Attract (mode 0) pulls toward the pointer
// ---------------------------------------------------------------------------

#[test]
fn test_attract_pulls_toward_pointer() {
    let mut params = make_params(0);
    params.position = Vec3::new(2.0, 0.0, 0.0); // pointer at (2,0,0)

    // Particle at origin -- should be pulled toward +X.
    let r = compute_pointer_force(Vec3::ZERO, Vec3::ZERO, 0.5, 0.0, &params);

    assert!(
        r.acc.x > 0.0,
        "Attract: acc.x should be positive (toward pointer), got {}",
        r.acc.x,
    );
}

// ---------------------------------------------------------------------------
// 3. Repel (mode 1) pushes away from the pointer
// ---------------------------------------------------------------------------

#[test]
fn test_repel_pushes_away_from_pointer() {
    let params = make_params(1); // pointer at origin

    // Particle at (1,0,0) -- direction toward pointer is -X, so repel is +X (away).
    // But the repel branch also adds a swirl component, so the primary -dir_p term
    // makes acc.x negative (since dir_p points toward pointer = -X, and acc -= dir_p * ...).
    // Wait, let's trace: dir_p = (pointer - pos).normalize() = (0-1,0,0) = (-1,0,0).
    // acc -= dir_p * base * 4.5  =>  acc -= (-1,0,0)*... => acc.x += positive (pushes away from pointer).
    let r = compute_pointer_force(Vec3::new(1.0, 0.0, 0.0), Vec3::ZERO, 0.5, 0.0, &params);

    // dir_p = (-1,0,0), so acc -= dir_p*... gives positive x (away from pointer). Wait,
    // the swirl term adds (dir_p.y, -dir_p.x, 0.3) * base * 2.8 = (0, 1, 0.3) * base * 2.8.
    // Net x from repel: -(-1)*base*4.5 = +base*4.5, from swirl: dir_p.y * base*2.8 = 0.
    // So acc.x should be positive (away from pointer at origin).
    assert!(
        r.acc.x > 0.0,
        "Repel: acc.x should be positive (away from pointer at origin), got {}",
        r.acc.x,
    );
    assert!(
        r.vel_scale < 1.0,
        "Repel: vel_scale should be < 1.0 (damping), got {}",
        r.vel_scale,
    );
}

// ---------------------------------------------------------------------------
// 4. Vortex left (mode 2) has tangential force
// ---------------------------------------------------------------------------

#[test]
fn test_vortex_left_tangential_force() {
    let params = make_params(2); // pointer at origin

    // Particle at (1,0,0). dir_p = (-1,0,0).
    // tangent = (dir_p.y * spin, -dir_p.x * spin, dir_p.z * 0.35 * spin)
    //   spin = -1 for mode 2
    //   tangent = (0*(-1), -(-1)*(-1), 0) = (0, -1, 0)
    // So the force has a y-component.
    let r = compute_pointer_force(Vec3::new(1.0, 0.0, 0.0), Vec3::ZERO, 0.5, 0.0, &params);

    assert!(
        r.acc.y.abs() > 1e-6,
        "Vortex left: acc.y should be nonzero (tangential component), got {}",
        r.acc.y,
    );
}

// ---------------------------------------------------------------------------
// 5. Vortex right (mode 3) spins opposite to vortex left
// ---------------------------------------------------------------------------

#[test]
fn test_vortex_right_opposite_spin() {
    let params_left = make_params(2);
    let params_right = make_params(3);

    let pos = Vec3::new(1.0, 0.0, 0.0);
    let r_left =
        compute_pointer_force(pos, Vec3::ZERO, 0.5, 0.0, &params_left);
    let r_right =
        compute_pointer_force(pos, Vec3::ZERO, 0.5, 0.0, &params_right);

    // The tangential (y) component should have opposite signs.
    assert!(
        r_left.acc.y * r_right.acc.y < 0.0,
        "Vortex left y ({}) and vortex right y ({}) should have opposite signs",
        r_left.acc.y,
        r_right.acc.y,
    );
}

// ---------------------------------------------------------------------------
// 6. Pulse (mode 4) repels with swirl, no NaN
// ---------------------------------------------------------------------------

#[test]
fn test_pulse_repels_with_swirl() {
    let params = make_params(4); // pointer at origin

    let r = compute_pointer_force(
        Vec3::new(0.5, 0.0, 0.0),
        Vec3::ZERO,
        0.5,
        1.0,
        &params,
    );

    assert!(
        mag(r.acc) > 1e-6,
        "Pulse: acc magnitude should be nonzero, got {}",
        mag(r.acc),
    );
    // Pulse mode should have radial repulsion component
    assert!(r.acc.x > 0.0, "Pulse should repel: acc.x={}", r.acc.x);
    assert_no_nan(&r, "Pulse (mode 4)");
}

// ---------------------------------------------------------------------------
// 7. Magnetic flow (mode 5) produces a dipole field, no NaN
// ---------------------------------------------------------------------------

#[test]
fn test_magnetic_flow_dipole_field() {
    let params = make_params(5); // pointer at origin

    let r = compute_pointer_force(
        Vec3::new(1.0, 0.0, 0.0),
        Vec3::ZERO,
        0.5,
        0.0,
        &params,
    );

    assert!(
        mag(r.acc) > 1e-6,
        "Magnetic flow: acc magnitude should be nonzero, got {}",
        mag(r.acc),
    );
    // Magnetic flow should produce substantial force (not just epsilon)
    assert!(mag(r.acc) > 0.1, "Magnetic dipole should be substantial: {}", mag(r.acc));
    assert_no_nan(&r, "Magnetic flow (mode 5)");
}

// ---------------------------------------------------------------------------
// 8. Quasar (mode 6) sets speed_cap and damps velocity
// ---------------------------------------------------------------------------

#[test]
fn test_quasar_has_speed_cap() {
    let params = make_params(6);

    let r = compute_pointer_force(
        Vec3::new(0.5, 0.0, 0.0),
        Vec3::ZERO,
        0.5,
        0.0,
        &params,
    );

    assert_eq!(
        r.speed_cap,
        Some(3.5),
        "Quasar: speed_cap should be Some(3.5), got {:?}",
        r.speed_cap,
    );
    assert!(
        r.vel_scale < 1.0,
        "Quasar: vel_scale should be < 1.0, got {}",
        r.vel_scale,
    );
}

// ---------------------------------------------------------------------------
// 9. Quasar disk vs jet produces different force patterns
// ---------------------------------------------------------------------------

#[test]
fn test_quasar_disk_vs_jet() {
    let params = make_params(6);

    // Particle in the disk plane (y ~ 0).
    let r_disk = compute_pointer_force(
        Vec3::new(0.5, 0.0, 0.0),
        Vec3::ZERO,
        0.5,
        0.0,
        &params,
    );

    // Particle on the jet axis (along Y).
    let r_jet = compute_pointer_force(
        Vec3::new(0.0, 1.0, 0.0),
        Vec3::ZERO,
        0.5,
        0.0,
        &params,
    );

    // The two should produce meaningfully different acceleration vectors.
    let diff = (r_disk.acc - r_jet.acc).length();
    assert!(
        diff > 1e-3,
        "Quasar: disk particle and jet particle should have different acc patterns, diff = {}",
        diff,
    );

    // The jet particle should have a dominant Y-acceleration (jet lifts along axis).
    assert!(r_jet.acc.y.abs() > r_disk.acc.y.abs(),
        "Jet particle should have stronger Y-force: jet_y={}, disk_y={}",
        r_jet.acc.y.abs(), r_disk.acc.y.abs());
}

// ---------------------------------------------------------------------------
// 10. pressing=true boosts force compared to pressing=false
// ---------------------------------------------------------------------------

#[test]
fn test_pressing_boosts_force() {
    let mut params_press = make_params(0);
    params_press.pressing = true;

    let mut params_no_press = make_params(0);
    params_no_press.pressing = false;

    let pos = Vec3::new(1.0, 0.0, 0.0);

    let r_press =
        compute_pointer_force(pos, Vec3::ZERO, 0.5, 0.0, &params_press);
    let r_no_press =
        compute_pointer_force(pos, Vec3::ZERO, 0.5, 0.0, &params_no_press);

    assert!(
        mag(r_press.acc) > mag(r_no_press.acc),
        "Pressing should produce larger acc: pressing={} > no_press={}",
        mag(r_press.acc),
        mag(r_no_press.acc),
    );
}

// ---------------------------------------------------------------------------
// 11. Sweep all 7 modes at various positions, verify no NaN
// ---------------------------------------------------------------------------

#[test]
fn test_all_modes_no_nan() {
    let positions = [
        Vec3::new(1.0, 0.0, 0.0),
        Vec3::new(0.0, 1.0, 0.0),
        Vec3::new(0.0, 0.0, 1.0),
        Vec3::new(0.1, 0.1, 0.1),
    ];

    for mode in 0..=6 {
        let params = make_params(mode);
        for (i, &pos) in positions.iter().enumerate() {
            let r = compute_pointer_force(pos, Vec3::ZERO, 0.42, 1.23, &params);
            let label = format!("mode={mode}, pos_idx={i}");
            assert_no_nan(&r, &label);
        }
    }
}

#[test]
fn test_pulse_true_stronger_than_false() {
    // Mode 4 with pulse=true should produce a different (stronger) velocity burst.
    // The pulse flag affects `pulse_val` which scales the velocity mixing factor,
    // so the difference manifests in `vel_add` rather than `acc`.
    let mut params_no_pulse = make_params(4);
    params_no_pulse.pulse = false;
    let r_no = compute_pointer_force(
        Vec3::new(0.5, 0.0, 0.0), Vec3::ZERO, 0.5, 1.0, &params_no_pulse,
    );

    let mut params_pulse = make_params(4);
    params_pulse.pulse = true;
    let r_yes = compute_pointer_force(
        Vec3::new(0.5, 0.0, 0.0), Vec3::ZERO, 0.5, 1.0, &params_pulse,
    );

    // Both should produce nonzero acc and vel_add
    assert!(r_no.acc.length() > 1e-6);
    assert!(r_yes.acc.length() > 1e-6);
    assert!(r_no.vel_add.length() > 1e-6);
    assert!(r_yes.vel_add.length() > 1e-6);
    // pulse=true uses strong_burst*3.5 vs carrier*0.8 in pulse_val,
    // which scales vel_add via t = 0.6 * pulse_val
    let diff = (r_yes.vel_add - r_no.vel_add).length();
    assert!(diff > 1e-4, "pulse=true should differ from false in vel_add: diff={}", diff);
}

#[test]
fn test_unknown_mode_returns_default() {
    let params = make_params(99); // unknown mode
    let r = compute_pointer_force(Vec3::new(1.0, 0.0, 0.0), Vec3::ZERO, 0.5, 1.0, &params);
    // Unknown mode should produce zero force, vel_scale=1.0, no speed_cap
    // But note: falloff, press_boost, and base are still computed, just never used by match arm
    // The _ => {} branch adds nothing to acc/vel_add, so they remain zero
    assert_eq!(r.acc, Vec3::ZERO, "Unknown mode should produce zero acc");
    assert_eq!(r.vel_add, Vec3::ZERO, "Unknown mode should produce zero vel_add");
    assert_eq!(r.vel_scale, 1.0, "Unknown mode vel_scale should be 1.0");
    assert!(r.speed_cap.is_none(), "Unknown mode should have no speed_cap");
}
