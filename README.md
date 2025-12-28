# ✨ GPU Particle Shapes

<div align="center">

![WebGL2](https://img.shields.io/badge/WebGL-2.0-990000?style=for-the-badge&logo=webgl&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Live-00D26A?style=for-the-badge)

*A mesmerizing real-time GPU-accelerated particle system that morphs between mathematical shapes with stunning visual effects*

[Live Demo](#) • [Features](#-features) • [Getting Started](#-getting-started) • [Controls](#-interactive-controls)

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
- **Transform Feedback** - GPU-based particle physics simulation
- **GPGPU Techniques** - Computation performed entirely on GPU
- **Texture-based Storage** - Particle state stored in floating-point textures

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
├── index.js            # Core particle system logic
├── package.json        # Project metadata
├── README.md           # This file
└── LICENSE.md          # License information
```

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

- Add new particle shapes (torus, mobius strip, etc.)
- Implement audio reactivity
- Add new cursor interaction modes
- Optimize performance for mobile devices
- Create preset configurations
- Add screenshot/recording functionality

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
