/// Adaptive quality controller.
///
/// Monitors physics frame times and automatically adjusts substeps and
/// solver iterations to maintain a target frame budget. When the physics
/// step exceeds the budget, quality is reduced. When it consistently
/// stays under budget, quality is gradually restored.
pub struct AdaptiveQuality {
    /// Target physics budget in milliseconds (default: 8.0ms for 60fps with headroom).
    pub budget_ms: f32,
    /// Minimum allowed substeps.
    pub min_substeps: u32,
    /// Maximum allowed substeps (the "full quality" setting).
    pub max_substeps: u32,
    /// Minimum allowed solver iterations.
    pub min_iterations: u32,
    /// Maximum allowed solver iterations.
    pub max_iterations: u32,
    /// Whether adaptive quality is enabled.
    pub enabled: bool,
    /// Current recommended substeps.
    current_substeps: u32,
    /// Current recommended iterations.
    current_iterations: u32,
    /// Exponential moving average of physics frame time.
    ema_ms: f32,
    /// Number of consecutive frames under budget (for quality restoration).
    frames_under_budget: u32,
}

impl AdaptiveQuality {
    pub fn new(max_substeps: u32, max_iterations: u32) -> Self {
        Self {
            budget_ms: 8.0,
            min_substeps: 1,
            max_substeps,
            min_iterations: 1,
            max_iterations,
            enabled: false,
            current_substeps: max_substeps,
            current_iterations: max_iterations,
            ema_ms: 0.0,
            frames_under_budget: 0,
        }
    }

    /// Get current recommended substeps.
    pub fn substeps(&self) -> u32 {
        if self.enabled {
            self.current_substeps
        } else {
            self.max_substeps
        }
    }

    /// Get current recommended iterations.
    pub fn iterations(&self) -> u32 {
        if self.enabled {
            self.current_iterations
        } else {
            self.max_iterations
        }
    }

    /// Update the controller with the latest physics frame time.
    ///
    /// Call this after each `step()` with the measured physics time in ms.
    pub fn update(&mut self, physics_ms: f32) {
        if !self.enabled {
            return;
        }

        // EMA with alpha=0.3 for responsiveness
        self.ema_ms = self.ema_ms * 0.7 + physics_ms * 0.3;

        if self.ema_ms > self.budget_ms {
            // Over budget — reduce quality
            self.frames_under_budget = 0;

            // First reduce iterations, then substeps
            if self.current_iterations > self.min_iterations {
                self.current_iterations -= 1;
            } else if self.current_substeps > self.min_substeps {
                self.current_substeps -= 1;
                // Restore iterations when dropping a substep
                self.current_iterations = self.max_iterations;
            }
        } else if self.ema_ms < self.budget_ms * 0.6 {
            // Well under budget — gradually restore quality
            self.frames_under_budget += 1;

            // Wait 30 frames before increasing (avoid oscillation)
            if self.frames_under_budget > 30 {
                self.frames_under_budget = 0;

                // First restore iterations, then substeps
                if self.current_iterations < self.max_iterations {
                    self.current_iterations += 1;
                } else if self.current_substeps < self.max_substeps {
                    self.current_substeps += 1;
                    // Reset iterations to min when adding substep
                    self.current_iterations = self.min_iterations;
                }
            }
        } else {
            // In acceptable range — slowly count toward restoration
            self.frames_under_budget = self.frames_under_budget.saturating_add(1).min(15);
        }
    }
}

/// Timing statistics from a single physics step.
#[derive(Clone, Copy, Default)]
pub struct StepStats {
    /// Total physics step time in milliseconds.
    pub total_ms: f32,
    /// Number of substeps executed.
    pub substeps: u32,
    /// Number of solver iterations per substep.
    pub iterations: u32,
    /// Number of active particles.
    pub particle_count: u32,
    /// Number of contact constraints detected.
    pub contact_count: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adaptive_reduces_on_overbudget() {
        let mut aq = AdaptiveQuality::new(4, 3);
        aq.enabled = true;
        aq.budget_ms = 8.0;
        aq.ema_ms = 0.0;

        // Simulate several over-budget frames
        for _ in 0..10 {
            aq.update(12.0);
        }

        // Should have reduced quality
        assert!(
            aq.substeps() < 4 || aq.iterations() < 3,
            "Quality should be reduced: substeps={}, iterations={}",
            aq.substeps(),
            aq.iterations()
        );
    }

