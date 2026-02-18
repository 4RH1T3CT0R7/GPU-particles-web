use glam::Vec3;
use std::f32::consts::PI;
use xpbd_core::fluids::{poly6_kernel, spiky_gradient};

#[test]
fn test_poly6_kernel_zero_distance() {
    let h = 0.1_f32;
    let result = poly6_kernel(0.0, h);
    let h9 = h.powi(9);
    let expected = 315.0 / (64.0 * PI * h9);
    // At r=0 the (h^2 - r^2)^3 term equals h^6, so peak = coeff * h^6
    let peak = expected * h.powi(6);
    assert!(
        (result - peak).abs() < peak * 1e-5,
        "poly6(0, {h}) = {result}, expected {peak}"
    );
}

#[test]
fn test_poly6_kernel_at_boundary() {
    let h = 0.1_f32;
    let result = poly6_kernel(h, h);
    assert_eq!(result, 0.0, "poly6(h, h) should be 0.0");
}

#[test]
fn test_poly6_kernel_beyond_boundary() {
    let h = 0.1_f32;
    let result = poly6_kernel(h + 0.01, h);
    assert_eq!(result, 0.0, "poly6(h+0.01, h) should be 0.0");
}

#[test]
fn test_poly6_kernel_midpoint() {
    let h = 0.1_f32;
    let mid = poly6_kernel(h / 2.0, h);
    let h9 = h.powi(9);
    let peak = 315.0 / (64.0 * PI * h9) * h.powi(6);
    assert!(mid > 0.0, "poly6(h/2, h) should be positive");
    assert!(mid < peak, "poly6(h/2, h) should be less than peak");
}

#[test]
fn test_spiky_gradient_zero_distance() {
    let r = Vec3::new(1e-7, 0.0, 0.0);
    let r_len = r.length();
    let result = spiky_gradient(r, r_len, 0.1);
    assert_eq!(result, Vec3::ZERO, "spiky_gradient with near-zero r_len should return ZERO");
}

#[test]
fn test_spiky_gradient_at_boundary() {
    let h = 0.1_f32;
    let r = Vec3::new(h, 0.0, 0.0);
    let result = spiky_gradient(r, h, h);
    assert_eq!(result, Vec3::ZERO, "spiky_gradient at boundary should return ZERO");
}

#[test]
fn test_spiky_gradient_direction() {
    let h = 0.1_f32;
    let r = Vec3::new(0.05, 0.0, 0.0);
    let r_len = r.length();
    let grad = spiky_gradient(r, r_len, h);

    // The coefficient -45/(PI*h^6) is negative, so the gradient points
    // opposite to r (toward the neighbor). The x component should be negative
    // since r points in +x and the coefficient is negative.
    assert!(
        grad.x < 0.0,
        "gradient x should be negative (pointing toward neighbor), got {}",
        grad.x
    );
    assert!(
        grad.y.abs() < 1e-10,
        "gradient y should be ~0, got {}",
        grad.y
    );
    assert!(
        grad.z.abs() < 1e-10,
        "gradient z should be ~0, got {}",
        grad.z
    );
}
