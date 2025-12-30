# CLAUDE.MD - GPU Particle Shapes Project Guide

This document provides guidance for Claude (and other AI assistants) when working with the GPU Particle Shapes codebase.

## Project Overview

**GPU Particle Shapes** is a dual-version particle visualization system:
1. **WebGL2 Version (Stable)** - 65,000+ particles with interactive morphing
2. **WebGPU Version (Experimental)** - Real-time ray tracing with path-traced global illumination

The project is built with vanilla JavaScript and requires no external dependencies.

**Live Demo:** [GPU Particle Shapes](https://4rh1t3ct0r7.github.io/GPU-particles-web/)

## Core Technologies

### WebGL2 Version
- **WebGL2** - Hardware-accelerated graphics rendering
- **GPGPU (General-Purpose GPU)** - Particle physics computed entirely on GPU
- **Framebuffer-based Rendering** - GPU-based particle state updates using Multiple Render Targets (MRT)
- **Floating-Point Textures** - Particle state storage (RGBA32F)
- **Ping-Pong Buffering** - Double-buffered texture swapping for particle updates
- **Vanilla JavaScript (ES6+)** - No frameworks or build tools

### WebGPU Version (Ray Tracing) ⚡ NEW
- **WebGPU Compute API** - Modern GPU compute with WGSL shaders
- **Ray Tracing Pipeline** - BVH acceleration with iterative traversal
- **Path Tracing** - 1-bounce global illumination with importance sampling
- **Temporal Accumulation** - Exponential moving average denoising
- **PBR Materials** - Cook-Torrance BRDF with metallic-roughness workflow
- **HDR Rendering** - RGBA16F textures with ACES tone mapping

📖 **See [WEBGPU_SETUP.md](WEBGPU_SETUP.md) for complete WebGPU documentation**

## Project Structure

```
GPU-particles-web/
├── index.html              # WebGL2 version HTML
├── index.js                # WebGL2 application entry
├── index-webgpu.html       # WebGPU ray tracing version HTML ⚡
├── index-webgpu.js         # WebGPU application entry ⚡
├── package.json            # Project metadata
├── README.md               # User documentation
├── WEBGPU_SETUP.md         # WebGPU setup guide ⚡
├── LICENSE.md              # MIT License
├── CLAUDE.MD               # This file (AI guidance)
└── src/
    ├── audio/
    │   └── analyzer.js
    ├── camera/
    │   └── controls.js
    ├── config/
    │   └── constants.js
    ├── core/
    │   ├── utils.js
    │   └── webgl.js
    ├── gpu/                # WebGPU infrastructure ⚡
    │   ├── device.js       # WebGPU device init, helpers
    │   └── pipelines.js    # Compute & render pipelines
    ├── rendering/
    │   └── pipeline.js
    ├── shaders/            # GLSL (WebGL2)
    │   ├── blit.js
    │   ├── common.js
    │   ├── init.js
    │   ├── particle.js
    │   ├── pbr.js          # PBR lighting ⚡
    │   ├── shapes.js
    │   └── simulation.js
    ├── shaders-wgsl/       # WGSL (WebGPU) ⚡
    │   ├── blit.wgsl       # Tone mapping
    │   ├── bvh-build.wgsl  # Full LBVH (Morton codes)
    │   ├── bvh-simple.wgsl # Simplified BVH
    │   ├── common.wgsl     # Math, noise, hash
    │   ├── particle-sim.wgsl # Particle physics
    │   ├── pbr.wgsl        # PBR BRDF functions
    │   ├── ray-trace.wgsl  # Ray tracing kernel
    │   └── temporal-accumulation.wgsl # Denoising
    ├── simulation/
    │   └── state.js
    └── ui/
        ├── i18n.js
        └── mobile.js
```

## Key Files & Modules

### WebGL2 Version

#### index.html
- Complete HTML structure with embedded CSS
- Control panel UI elements (sliders, buttons, dropdowns)
- Canvas element for WebGL rendering
- Responsive layout with left sidebar controls
- No external CSS dependencies

#### index.js
- WebGL2 application entry point
- Imports and initializes all modules
- Sets up the main render loop
- Coordinates between different subsystems

### WebGPU Version (Ray Tracing) ⚡

#### index-webgpu.html
- WebGPU version HTML
- Minimal UI (focus on visual quality)
- Feature showcase info panel
- Automatic fallback to WebGL2 if unavailable

#### index-webgpu.js
- WebGPU application entry point
- Pipeline initialization and orchestration
- Ray tracing render loop implementation
- Camera, lights, and parameter management
- BVH construction integration
- Temporal accumulation control

#### src/gpu/device.js
**WebGPU Device & Helpers**
- WebGPU adapter and device initialization
- Canvas context configuration
- Helper functions: createShaderModule, createBuffer, createTexture
- GPU capability detection

#### src/gpu/pipelines.js
**Pipeline Management**
- createSimulationPipeline() - Particle physics compute
- createBVHBuildPipeline() - BVH construction (simplified)
- createRayTracingPipeline() - Ray tracing compute
- createTemporalAccumulationPipeline() - Denoising
- createBlitPipeline() - Final output with tone mapping
- initializePipelines() - Async pipeline initialization

#### src/shaders-wgsl/*.wgsl
**WGSL Compute & Render Shaders**
- **ray-trace.wgsl** - Main ray tracing kernel with path tracing
- **particle-sim.wgsl** - Particle physics simulation
- **bvh-simple.wgsl** - Simplified BVH construction
- **temporal-accumulation.wgsl** - Exponential moving average denoising
- **pbr.wgsl** - Cook-Torrance BRDF functions
- **common.wgsl** - Math, noise, and hash utilities
- **blit.wgsl** - ACES tone mapping and output

### src/core/webgl.js
**WebGL2 Context & Initialization**
- Canvas setup and WebGL2 context creation
- Extension checking (EXT_color_buffer_float)
- GPU limits detection and capability testing
- WebGL state management

### src/core/utils.js
**Utility Functions**
- Helper functions for math operations
- Data structure utilities
- Common operations used across modules

### src/shaders/
**GLSL Shader Programs**

- **simulation.js** - Physics computation shaders
  - Simulation vertex shader: Full-screen quad for GPGPU
  - Simulation fragment shader: Physics updates, forces, morphing
  - Multiple Render Targets (MRT) output for position/velocity

- **particle.js** - Particle rendering shaders
  - Vertex shader: Position lookup from texture, transforms
  - Fragment shader: Visual appearance, colors, blending

- **shapes.js** - Shape generator functions (GLSL)
  - shape_cube, shape_sphere, shape_torus, shape_helix
  - shape_octahedron, shape_wave, shape_ribbon, shape_icosahedron
  - Mathematical shape definitions and generators

- **init.js** - Particle initialization shaders
  - Initial particle state setup
  - Random distribution algorithms

- **blit.js** - Blit/copy operations
  - Texture copying and post-processing
  - Screen-space rendering utilities

- **common.js** - Shared shader utilities
  - Common GLSL functions and definitions
  - Shared constants and helper functions

### src/simulation/state.js
**Particle State Management**
- Floating-point texture creation and management
- Framebuffer setup with Multiple Render Targets (MRT)
- Ping-pong buffer initialization and swapping
- Particle state updates and synchronization

### src/rendering/pipeline.js
**Rendering Pipeline**
- Main render loop orchestration
- GPGPU simulation pass with MRT
- Particle rendering pass
- Frame timing and performance monitoring

### src/camera/controls.js
**Camera System**
- Camera rotation and zoom controls
- View matrix calculations
- Mouse/touch event handlers for camera
- Smooth camera interpolation

### src/ui/mobile.js
**Mobile UI Components**
- Touch event handlers
- Mobile-specific controls and gestures
- Responsive UI adaptations
- Touch-based camera controls

### src/ui/i18n.js
**Internationalization**
- Language support and translations
- Localized UI strings
- Dynamic language switching

### src/audio/analyzer.js
**Audio Analysis**
- Audio input processing
- Frequency analysis for reactive effects
- Audio-driven particle modulation

### src/config/constants.js
**Configuration**
- Global constants and default values
- Particle count limits
- Physics parameters
- Rendering configuration

## Technical Architecture

### Modular Code Organization

The codebase follows a **modular architecture** with clear separation of concerns:

**Module Categories:**
1. **Core** (`src/core/`) - Fundamental WebGL and utility functions
2. **Shaders** (`src/shaders/`) - All GLSL shader code organized by purpose
3. **Simulation** (`src/simulation/`) - Particle state and physics management
4. **Rendering** (`src/rendering/`) - Rendering pipeline and draw orchestration
5. **Camera** (`src/camera/`) - View transformations and controls
6. **UI** (`src/ui/`) - User interface components and interactions
7. **Audio** (`src/audio/`) - Audio analysis and reactive effects
8. **Config** (`src/config/`) - Constants and configuration

**Benefits of Modular Structure:**
- **Maintainability** - Easier to locate and modify specific functionality
- **Testability** - Individual modules can be tested in isolation
- **Reusability** - Modules can be reused across different parts of the application
- **Collaboration** - Multiple developers can work on different modules simultaneously
- **Code Organization** - Clear boundaries and responsibilities for each module

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
1. Create shape generator function in `src/shaders/shapes.js`
2. Add to shape array/object in main application
3. Update HTML select options in `index.html`
4. Test morphing transitions

**Modifying Physics:**
1. Locate relevant shader code in `src/shaders/simulation.js`
2. Update force calculations in simulation fragment shader
3. Adjust uniform parameters in `src/config/constants.js`
4. Update state management in `src/simulation/state.js` if needed
5. Test performance impact

**Changing Visual Effects:**
1. Modify particle fragment shader in `src/shaders/particle.js`
2. Adjust blending modes in `src/rendering/pipeline.js`
3. Update color calculations in shader code
4. Test on different backgrounds

**Adding New UI Controls:**
1. Add HTML elements to `index.html`
2. Implement event handlers in appropriate UI module (`src/ui/`)
3. Update state in `src/simulation/state.js` or relevant module
4. Test responsiveness on mobile devices

**Working with Modules:**
1. Import required modules at the top of files
2. Export functions/objects that other modules need
3. Keep modules focused on single responsibility
4. Avoid circular dependencies between modules

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

## WebGPU Ray Tracing Architecture ⚡

### Render Pipeline Flow

```
Frame N:
1. Particle Simulation (Compute)
   → Updates particle positions and velocities
   → Output: particleBufferA/B (ping-pong)

2. BVH Construction (Compute - 2 passes)
   → Pass 1: Initialize leaf nodes from particles
   → Pass 2: Build root node bounds (parallel reduction)
   → Output: BVH buffer

3. Ray Tracing (Compute)
   → Generate camera rays (8x8 workgroups)
   → Trace BVH for intersections
   → Calculate direct lighting + shadows
   → 1-bounce path tracing for GI
   → Importance sampling (diffuse/specular)
   → Output: HDR texture (rgba16float)

4. Temporal Accumulation (Compute)
   → Blend with history buffer (exponential moving average)
   → Smooth path tracing noise
   → Output: Denoised HDR texture

5. Blit to Canvas (Render)
   → ACES tone mapping
   → Gamma correction (sRGB)
   → Output: Final frame
```

### Key WebGPU Concepts

**Compute Shaders:**
- Work in workgroups (8x8 for ray tracing, 256 for simulation)
- Access storage buffers and storage textures
- No vertex/fragment stages - pure computation

**WGSL Shader Language:**
- Modern GPU shading language
- Type-safe with strict alignment rules
- Built-in functions for common operations
- See [WGSL Spec](https://www.w3.org/TR/WGSL/)

**Buffer Usage:**
- Storage buffers for particle data and BVH
- Uniform buffers for parameters (256-byte aligned)
- Read-only-storage for input, storage for read-write

**Texture Usage:**
- Storage textures (write-only) for compute output
- Sampled textures for reading in shaders
- RGBA16F format for HDR rendering

### WebGPU Development Tips

1. **Shader Compilation:**
   - Check for errors with try-catch
   - WGSL compiler is strict about types and alignment
   - Use `@group()` and `@binding()` decorators

2. **Buffer Alignment:**
   - Structs must follow WGSL alignment rules
   - vec3 is 16-byte aligned (use padding)
   - Arrays of structs need careful layout

3. **Performance:**
   - Group related data in same buffer
   - Minimize buffer updates per frame
   - Use storage textures for large 2D data
   - Prefer compute shaders for parallel work

4. **Debugging:**
   - Use Chrome DevTools WebGPU tab
   - Enable validation layers in device creation
   - Check pipeline compilation logs
   - Monitor GPU memory usage

## Important Notes for AI Assistants

### DO:
- ✅ Test WebGL2 features before using (check for null context)
- ✅ Validate shader compilation and linking
- ✅ Check uniform locations exist before setting
- ✅ Consider performance impact of changes (GPU bound)
- ✅ Maintain consistent coding style (ES6+, camelCase)
- ✅ Comment complex shader code
- ✅ Test across different particle counts
- ✅ **For WebGPU:** Validate WGSL shader syntax and alignment
- ✅ **For WebGPU:** Check WebGPU availability before using
- ✅ **For WebGPU:** Follow buffer alignment rules strictly
- ✅ **For WebGPU:** Test in Chrome Canary with WebGPU enabled

### DON'T:
- ❌ Add external dependencies (keep it vanilla JS)
- ❌ Use WebGL1 features (project requires WebGL2)
- ❌ Ignore shader compilation errors
- ❌ Create memory leaks (cleanup buffers/textures/framebuffers)
- ❌ Hardcode values (use configurable parameters)
- ❌ Break backward compatibility without discussion
- ❌ Add build tools or transpilation steps
- ❌ Assume transform feedback is used (it's framebuffer-based GPGPU)
- ❌ **For WebGPU:** Mix up GLSL and WGSL syntax
- ❌ **For WebGPU:** Ignore struct padding requirements
- ❌ **For WebGPU:** Use deprecated WebGPU features

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

**Last Updated:** 2025-12-29
**Version:** 2.0 (WebGPU Ray Tracing Edition)
**For Claude Code & AI Assistants**

📖 **Additional Documentation:**
- [README.md](README.md) - User-facing project overview
- [WEBGPU_SETUP.md](WEBGPU_SETUP.md) - WebGPU installation and features
- [LICENSE.md](LICENSE.md) - MIT License
