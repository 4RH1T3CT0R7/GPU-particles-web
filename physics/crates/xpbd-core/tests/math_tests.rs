use xpbd_core::math::*;

#[test]
fn test_hash11_range() {
    for i in 0..1000 {
        let h = hash11(i as f32 * 0.1);
        assert!(h >= 0.0 && h < 1.0, "hash11({}) = {} out of range", i as f32 * 0.1, h);
    }
}

#[test]
fn test_hash12_range() {
    for i in 0..100 {
        for j in 0..100 {
            let h = hash12(i as f32 * 0.1, j as f32 * 0.1);
            assert!(h >= 0.0 && h < 1.0, "hash12({},{}) = {} out of range", i, j, h);
        }
    }
}

#[test]
fn test_hash22_range() {
    for i in 0..100 {
        let (a, b) = hash22(i as f32 * 0.5, i as f32 * 0.3);
        assert!(a >= 0.0 && a < 1.0, "hash22.0 out of range: {}", a);
        assert!(b >= 0.0 && b < 1.0, "hash22.1 out of range: {}", b);
    }
}

#[test]
fn test_noise_range() {
    for i in 0..100 {
        let n = noise(i as f32 * 0.5, i as f32 * 0.3);
        assert!(n >= 0.0 && n <= 1.0, "noise out of [0,1]: {}", n);
    }
}

#[test]
fn test_noise_continuity() {
    let a = noise(0.5, 0.5);
    let b = noise(0.501, 0.5);
    assert!((a - b).abs() < 0.1, "noise not continuous: {} vs {}", a, b);
}

#[test]
fn test_curl_nonzero() {
    let (cx, cy) = curl(1.0, 1.0);
    assert!(cx.abs() + cy.abs() > 0.0, "curl returned zero");
}

#[test]
fn test_smoothstep_boundaries() {
    assert_eq!(smoothstep(0.0, 1.0, -0.1), 0.0);
    assert_eq!(smoothstep(0.0, 1.0, 0.0), 0.0);
    assert_eq!(smoothstep(0.0, 1.0, 1.0), 1.0);
    assert_eq!(smoothstep(0.0, 1.0, 1.5), 1.0);
    let mid = smoothstep(0.0, 1.0, 0.5);
    assert!((mid - 0.5).abs() < 0.01);
}

#[test]
fn test_ease_in_out_cubic() {
    assert!((ease_in_out_cubic(0.0)).abs() < 0.001);
    assert!((ease_in_out_cubic(1.0) - 1.0).abs() < 0.001);
    assert!((ease_in_out_cubic(0.5) - 0.5).abs() < 0.001);
    // Monotonically increasing
    let mut prev = 0.0;
    for i in 1..=100 {
        let t = i as f32 / 100.0;
        let v = ease_in_out_cubic(t);
        assert!(v >= prev, "not monotonic at t={}: {} < {}", t, v, prev);
        prev = v;
    }
}

#[test]
fn test_fbm_range() {
    for i in 0..50 {
        let v = fbm(i as f32 * 0.3, i as f32 * 0.7);
        assert!(v.is_finite(), "fbm produced non-finite: {}", v);
    }
}

#[test]
fn test_smoothstep_equal_edges() {
    // When edge0 == edge1, should not produce NaN
    let r1 = smoothstep(0.5, 0.5, 0.3);
    let r2 = smoothstep(0.5, 0.5, 0.5);
    let r3 = smoothstep(0.5, 0.5, 0.7);
    assert!(r1.is_finite(), "smoothstep with equal edges should be finite");
    assert!(r2.is_finite(), "smoothstep with equal edges should be finite");
    assert!(r3.is_finite(), "smoothstep with equal edges should be finite");
    assert_eq!(r1, 0.0, "x < edge should return 0.0");
    assert_eq!(r3, 1.0, "x > edge should return 1.0");
}

#[test]
fn test_smoothstep_inverted_edges() {
    // smoothstep(0.5, 0.0, x) — inverted edges are used in solver.rs
    let r = smoothstep(0.5, 0.0, 0.25);
    assert!(r.is_finite());
    assert!(r > 0.0 && r < 1.0, "inverted smoothstep at midpoint should be between 0 and 1: {}", r);
}

#[test]
fn test_fract_negative_inputs() {
    // Unlike f32::fract(), our fract should always return [0, 1)
    let r1 = fract(-0.3);
    assert!((r1 - 0.7).abs() < 1e-6, "fract(-0.3) should be 0.7, got {}", r1);
    let r2 = fract(-1.5);
    assert!((r2 - 0.5).abs() < 1e-6, "fract(-1.5) should be 0.5, got {}", r2);
    let r3 = fract(-0.0);
    assert!(r3 >= 0.0 && r3 < 1.0, "fract(-0.0) should be in [0,1), got {}", r3);
}

#[test]
fn test_lerp_basic() {
    assert!((lerp(0.0, 1.0, 0.0) - 0.0).abs() < 1e-6);
    assert!((lerp(0.0, 1.0, 1.0) - 1.0).abs() < 1e-6);
    assert!((lerp(0.0, 1.0, 0.5) - 0.5).abs() < 1e-6);
    assert!((lerp(2.0, 4.0, 0.25) - 2.5).abs() < 1e-6);
}

#[test]
fn test_hash_functions_negative_inputs() {
    // hash11 with negative input should still be in [0, 1)
    let h1 = hash11(-5.0);
    assert!(h1 >= 0.0 && h1 < 1.0, "hash11(-5.0) out of range: {}", h1);
    let h2 = hash11(-100.0);
    assert!(h2 >= 0.0 && h2 < 1.0, "hash11(-100.0) out of range: {}", h2);

    // hash12 with negative inputs
    let h3 = hash12(-3.0, -7.0);
    assert!(h3 >= 0.0 && h3 < 1.0, "hash12(-3,-7) out of range: {}", h3);

    // hash22 with negative inputs
    let (a, b) = hash22(-1.0, -2.0);
    assert!(a >= 0.0 && a < 1.0, "hash22 x out of range: {}", a);
    assert!(b >= 0.0 && b < 1.0, "hash22 y out of range: {}", b);
}

#[test]
fn test_noise_negative_inputs() {
    let n = noise(-5.0, -3.0);
    assert!(n >= 0.0 && n <= 1.0, "noise(-5,-3) out of range: {}", n);
}

#[test]
fn test_fbm_nonnegative() {
    // fbm is sum of noise octaves, each in [0,1], so result should be >= 0
    for i in 0..20 {
        let x = (i as f32) * 0.7 - 5.0;
        let y = (i as f32) * 0.3 - 3.0;
        let v = fbm(x, y);
        assert!(v >= 0.0, "fbm({},{}) should be non-negative, got {}", x, y, v);
        assert!(v.is_finite(), "fbm({},{}) should be finite", x, y);
    }
}
