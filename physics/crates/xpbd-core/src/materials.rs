use crate::config::PhysicsConfig;

/// Material preset for quick configuration of fluid/particle behavior.
#[derive(Clone, Copy, Debug)]
pub struct MaterialPreset {
    pub rest_density: f32,
    pub viscosity: f32,
    pub vorticity: f32,
    pub particle_radius: f32,
    pub friction: f32,
    pub restitution: f32,
}

impl MaterialPreset {
    /// Water: medium density, low viscosity, moderate vorticity.
    pub const WATER: Self = Self {
        rest_density: 1000.0,
        viscosity: 0.01,
        vorticity: 0.1,
        particle_radius: 0.04,
        friction: 0.1,
        restitution: 0.3,
    };

    /// Gas/Smoke: very low density, very low viscosity, high vorticity.
    pub const GAS: Self = Self {
        rest_density: 10.0,
        viscosity: 0.005,
        vorticity: 0.3,
        particle_radius: 0.08,
        friction: 0.0,
        restitution: 0.0,
    };

    /// Honey: high density, high viscosity, low vorticity.
    pub const HONEY: Self = Self {
        rest_density: 1400.0,
        viscosity: 0.5,
        vorticity: 0.02,
        particle_radius: 0.03,
        friction: 0.4,
        restitution: 0.1,
    };

    /// Sand/Granular: moderate density, no viscosity, high friction.
    pub const SAND: Self = Self {
        rest_density: 1600.0,
        viscosity: 0.0,
        vorticity: 0.0,
        particle_radius: 0.03,
        friction: 0.7,
        restitution: 0.05,
    };

    /// Apply this material preset to a physics config.
    pub fn apply_to(&self, config: &mut PhysicsConfig) {
        config.fluid_rest_density = self.rest_density;
        config.fluid_viscosity = self.viscosity;
        config.fluid_vorticity = self.vorticity;
        config.friction = self.friction;
        config.restitution = self.restitution;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_material_presets_valid() {
        // All presets should have positive density and non-negative values
        for (name, preset) in [
            ("water", MaterialPreset::WATER),
            ("gas", MaterialPreset::GAS),
            ("honey", MaterialPreset::HONEY),
            ("sand", MaterialPreset::SAND),
        ] {
            assert!(preset.rest_density > 0.0, "{} density must be positive", name);
            assert!(preset.viscosity >= 0.0, "{} viscosity must be non-negative", name);
            assert!(preset.particle_radius > 0.0, "{} radius must be positive", name);
            assert!(preset.friction >= 0.0, "{} friction must be non-negative", name);
            assert!(preset.restitution >= 0.0 && preset.restitution <= 1.0,
                "{} restitution must be in [0,1]", name);
        }
    }

    #[test]
    fn test_apply_material_preset() {
        let mut config = PhysicsConfig::default();
        MaterialPreset::HONEY.apply_to(&mut config);
        assert_eq!(config.fluid_rest_density, 1400.0);
        assert_eq!(config.fluid_viscosity, 0.5);
    }
}
