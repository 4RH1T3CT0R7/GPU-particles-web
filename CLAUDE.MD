# CLAUDE.MD - GPU Particle Shapes Project Guide

This document provides guidance for Claude (and other AI assistants) when working with the GPU Particle Shapes codebase.

## Project Overview

**GPU Particle Shapes** is a WebGL2-powered particle system that renders 65,000+ particles in real-time, creating fluid morphing clouds that transition between various 3D mathematical shapes. The project is built with vanilla JavaScript and requires no external dependencies.

**Live Demo:** [GPU Particle Shapes](https://github.com/4RH1T3CT0R7/GPU-particles-web)

## Core Technologies

- **WebGL2** - Hardware-accelerated graphics rendering
- **GPGPU (General-Purpose GPU)** - Particle physics computed entirely on GPU
- **Transform Feedback** - GPU-based particle state updates
- **Floating-Point Textures** - Particle state storage
- **Vanilla JavaScript (ES6+)** - No frameworks or build tools

## Project Structure

```
GPU-particles-web/
├── index.html          # Main HTML with embedded CSS (UI controls, layout)
├── index.js            # Core particle system (WebGL2, shaders, physics)
├── package.json        # Project metadata
├── README.md           # User-facing documentation
├── LICENSE.md          # MIT License
└── CLAUDE.MD           # This file (AI assistant guidance)
```

## Key Files

### index.html (18KB)
- Complete HTML structure with embedded CSS
- Control panel UI elements (sliders, buttons, dropdowns)
- Canvas element for WebGL rendering
- Responsive layout with left sidebar controls
- No external CSS dependencies

### index.js (64KB)
The heart of the application containing:

**Main Components:**
1. **WebGL2 Context & Initialization** (~lines 1-100)
   - Canvas setup, WebGL2 context creation
   - Extension checking and feature detection

2. **Shader Programs** (~lines 100-400)
   - Vertex shaders for particle rendering and computation
   - Fragment shaders for visual effects
   - Transform feedback setup

3. **Shape Generators** (~lines 400-800)
   - Mathematical shape functions (sphere, cube, torus, helix, etc.)
   - Position calculation algorithms
   - Morphing interpolation logic

4. **Particle System Core** (~lines 800-1200)
   - Particle initialization
   - GPU buffer management
   - Transform feedback loop
   - State management (positions, velocities, colors)

5. **Physics & Interactions** (~lines 1200-1600)
   - Cursor interaction modes (attract, repel, vortex, pulse, etc.)
   - Shape morphing forces
   - Velocity damping and acceleration

6. **Rendering Pipeline** (~lines 1600-2000)
   - Draw calls and buffer swapping
   - Camera controls (rotation, zoom)
   - Trail effects and blending

7. **UI Event Handlers** (~lines 2000-end)
   - Control panel bindings
   - Mouse/touch input processing
   - Parameter updates and validation

## Technical Architecture

### GPU-Based Particle System

The particle system uses **ping-pong buffering** with transform feedback:

1. **Particle State:** Stored in floating-point textures (RGBA32F)
   - Position (x, y, z) + metadata
   - Velocity (vx, vy, vz) + age/life
   - Color (r, g, b, a)

2. **Update Loop:**
   ```
   GPU Buffer A (current state)
     → Vertex Shader (compute physics)
     → Transform Feedback
     → GPU Buffer B (next state)

   Swap buffers each frame
   ```

3. **Rendering:** Points/particles drawn with additive blending for glow effects

### Shader Architecture

**Vertex Shaders:**
- Compute shader: Updates particle physics (positions, velocities)
- Render shader: Transforms particles for display

**Fragment Shaders:**
- Particle appearance (color gradients, alpha blending)
- Trail effects (motion blur via canvas persistence)

### Particle Textures

- Maximum size: 384×384 = 147,456 particles
- Default: 256×256 = 65,536 particles
- Data stored as RGBA float textures
- Each pixel = one particle's state

## Shape System

### Available Shapes

| Shape | Description | Key Features |
|-------|-------------|--------------|
| Sphere | Perfect sphere | Uniform distribution on surface |
| Cube | Cubic form | Edge and face particles |
| Torus | Donut shape | Major/minor radius control |
| Helix | Spiral structure | Customizable turns and radius |
| Galaxy | Spiral galaxy | Arms with particle density variation |
| Cloud | Organic cluster | Random distribution with falloff |
| Plane | Flat surface | 2D arrangement in 3D space |
| Cylinder | Cylindrical form | Radial symmetry |

### Shape Morphing

- Interpolation between source and target shapes
- Attraction force pulls particles toward target positions
- Configurable morph speed (4-30 seconds)
- Auto-transition mode cycles through shapes

## Cursor Interaction Modes

Each mode applies forces to particles within cursor radius:

1. **Attract** - Linear attraction to cursor position
2. **Repel** - Radial repulsion with acceleration
3. **Vortex Left/Right** - Tangential force creating rotation
4. **Pulse** - Radial waves emanating from cursor
5. **Quasar** - Turbulent ejection with randomness
6. **Magnet** - Magnetic field-like curved paths

## Color System

- Dynamic gradient palettes (2-6 colors)
- Particle color based on position/velocity
- Palette shuffling with smooth transitions
- Multiple pre-defined color schemes

## Development Guidelines

### When Adding New Features

1. **New Shapes:**
   - Add shape generator function in shape definitions section
   - Return array of {x, y, z} positions
   - Add to shape selector UI in index.html
   - Ensure particle count compatibility

2. **New Cursor Modes:**
   - Implement force calculation in interaction handler
   - Add to cursor mode enum/selector
   - Update UI dropdown in index.html
   - Document the effect behavior

3. **Performance Optimization:**
   - Profile with browser DevTools (GPU usage, FPS)
   - Check shader compilation errors in console
   - Monitor texture memory usage
   - Test with various particle counts (1K to 100K+)

### Code Patterns

**Shader Compilation:**
```javascript
const shader = gl.createShader(type);
gl.shaderSource(shader, source);
gl.compileShader(shader);
// Always check compilation status
```

**Buffer Management:**
```javascript
// Ping-pong pattern
gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, targetBuffer);
gl.beginTransformFeedback(gl.POINTS);
gl.drawArrays(gl.POINTS, 0, particleCount);
gl.endTransformFeedback();
// Swap buffers
[currentBuffer, targetBuffer] = [targetBuffer, currentBuffer];
```

**Uniform Updates:**
```javascript
// Set uniforms before draw call
gl.uniform3f(locationId, x, y, z);
gl.uniformMatrix4fv(matrixLoc, false, matrix);
```

### Common Tasks

**Adding a New Shape:**
1. Create shape generator function
2. Add to shape array/object
3. Update HTML select options
4. Test morphing transitions

**Modifying Physics:**
1. Locate relevant shader code (vertex shader)
2. Update force calculations
3. Adjust uniform parameters
4. Test performance impact

**Changing Visual Effects:**
1. Modify fragment shader
2. Adjust blending modes
3. Update color calculations
4. Test on different backgrounds

## Debugging Tips

### WebGL2 Errors

```javascript
// Enable WebGL error checking
function checkGLError(gl, label) {
  const err = gl.getError();
  if (err !== gl.NO_ERROR) {
    console.error(`WebGL Error at ${label}: ${err}`);
  }
}
```

### Shader Debugging

1. Check compilation logs:
   ```javascript
   const log = gl.getShaderInfoLog(shader);
   if (log) console.warn('Shader log:', log);
   ```

2. Validate uniform locations (should not be -1)
3. Check texture binding points (0-15 typically available)
4. Verify buffer sizes match particle count

### Performance Profiling

- Use Chrome DevTools → Performance → Record
- Monitor FPS with `requestAnimationFrame` timestamps
- Check GPU memory in browser task manager
- Test particle count scaling (2K, 4K, 8K, 16K, 32K, 64K)

## Browser Compatibility

**Minimum Requirements:**
- WebGL2 support (check with `canvas.getContext('webgl2')`)
- Floating-point texture support (`EXT_color_buffer_float`)
- Transform feedback support (core WebGL2 feature)

**Tested Browsers:**
- Chrome 56+ ✅
- Firefox 51+ ✅
- Safari 15+ ✅
- Edge 79+ ✅

## Important Notes for AI Assistants

### DO:
- ✅ Test WebGL2 features before using (check for null context)
- ✅ Validate shader compilation and linking
- ✅ Check uniform locations exist before setting
- ✅ Consider performance impact of changes (GPU bound)
- ✅ Maintain consistent coding style (ES6+, camelCase)
- ✅ Comment complex shader code
- ✅ Test across different particle counts

### DON'T:
- ❌ Add external dependencies (keep it vanilla JS)
- ❌ Use WebGL1 features (project requires WebGL2)
- ❌ Ignore shader compilation errors
- ❌ Create memory leaks (cleanup buffers/textures)
- ❌ Hardcode values (use configurable parameters)
- ❌ Break backward compatibility without discussion
- ❌ Add build tools or transpilation steps

### When Making Changes:

1. **Read First:** Always read relevant code sections before modifying
2. **Test Locally:** Ensure changes work in a browser
3. **Check Performance:** Profile FPS impact with DevTools
4. **Validate Shaders:** Check for compilation/linking errors
5. **Document:** Add comments for complex logic
6. **Commit Clearly:** Use descriptive commit messages

## Testing Workflow

### Manual Testing Checklist

- [ ] Particle system initializes without errors
- [ ] All shapes render correctly
- [ ] Morphing transitions work smoothly
- [ ] Cursor interactions function as expected
- [ ] UI controls update parameters correctly
- [ ] Performance maintains 60 FPS (at default 65K particles)
- [ ] No WebGL errors in console
- [ ] Works on different screen sizes
- [ ] Touch controls work on mobile (if applicable)

### Performance Benchmarks

| Particle Count | Expected FPS | GPU Usage |
|----------------|--------------|-----------|
| 4,096 (64×64) | 60 FPS | Low (~20%) |
| 16,384 (128×128) | 60 FPS | Medium (~40%) |
| 65,536 (256×256) | 60 FPS | High (~70%) |
| 147,456 (384×384) | 30-60 FPS | Very High (~90%) |

*Benchmarks on mid-range GPU (GTX 1060 / RX 580 equivalent)*

## Code Style Guide

```javascript
// Function naming: camelCase
function calculateParticleForce() {}

// Constants: UPPER_SNAKE_CASE
const MAX_PARTICLE_COUNT = 147456;

// Variables: camelCase
let particleSpeed = 1.0;

// Shader code: GLSL conventions
// - Uniforms: u_variableName
// - Attributes: a_variableName
// - Varyings: v_variableName

// Comments: Clear and concise
// Good: "Calculate attraction force to target shape"
// Bad: "Do force stuff"
```

## Resources

- [WebGL2 Fundamentals](https://webgl2fundamentals.org/)
- [Transform Feedback Tutorial](https://open.gl/feedback)
- [GPU Particle Systems](https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-23-high-speed-high-quality-rendering)
- [GLSL Reference](https://www.khronos.org/files/opengles_shading_language.pdf)

## Contact & Contributions

- **Author:** 4RH1T3CT0R7
- **Repository:** https://github.com/4RH1T3CT0R7/GPU-particles-web
- **License:** MIT

When contributing:
1. Fork the repository
2. Create feature branch (`git checkout -b feature/NewFeature`)
3. Test thoroughly
4. Commit with clear messages
5. Open pull request with description

---

**Last Updated:** 2025-12-28
**Version:** 1.0
**For Claude Code & AI Assistants**
