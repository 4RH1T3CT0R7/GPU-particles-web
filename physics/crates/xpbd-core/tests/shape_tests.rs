use xpbd_core::shapes::primitives::*;
use xpbd_core::shapes::fractal::fractal_flow;
use xpbd_core::shapes::dispatcher::target_for;

#[test]
fn test_all_primitive_shapes_bounded() {
    let shapes: Vec<(&str, Box<dyn Fn(f32, f32) -> glam::Vec3>)> = vec![
        ("cube", Box::new(|t, s| shape_cube(t, s))),
        ("sphere", Box::new(|t, s| shape_sphere(t, s))),
        ("torus", Box::new(|t, s| shape_torus(t, s))),
        ("helix", Box::new(|t, s| shape_helix(t, s))),
        ("octahedron", Box::new(|t, s| shape_octahedron(t, s))),
        ("wave", Box::new(|t, s| shape_wave(t, s))),
        ("ribbon", Box::new(|t, s| shape_ribbon(t, s))),
        ("icosahedron", Box::new(|t, s| shape_icosahedron(t, s))),
    ];
    for (name, shape_fn) in &shapes {
        for i in 0..200 {
            let t = i as f32 / 200.0;
            let s = ((i * 7) % 200) as f32 / 200.0;
            let p = shape_fn(t, s);
            assert!(
                p.x.abs() <= 2.0 && p.y.abs() <= 2.0 && p.z.abs() <= 2.0,
                "Shape '{}' at ({},{}) = {:?} out of bounds", name, t, s, p
            );
            assert!(!p.x.is_nan() && !p.y.is_nan() && !p.z.is_nan(),
                "Shape '{}' at ({},{}) produced NaN", name, t, s);
        }
    }
}

#[test]
fn test_sphere_radius() {
    for i in 0..100 {
        let t = i as f32 / 100.0;
        let s = ((i * 7) % 100) as f32 / 100.0;
        let p = shape_sphere(t, s);
        let r = p.length();
        assert!((r - 0.7).abs() < 0.02, "sphere radius {} != 0.7 at ({},{})", r, t, s);
    }
}

#[test]
fn test_fractal_no_nan() {
    for ftype in 0..10 {
        let seed = [0.5, 0.1, -0.1, ftype as f32 / 10.0];
        for i in 0..50 {
            let ix = i as f32 / 50.0;
            let iy = ((i * 3) % 50) as f32 / 50.0;
            let p = fractal_flow(ix, iy, 1.0, seed);
            assert!(!p.x.is_nan() && !p.y.is_nan() && !p.z.is_nan(),
                "fractal type {} produced NaN at ({},{}): {:?}", ftype, ix, iy, p);
        }
    }
}

#[test]
fn test_fractal_bounded() {
    for ftype in 0..10 {
        let seed = [0.5, 0.0, 0.0, ftype as f32 / 10.0];
        for i in 0..50 {
            let ix = i as f32 / 50.0;
            let iy = ((i * 3) % 50) as f32 / 50.0;
            let p = fractal_flow(ix, iy, 1.0, seed);
            assert!(p.length() < 5.0,
                "fractal type {} out of bounds at ({},{}): {:?}", ftype, ix, iy, p);
        }
    }
}

#[test]
fn test_dispatcher_all_shapes() {
    let rot = glam::Mat3::IDENTITY;
    let seed = [0.5, 0.1, -0.1, 0.3];
    for sid in 0..=12 {
        let p = target_for(sid, 0.5, 0.5, 1.0, &rot, &seed, 0.0, 0.0, 0.0);
        assert!(!p.x.is_nan() && !p.y.is_nan() && !p.z.is_nan(),
            "dispatcher shape {} produced NaN: {:?}", sid, p);
        assert!(p.length() < 5.0,
            "dispatcher shape {} out of bounds: {:?}", sid, p);
    }
}

#[test]
fn test_equalizer_shape() {
    let p = shape_equalizer(0.5, 0.5, 0.5, 0.3, 0.2, 1.0);
    assert!(!p.x.is_nan() && !p.y.is_nan() && !p.z.is_nan(),
        "equalizer produced NaN: {:?}", p);
    // Equalizer x range is about [-1.5, 1.5], y is about [-0.9, 2.0]
    assert!(p.x.abs() < 3.0 && p.y.abs() < 3.0 && p.z.abs() < 3.0,
        "equalizer out of bounds: {:?}", p);
}

