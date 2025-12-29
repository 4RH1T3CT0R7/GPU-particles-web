# ✨ GPU Particle Shapes

<div align="center">

![WebGL2](https://img.shields.io/badge/WebGL-2.0-990000?style=for-the-badge&logo=webgl&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Live-00D26A?style=for-the-badge)

*A mesmerizing real-time GPU-accelerated particle system that morphs between mathematical shapes with stunning visual effects*

[Live Demo](https://4RH1T3CT0R7.github.io/GPU-particles-web/) • [Features](#-features) • [Getting Started](#-getting-started) • [Controls](#-interactive-controls)

---

</div>

## 🌟 Overview

**GPU Particle Shapes** is an advanced WebGL2-powered visualization that renders up to 65,000+ particles in real-time, creating fluid, morphing clouds that transition smoothly between various 3D mathematical shapes. Experience interactive physics, beautiful color palettes, and mesmerizing particle trails with hardware-accelerated graphics.

### ✨ Key Highlights

- 🚀 **GPU-Accelerated Rendering** - Leverages WebGL2 for ultra-smooth performance
- 🎨 **Dynamic Color Palettes** - Multiple gradient schemes with live palette switching
- 🔄 **Shape Morphing** - Seamless transitions between geometric forms
- 🎯 **Interactive Cursor Effects** - 7 unique interaction modes (attract, repel, vortex, pulse, quasar, magnet)
- 💫 **Particle Trails** - Soft glow effects with customizable persistence
- 🎮 **Real-Time Controls** - Intuitive UI with live parameter adjustments
- 📱 **Responsive Design** - Works across desktop and mobile devices

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

- Modern web browser with WebGL2 support
- No build tools or dependencies required!

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/4RH1T3CT0R7/GPU-particles-web.git
   cd GPU-particles-web
   ```

2. **Serve the files**

   Use any local web server. Here are some options:

   ```bash
   # Python 3
   python -m http.server 8000

   # Python 2
   python -m SimpleHTTPServer 8000

   # Node.js (with http-server)
   npx http-server -p 8000

   # PHP
   php -S localhost:8000
   ```

3. **Open in browser**

   Navigate to `http://localhost:8000`

### Quick Start

No installation needed! Simply open `index.html` in any modern browser that supports WebGL2.

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

- **WebGL2** - Hardware-accelerated graphics rendering
- **Framebuffer-based GPGPU** - GPU-based particle physics using Multiple Render Targets (MRT)
- **Ping-Pong Buffering** - Double-buffered texture swapping for efficient state updates
- **Floating-Point Textures** - Particle state stored in RGBA32F textures (position & velocity)

### Performance

- Runs at **60 FPS** with 65,000+ particles on modern hardware
- Optimized shader code for minimal GPU overhead
- Efficient texture-based particle state management
- No external dependencies - pure vanilla JavaScript

### Browser Compatibility

| Browser | Version | Support |
|---------|---------|---------|
| Chrome | 56+ | ✅ Full Support |
| Firefox | 51+ | ✅ Full Support |
| Safari | 15+ | ✅ Full Support |
| Edge | 79+ | ✅ Full Support |

*Requires WebGL2 support*

## 📁 Project Structure

```
GPU-particles-web/
├── index.html          # Main HTML file with embedded styles
├── index.js            # Application entry point and orchestration
├── package.json        # Project metadata
├── README.md           # This file
├── LICENSE.md          # License information
├── CLAUDE.MD           # AI assistant development guide
└── src/                # Modular source code
    ├── audio/          # Audio analysis and visualization
    │   └── analyzer.js # Audio analyzer for reactive effects
    ├── camera/         # Camera controls and transformations
    │   └── controls.js # Camera rotation, zoom, and view matrix
    ├── config/         # Configuration and constants
    │   └── constants.js # Global constants and default values
    ├── core/           # Core WebGL and utility functions
    │   ├── utils.js    # Helper functions and utilities
    │   └── webgl.js    # WebGL2 context and initialization
    ├── rendering/      # Rendering pipeline
    │   └── pipeline.js # Rendering orchestration and draw calls
    ├── shaders/        # GLSL shader code
    │   ├── blit.js     # Blit/copy shader programs
    │   ├── common.js   # Shared shader utilities
    │   ├── init.js     # Particle initialization shaders
    │   ├── particle.js # Particle rendering shaders
    │   ├── shapes.js   # Shape generator functions (GLSL)
    │   └── simulation.js # Physics simulation shaders (GPGPU)
    ├── simulation/     # Particle simulation state management
    │   └── state.js    # Particle state, textures, framebuffers
    └── ui/             # User interface components
        ├── i18n.js     # Internationalization and localization
        └── mobile.js   # Mobile-specific UI and touch controls
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
