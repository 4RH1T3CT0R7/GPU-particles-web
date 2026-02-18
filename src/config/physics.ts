/**
 * Physics and simulation constants
 */

// Velocity cap (simulation.glsl clamps speed to this)
export const MAX_VELOCITY = 18.0;

// Boundary sphere — particles pulled back inside this radius
export const ROAM_RADIUS = 4.5;

// Max frame delta to prevent spiral-of-death on tab switch
export const MAX_DELTA_TIME = 0.05;

// Camera distance limits (zoom)
export const CAMERA_DIST_MIN = 1.0;
export const CAMERA_DIST_MAX = 12.0;
export const CAMERA_DIST_DEFAULT = 3.5;
export const CAMERA_ZOOM_LERP = 0.1;

// Shape attraction defaults
export const SHAPE_STRENGTH_DEFAULT = 0.85;
