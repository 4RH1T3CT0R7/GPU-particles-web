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
