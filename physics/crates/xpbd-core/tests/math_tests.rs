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
