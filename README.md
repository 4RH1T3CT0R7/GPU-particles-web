# ✨ GPU Particle Shapes

<div align="center">

![WebGL2](https://img.shields.io/badge/WebGL-2.0-990000?style=for-the-badge&logo=webgl&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Live-00D26A?style=for-the-badge)

*A mesmerizing real-time GPU-accelerated particle system that morphs between mathematical shapes with stunning visual effects*

[🎮 WebGL2 Demo](https://4RH1T3CT0R7.github.io/GPU-particles-web/index.html) • [⚡ WebGPU Demo](https://4RH1T3CT0R7.github.io/GPU-particles-web/index-webgpu.html) • [🔍 Debug Tools](#-debugging--troubleshooting)

[Features](#-features) • [Getting Started](#-getting-started) • [Controls](#-interactive-controls)

---

</div>

## 🌟 Overview

**GPU Particle Shapes** is an advanced particle visualization system with **two cutting-edge versions**: a stable **WebGL2** version and an experimental **WebGPU version featuring real-time ray tracing** with path-traced global illumination. Experience up to 65,000+ particles morphing between mathematical shapes with stunning visual effects and physically-based rendering.

### ✨ Key Highlights

#### WebGL2 Version (Stable)
- 🚀 **GPU-Accelerated Rendering** - Leverages WebGL2 for ultra-smooth performance
- 🎨 **Dynamic Color Palettes** - Multiple gradient schemes with live palette switching
- 🔄 **Shape Morphing** - Seamless transitions between geometric forms
- 🎯 **Interactive Cursor Effects** - 7 unique interaction modes (attract, repel, vortex, pulse, quasar, magnet)
- 💫 **Particle Trails** - Soft glow effects with customizable persistence
- 🎮 **Real-Time Controls** - Intuitive UI with live parameter adjustments
- 📱 **Responsive Design** - Works across desktop and mobile devices

#### WebGPU Version (Experimental - Ray Tracing) 🔥
- ⚡ **Real-Time Ray Tracing** - Hardware-accelerated ray tracing with BVH acceleration
- 🌍 **Path-Traced Global Illumination** - 1-bounce GI for realistic indirect lighting
- ✨ **Per-Particle Materials** - Varied albedo, roughness, metallic, and emissive properties
- 🎭 **Importance Sampling** - GGX distribution for specular reflections
- 🔆 **Emissive Particles** - Dynamic light-emitting particles
- 🎬 **Temporal Denoising** - Smooth, noise-free rendering via temporal accumulation
- 💎 **PBR Shading** - Cook-Torrance BRDF with up to 8 dynamic lights
- 🌈 **HDR + ACES Tone Mapping** - Cinematic color grading

📖 **[WebGPU Setup Guide](WEBGPU_SETUP.md)** - Complete installation and feature documentation

## 🎨 Features

### Rendering Modes

| Mode | Description |
|------|-------------|
| **Shapes** | Particles morph between predefined mathematical shapes |
| **Free Flight** | Particles move freely in 3D space with natural flow |
| **Fractals** | Emergent fractal-like patterns from particle interactions |

### Available Shapes (11 Total)

The system includes a diverse collection of mathematical forms:

- **Geometric Primitives:** Cube, Sphere
- **Curved Surfaces:** Torus (donut), Helix (spiral)
- **Platonic Solids:** Octahedron (8 faces), Icosahedron (20 faces)
- **Parametric Forms:** Superformula, Rose curve, Wave surface
- **Complex Shapes:** Ribbon (twisted curve), Polygon (configurable)

### Interactive Cursor Modes

- **Attract** - Pull particles toward cursor position
- **Repel** - Push particles away and accelerate them
- **Vortex (Left/Right)** - Create spinning vortex effects
- **Pulse** - Emit pulsating waves from cursor
- **Quasar** - Simulate quasar-like particle ejection
- **Magnet** - Magnetic field-style particle flow

### Customizable Parameters

- Particle count (up to 384×384 texture = ~147,000 particles)
- Morphing speed and automatic shape transitions
- Shape attraction force
- Cursor interaction strength and radius
- Particle movement speed
- Color palette selection (2-6 colors)
- Pulse effects on click

## 🚀 Getting Started

### Prerequisites

#### WebGL2 Version
- Modern web browser with WebGL2 support
- No build tools or dependencies required!

#### WebGPU Version (Ray Tracing)
- Chrome Canary 113+ or Chrome Dev channel
- Enable WebGPU: `chrome://flags/#enable-unsafe-webgpu`
- Modern GPU (NVIDIA 10-series+, AMD RX 5000+, Intel Arc)
- 4GB+ VRAM recommended

📖 **See [WEBGPU_SETUP.md](WEBGPU_SETUP.md) for detailed WebGPU requirements and troubleshooting**

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/4RH1T3CT0R7/GPU-particles-web.git
   cd GPU-particles-web
   ```

2. **Serve the files**

   Use any local web server:

   ```bash
   # Python 3
   python3 -m http.server 8080

   # Node.js
   npx http-server -p 8080

   # PHP
   php -S localhost:8080
   ```

3. **Open in browser**

   - **WebGL2 Version:** `http://localhost:8080/index.html`
   - **WebGPU Version:** `http://localhost:8080/index-webgpu.html`

### Quick Start

#### WebGL2 (Stable)
No installation needed! Simply open `index.html` in any modern browser that supports WebGL2.

#### WebGPU (Ray Tracing)
1. Open `index-webgpu.html` in Chrome Canary
2. If WebGPU is unavailable, automatically falls back to WebGL2
3. See [WEBGPU_SETUP.md](WEBGPU_SETUP.md) for complete setup instructions

## 🐛 Debugging & Troubleshooting

If you encounter issues with either version, use the dedicated debug pages to diagnose problems:

### Debug Pages

#### WebGL2 Debug Page

**Local:** `http://localhost:8080/debug.html`
**Live Demo:** [🔍 WebGL2 Debug](https://4RH1T3CT0R7.github.io/GPU-particles-web/debug.html)

**Features:**
- ✅ WebGL2 context availability check
- ✅ Extension support verification (EXT_color_buffer_float)
- ✅ Basic shader compilation tests
- ✅ Real-time error capture and logging
- ✅ Stack traces for debugging

#### WebGPU Debug Page

**Local:** `http://localhost:8080/debug-webgpu.html`
**Live Demo:** [🔍 WebGPU Debug](https://4RH1T3CT0R7.github.io/GPU-particles-web/debug-webgpu.html)

**Features:**
- ✅ WebGPU adapter & device detection
- ✅ GPU capabilities and limits inspection
- ✅ Shader file loading verification (checks for 404 errors)
- ✅ WGSL shader compilation with detailed error messages
- ✅ Real-time console log capture in UI overlay
- ✅ Comprehensive error reporting with line numbers
- ✅ Automatic HTML vs WGSL detection

### How to Use Debug Pages

**Option 1: Live Demo (Quick Test)**
- Click the live demo links above to test in your browser immediately
- No setup required, works directly from GitHub Pages

**Option 2: Local Testing (Full Development)**

1. **Start your local server**
   ```bash
   python3 -m http.server 8080
   ```

2. **Open the appropriate debug page**
   - For WebGL2 issues: Open `http://localhost:8080/debug.html`
   - For WebGPU issues: Open `http://localhost:8080/debug-webgpu.html`

3. **Review the diagnostic output**
   - Green ✓ messages indicate successful operations
   - Red ❌ messages show errors with detailed information
   - Yellow ⚠ messages display warnings

4. **Common Issues**

   **WebGPU Shader 404 Errors:**
   - Ensure local server is running from project root
   - Check that `src/shaders-wgsl/` directory exists
   - Verify shader files use `.wgsl` extension

   **WGSL Compilation Errors:**
   - Check debug page for exact line numbers
   - Look for unsupported syntax (e.g., ternary operators `?:`)
   - Verify shader code doesn't contain HTML (404 page)

   **WebGPU Not Available:**
   - Enable in Chrome: `chrome://flags/#enable-unsafe-webgpu`
   - Use Chrome Canary 113+ or Chrome Dev channel
   - Verify GPU supports WebGPU (see [WEBGPU_SETUP.md](WEBGPU_SETUP.md))

### Getting Help

If debug pages don't resolve your issue:

1. Check browser console for additional errors
2. Review [WEBGPU_SETUP.md](WEBGPU_SETUP.md) for WebGPU-specific setup
3. Open an issue on GitHub with:
   - Debug page screenshot
   - Browser version
   - GPU model
   - Operating system

## 🎮 Interactive Controls

### Mouse/Touch Controls

- **Left Click + Drag** - Apply cursor interaction effect
- **Right Click + Drag** - Rotate camera view
- **Scroll Wheel** - Zoom in/out (if enabled)

### Control Panel

The left panel provides real-time control over:

#### Shape & Flight
- Select target shapes for morphing
- Switch between rendering modes
- Enable/disable automatic shape transitions

#### Colors
- Adjust number of colors in gradient (2-6)
- Shuffle color palettes
- Preview current gradient

#### Shape Morphing
- Toggle automatic shape switching
- Set transition speed (4-30 seconds)
- Adjust attraction force to target shape

#### Active Cursor
- Enable/disable cursor interaction
- Choose interaction mode
- Adjust cursor strength and radius
- Toggle pulse effect on mouse down

#### Particles
- Set particle count
- Adjust particle speed multiplier
- Reset or scatter particles

## 🛠️ Technical Details

### Architecture

#### WebGL2 Version
- **WebGL2** - Hardware-accelerated graphics rendering
- **Framebuffer-based GPGPU** - GPU-based particle physics using Multiple Render Targets (MRT)
- **Ping-Pong Buffering** - Double-buffered texture swapping for efficient state updates
- **Floating-Point Textures** - Particle state stored in RGBA32F textures (position & velocity)

#### WebGPU Version (Ray Tracing)
- **WebGPU Compute Shaders** - Modern GPU compute API
- **Ray Tracing Pipeline** - BVH acceleration structure with iterative traversal
- **Path Tracing** - Monte Carlo ray tracing with importance sampling
- **Temporal Accumulation** - Frame-to-frame denoising via exponential moving average
- **PBR Materials** - Cook-Torrance BRDF with metallic-roughness workflow
- **HDR Rendering** - RGBA16F textures with ACES tone mapping

**Render Pipeline (WebGPU):**
1. Particle Simulation (Compute)
2. BVH Construction (Compute)
3. Ray Tracing with GI (Compute)
4. Temporal Accumulation (Compute)
5. Blit to Canvas with Tone Mapping (Render)

📖 **[Technical Documentation](WEBGPU_SETUP.md#-technical-details)** - In-depth WebGPU architecture

### Performance

#### WebGL2 Version
- Runs at **60 FPS** with 65,000+ particles on modern hardware
- Optimized shader code for minimal GPU overhead
- Efficient texture-based particle state management

#### WebGPU Version
- **60 FPS** with ray tracing on RTX 3080+ (1080p)
- Dynamic BVH rebuilt every frame
- Temporal accumulation smooths path tracing noise
- Scales from 16K to 65K particles

### Browser Compatibility

#### WebGL2 Version

| Browser | Version | Support |
|---------|---------|---------|
| Chrome | 56+ | ✅ Full Support |
| Firefox | 51+ | ✅ Full Support |
| Safari | 15+ | ✅ Full Support |
| Edge | 79+ | ✅ Full Support |

#### WebGPU Version

| Browser | Version | Support |
|---------|---------|---------|
| Chrome Canary | 113+ | ✅ Full Support |
| Chrome Dev | Latest | ✅ Full Support |
| Chrome Stable | 113+ | ⚠️ Regional |
| Firefox | - | 🔄 Coming Soon |
| Safari TP | Latest | ⚠️ Partial |

*WebGPU requires GPU with hardware ray tracing support for optimal performance*

## 📁 Project Structure

```
GPU-particles-web/
├── index.html              # WebGL2 version (stable)
├── index.js                # WebGL2 application entry point
├── index-webgpu.html       # WebGPU version (ray tracing)
├── index-webgpu.js         # WebGPU application entry point
├── debug.html              # WebGL2 debug page
├── debug-webgpu.html       # WebGPU debug page 🆕
├── package.json            # Project metadata
├── README.md               # This file
├── WEBGPU_SETUP.md         # WebGPU setup and documentation
├── LICENSE.md              # MIT License
├── CLAUDE.MD               # AI assistant development guide
└── src/
    ├── audio/              # Audio analysis
    │   └── analyzer.js
    ├── camera/             # Camera controls
    │   └── controls.js
    ├── config/             # Configuration
    │   └── constants.js
    ├── core/               # Core WebGL utilities
    │   ├── utils.js
    │   └── webgl.js
    ├── gpu/                # WebGPU infrastructure ⚡ NEW
    │   ├── device.js       # WebGPU device initialization
    │   └── pipelines.js    # Compute & render pipelines
    ├── rendering/          # Rendering pipeline
    │   └── pipeline.js
    ├── shaders/            # GLSL shaders (WebGL2)
    │   ├── blit.js
    │   ├── common.js
    │   ├── init.js
    │   ├── particle.js
    │   ├── pbr.js          # PBR lighting ⚡ NEW
    │   ├── shapes.js
    │   └── simulation.js
    ├── shaders-wgsl/       # WGSL shaders (WebGPU) ⚡ NEW
    │   ├── blit.wgsl       # Tone mapping output
    │   ├── bvh-build.wgsl  # Full LBVH construction
    │   ├── bvh-simple.wgsl # Simplified BVH builder
    │   ├── common.wgsl     # Math utilities
    │   ├── particle-sim.wgsl # Particle physics
    │   ├── pbr.wgsl        # PBR BRDF functions
    │   ├── ray-trace.wgsl  # Ray tracing kernel
    │   └── temporal-accumulation.wgsl # Denoising
    ├── simulation/         # Particle state
    │   └── state.js
    └── ui/                 # User interface
        ├── i18n.js
        └── mobile.js
```

### Module Organization

The project follows a **modular architecture** with clear separation of concerns:

- **`src/core/`** - WebGL2 context management and core utilities
- **`src/shaders/`** - All GLSL shader programs organized by function
- **`src/simulation/`** - GPU-based particle physics and state management
- **`src/rendering/`** - Rendering pipeline and visual output
- **`src/camera/`** - 3D camera controls and transformations
- **`src/ui/`** - User interface components and interactions
- **`src/audio/`** - Audio analysis for reactive visualizations
- **`src/config/`** - Application configuration and constants

## 🎯 Use Cases

- **Digital Art Installations** - Interactive museum exhibits
- **Web Backgrounds** - Engaging landing page animations
- **Music Visualizations** - Reactive audio-visual experiences
- **Educational Tools** - Teaching particle physics and graphics programming
- **Creative Coding** - Generative art and procedural animations

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Ideas for Contribution

- Add new particle shapes (Möbius strip, Klein bottle, trefoil knot, Lorenz attractor, etc.)
- Implement audio reactivity (particles respond to music)
- Add new cursor interaction modes (gravity wells, black holes, wind fields)
- Optimize performance for mobile devices
- Create preset configurations (save/load particle states)
- Add screenshot/recording functionality (canvas capture)
- Implement particle trails with motion blur
- Add VR/AR support for immersive experiences

## 📝 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## 🙏 Acknowledgments

- Inspired by particle system techniques from demoscene and creative coding communities
- WebGL2 rendering patterns from GPU programming best practices
- Color palettes influenced by modern gradient design trends

## 📧 Contact

**4RH1T3CT0R7** - [@4RH1T3CT0R7](https://github.com/4RH1T3CT0R7)

Project Link: [https://github.com/4RH1T3CT0R7/GPU-particles-web](https://github.com/4RH1T3CT0R7/GPU-particles-web)

---

<div align="center">

**Made with ❤️ and WebGL2**

*If you found this project interesting, please consider giving it a ⭐!*

</div>