#[test]
fn test_superformula_at_zero() {
    // At t=0: cos(0)=1, sin(0)=0, so with default params r should be 1.0
    let (x, y) = shape_superformula(0.0, 6.0, 1.0, 1.0, 1.0);
    assert!((x - 1.0).abs() < 1e-4, "superformula(0) x should be ~1.0: {}", x);
    assert!(y.abs() < 1e-4, "superformula(0) y should be ~0.0: {}", y);
}

#[test]
fn test_rose_at_zero() {
    // At t=0: cos(k*0)=1, r=1, x=cos(0)=1, y=sin(0)=0
    let (x, y) = shape_rose(0.0, 5.0);
    assert!((x - 1.0).abs() < 1e-6, "rose(0,5) x should be 1.0: {}", x);
    assert!(y.abs() < 1e-6, "rose(0,5) y should be 0.0: {}", y);
}

#[test]
fn test_polygon_on_unit_circle() {
    // polygon returns a point on a regular polygon inscribed in unit circle
    let (x, y) = shape_polygon(0.0, 4.0);
    let r = (x * x + y * y).sqrt();
    assert!((r - 1.0).abs() < 1e-4, "polygon point should be on unit circle: r={}", r);
}

#[test]
fn test_equalizer_no_audio_demo_mode() {
    // With zero audio, the equalizer should use demo wave animation
    let p1 = shape_equalizer(0.5, 0.5, 0.0, 0.0, 0.0, 1.0);
    let p2 = shape_equalizer(0.5, 0.5, 0.0, 0.0, 0.0, 2.0);
    assert!(p1.is_finite() && p2.is_finite());
    // Demo animation should produce different positions at different times
    assert!((p1 - p2).length() > 1e-4, "Demo animation should vary with time");
}

#[test]
fn test_dispatcher_unknown_sid_fallback() {
    use glam::Mat3;
    let rot = Mat3::IDENTITY;
    let seed = [0.5, 0.0, 0.0, 0.0];
    let p_99 = target_for(99, 0.5, 0.5, 1.0, &rot, &seed, 0.0, 0.0, 0.0);
    let p_10 = target_for(10, 0.5, 0.5, 1.0, &rot, &seed, 0.0, 0.0, 0.0);
    // sid>12 fallback should produce same result as sid=10
    assert!((p_99 - p_10).length() < 1e-6,
        "sid=99 fallback should match sid=10: {:?} vs {:?}", p_99, p_10);
}

#[test]
fn test_dispatcher_equalizer_with_audio() {
    use glam::Mat3;
    let rot = Mat3::IDENTITY;
    let seed = [0.5, 0.0, 0.0, 0.0];
    let p_silent = target_for(12, 0.5, 0.5, 1.0, &rot, &seed, 0.0, 0.0, 0.0);
    let p_audio = target_for(12, 0.5, 0.5, 1.0, &rot, &seed, 0.8, 0.5, 0.3);
    // With audio, equalizer output should differ
    assert!((p_silent - p_audio).length() > 0.01,
        "Equalizer should respond to audio: {:?} vs {:?}", p_silent, p_audio);
}

#[test]
fn test_fractal_negative_seed() {
    // Negative seed[3] should map to valid fractal type via modulo fixup
    let p = fractal_flow(0.5, 0.5, 1.0, [0.5, 0.0, 0.0, -0.3]);
    assert!(!p.x.is_nan() && !p.y.is_nan() && !p.z.is_nan(),
        "Negative seed should not produce NaN: {:?}", p);
    assert!(p.length() < 5.0, "Negative seed fractal should be bounded");
}

#[test]
fn test_fractal_types_produce_different_output() {
    // Each fractal type should produce a different result
    let mut results = Vec::new();
    for ftype in 0..10 {
        let seed_val = ftype as f32 / 10.0 + 0.01; // seed[3] selects type
        let p = fractal_flow(0.3, 0.7, 1.0, [0.5, 0.0, 0.0, seed_val]);
        results.push(p);
    }
    // At least some types should differ
    let mut different_count = 0;
    for i in 1..results.len() {
        if (results[i] - results[0]).length() > 0.01 {
            different_count += 1;
        }
    }
    assert!(different_count >= 3,
        "At least 3 fractal types should produce different output, got {}", different_count);
}
