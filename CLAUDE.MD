# CLAUDE.MD - GPU Particle Shapes Project Guide

This document provides guidance for Claude (and other AI assistants) when working with the GPU Particle Shapes codebase.

## Project Overview

**GPU Particle Shapes** is a WebGL2-powered particle system that renders 65,000+ particles in real-time, creating fluid morphing clouds that transition between various 3D mathematical shapes. The project is built with vanilla JavaScript and requires no external dependencies.

**Live Demo:** [GPU Particle Shapes](https://github.com/4RH1T3CT0R7/GPU-particles-web)

## Core Technologies

- **WebGL2** - Hardware-accelerated graphics rendering
- **GPGPU (General-Purpose GPU)** - Particle physics computed entirely on GPU
- **Framebuffer-based Rendering** - GPU-based particle state updates using Multiple Render Targets (MRT)
- **Floating-Point Textures** - Particle state storage (RGBA32F)
- **Ping-Pong Buffering** - Double-buffered texture swapping for particle updates
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

### index.js (64KB, 1758 lines)
The heart of the application containing:

**Main Components:**
1. **WebGL2 Context & Initialization** (start of file)
   - Canvas setup, WebGL2 context creation (line 13)
   - Extension checking (EXT_color_buffer_float, line 21)
   - GPU limits detection and utility functions

2. **Shader Programs** (lines ~60-800)
   - Simulation vertex shader: Full-screen quad for GPGPU
   - Simulation fragment shader: Physics computation (lines 130-700+)
   - Particle rendering vertex shader: Position lookup and transform
   - Particle rendering fragment shader: Visual appearance
   - Shape generator functions (GLSL): Lines 154-238
     - shape_cube, shape_sphere, shape_torus, shape_helix
     - shape_octahedron, shape_wave, shape_ribbon, shape_icosahedron

3. **Texture & Framebuffer Setup** (lines ~800-900)
   - Floating-point texture creation
   - Framebuffer setup with Multiple Render Targets (MRT)
   - Ping-pong buffer initialization

4. **Input & Interaction System** (lines ~990-1050)
   - Mouse/touch event handlers
   - Cursor position tracking (2D screen to 3D world)
   - Pointer state management
   - Camera rotation and zoom controls

5. **Animation Loop & Physics** (lines ~1200-1405)
   - Main render loop with requestAnimationFrame
   - Shape morphing logic and auto-transition
   - GPGPU simulation pass with MRT (lines 1330-1364)
   - Particle rendering pass (lines 1366-1394)
   - Camera matrix updates and uniform uploads

6. **UI Controls & Event Handlers** (lines ~1410-end)
   - Shape button generation and selection
   - Slider inputs (speed, attraction, particle count, colors)
   - Color palette system and shuffling
   - Mode switching (Shapes/Free Flight/Fractals)
   - Parameter validation and defaults

## Technical Architecture

### GPU-Based Particle System

The particle system uses **framebuffer-based GPGPU** with **ping-pong buffering**:

1. **Particle State:** Stored in floating-point textures (RGBA32F)
   - Position texture: (x, y, z) + metadata
   - Velocity texture: (vx, vy, vz) + age/life
   - Color computed dynamically from position/velocity

2. **Update Loop (Framebuffer-based GPGPU):**
   ```
   Read: Position Texture A + Velocity Texture A
     → Fragment Shader (compute physics via full-screen quad)
     → Multiple Render Targets (MRT)
     → Write: Position Texture B + Velocity Texture B

   Swap texture pairs each frame (ping-pong buffering)
   ```

3. **Rendering:**
   - Particle positions read from texture
   - Each pixel in texture = one particle
   - Points drawn with additive blending (gl.SRC_ALPHA, gl.ONE) for glow effects
   - Point size adjusts based on texture size for consistent appearance

### Shader Architecture

**Simulation Pass (GPGPU via Framebuffer):**
- Vertex Shader: Full-screen quad setup, passes UV coordinates
- Fragment Shader: Computes physics updates (positions, velocities, forces)
  - Reads current particle state from textures
  - Applies shape morphing forces, cursor interactions, and physics
  - Outputs to Multiple Render Targets (MRT): new position + new velocity

**Rendering Pass (Visual Display):**
- Vertex Shader: Reads particle positions from texture, transforms to screen space
- Fragment Shader: Computes particle appearance
  - Dynamic color gradients based on particle properties
  - Alpha blending for soft glow effects
  - Iridescent color mixing with energy-based variation

### Particle Textures

- Maximum size: 384×384 = 147,456 particles
- Default: 256×256 = 65,536 particles
- Data stored as RGBA float textures
- Each pixel = one particle's state

## Rendering Modes

The application supports **three distinct rendering modes**:

### 1. Shapes Mode (Default)
- Particles morph between predefined mathematical shapes
- Automatic shape transitions available
- Configurable attraction force pulls particles toward target shape
- Smooth interpolation between source and target

### 2. Free Flight Mode
- Particles move freely in 3D space
- No shape constraints
- Natural flow and turbulence effects
- Emphasis on fluid dynamics and cursor interactions

### 3. Fractals Mode
- Emergent fractal-like patterns from particle interactions
- Self-organizing behavior
- Special fractal shape ID triggers unique physics
- Complex visual structures emerge from simple rules

**Mode Switching:** Users can switch between modes via UI buttons (index.html:390-392)

---

## Shape System

### Available Shapes

The system includes **11 mathematical shapes** that particles can morph between:

| Shape | Description | Key Features |
|-------|-------------|--------------|
| Cube | Cubic form | Uniform surface distribution with edge definition |
| Sphere | Perfect sphere | Spherical coordinates with even distribution |
| Torus | Donut shape | Major/minor radius with smooth topology |
| Helix | Spiral structure | Parametric spiral with controllable pitch |
| Octahedron | 8-faced polyhedron | Platonic solid with symmetrical faces |
| Superformula | Parametric surface | Complex organic shapes via superellipse formula |
| Rose | Mathematical curve | Polar rose pattern in 3D space |
| Wave | Procedural surface | Sinusoidal wave patterns |
| Ribbon | 3D parametric curve | Twisted ribbon topology |
| Icosahedron | 20-faced polyhedron | Complex platonic solid structure |
| Polygon | Configurable polygon | Adjustable vertex count and radius |

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

**Framebuffer Management (Ping-Pong Pattern):**
```javascript
// Render to framebuffer with Multiple Render Targets
const writeFBO = simFBO[simRead];
gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

// Bind input textures (current state)
bindTex(progSim, 'u_pos', posTex[simRead], 0);
bindTex(progSim, 'u_vel', velTex[simRead], 1);

// Render full-screen quad to compute new state
drawQuad();

// Swap texture indices (ping-pong)
simRead = 1 - simRead;
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
- Floating-point texture support (`EXT_color_buffer_float` extension)
- Multiple Render Targets (MRT) support (core WebGL2 feature)
- Floating-point texture rendering capability

**Tested Browsers:**
- Chrome 56+ ✅ (Full WebGL2 support)
- Firefox 51+ ✅ (Full WebGL2 support)
- Safari 15+ ✅ (WebGL2 support added)
- Edge 79+ ✅ (Chromium-based, full support)

**Notes:**
- The application checks for WebGL2 availability on startup
- Alerts users if required extensions are unavailable
- Works best on systems with dedicated GPUs for optimal performance

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
- ❌ Create memory leaks (cleanup buffers/textures/framebuffers)
- ❌ Hardcode values (use configurable parameters)
- ❌ Break backward compatibility without discussion
- ❌ Add build tools or transpilation steps
- ❌ Assume transform feedback is used (it's framebuffer-based GPGPU)

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

### WebGL & Graphics Programming
- [WebGL2 Fundamentals](https://webgl2fundamentals.org/) - Comprehensive WebGL2 tutorial
- [OpenGL Transform Feedback](https://open.gl/feedback) - General GPU compute patterns
- [WebGL2 Specification](https://www.khronos.org/registry/webgl/specs/latest/2.0/) - Official API reference
- [GLSL ES 3.0 Quick Reference](https://www.khronos.org/files/webgl20-reference-guide.pdf) - Shader language guide

### GPGPU Techniques
- [GPGPU on WebGL](https://webglfundamentals.org/webgl/lessons/webgl-gpgpu.html) - Framebuffer-based computation
- [Multiple Render Targets (MRT)](https://webgl2fundamentals.org/webgl/lessons/webgl-render-to-texture.html) - Rendering to multiple textures
- [GPU Particle Systems Overview](https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-29-real-time-rigid-body-simulation-gpus) - General GPU physics concepts

### Mathematical Resources
- [Superformula](https://en.wikipedia.org/wiki/Superformula) - Complex parametric shapes
- [Platonic Solids](https://en.wikipedia.org/wiki/Platonic_solid) - Icosahedron & Octahedron geometry

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