    #[test]
    fn test_adaptive_restores_under_budget() {
        let mut aq = AdaptiveQuality::new(4, 3);
        aq.enabled = true;
        aq.budget_ms = 8.0;

        // Start at reduced quality
        aq.current_substeps = 2;
        aq.current_iterations = 1;
        aq.ema_ms = 3.0;

        // Simulate many under-budget frames
        for _ in 0..100 {
            aq.update(2.0);
        }

        // Should have restored some quality
        assert!(
            aq.substeps() > 2 || aq.iterations() > 1,
            "Quality should be partially restored: substeps={}, iterations={}",
            aq.substeps(),
            aq.iterations()
        );
    }

    #[test]
    fn test_adaptive_disabled_uses_max() {
        let aq = AdaptiveQuality::new(4, 3);
        assert!(!aq.enabled);
        assert_eq!(aq.substeps(), 4);
        assert_eq!(aq.iterations(), 3);
    }

    #[test]
    fn test_adaptive_never_below_minimum() {
        let mut aq = AdaptiveQuality::new(4, 3);
        aq.enabled = true;
        aq.min_substeps = 1;
        aq.min_iterations = 1;

        // Massive overbudget
        for _ in 0..100 {
            aq.update(100.0);
        }

        assert!(aq.substeps() >= 1);
        assert!(aq.iterations() >= 1);
    }

    #[test]
    fn test_acceptable_range_no_quality_change() {
        // When EMA is between 60% and 100% of budget, quality should NOT change
        let mut aq = AdaptiveQuality::new(4, 3);
        aq.enabled = true;
        aq.budget_ms = 8.0;
        aq.ema_ms = 0.0;

        // Send values in acceptable range (4.8 < x < 8.0)
        // After some warmup, 6.0 should land in acceptable range
        for _ in 0..50 {
            aq.update(6.0);
        }

        // Quality should remain at max since we never exceeded budget
        assert_eq!(aq.substeps(), 4, "substeps should stay at max in acceptable range");
        assert_eq!(aq.iterations(), 3, "iterations should stay at max in acceptable range");
    }

    #[test]
    fn test_reduction_order_iterations_first() {
        let mut aq = AdaptiveQuality::new(4, 3);
        aq.enabled = true;
        aq.budget_ms = 8.0;
        aq.ema_ms = 10.0; // start above budget

        // First reduction: iterations 3 -> 2
        aq.update(12.0);
        assert_eq!(aq.iterations(), 2, "First reduction should lower iterations");
        assert_eq!(aq.substeps(), 4, "Substeps should still be at max");

        // Second reduction: iterations 2 -> 1
        aq.update(12.0);
        assert_eq!(aq.iterations(), 1);
        assert_eq!(aq.substeps(), 4);

        // Third reduction: substeps 4 -> 3, iterations restored to max (3)
        aq.update(12.0);
        assert_eq!(aq.substeps(), 3, "Substeps should drop after iterations bottomed out");
        assert_eq!(aq.iterations(), 3, "Iterations should be restored to max after substep drop");
    }

    #[test]
    fn test_restoration_requires_30_frames() {
        let mut aq = AdaptiveQuality::new(4, 3);
        aq.enabled = true;
        aq.budget_ms = 8.0;
        aq.current_substeps = 2;
        aq.current_iterations = 1;
        aq.ema_ms = 2.0; // well under budget

        // Send 30 under-budget frames — should NOT restore yet
        for _ in 0..30 {
            aq.update(2.0);
        }
        assert_eq!(aq.iterations(), 1, "Should not restore at exactly 30 frames");

        // Frame 31 should trigger restoration
        aq.update(2.0);
        assert_eq!(aq.iterations(), 2, "Frame 31 should restore iterations");
    }

    #[test]
    fn test_disabled_update_no_effect() {
        let mut aq = AdaptiveQuality::new(4, 3);
        // enabled = false by default

        for _ in 0..100 {
            aq.update(100.0); // extreme overbudget
        }

        // Should still report max quality
        assert_eq!(aq.substeps(), 4);
        assert_eq!(aq.iterations(), 3);
    }
}
