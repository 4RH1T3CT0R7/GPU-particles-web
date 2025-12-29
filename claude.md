# GPU Particles Web - Development Status

## Project Overview
WebGL2-based particle visualization system with morphing 3D shapes, audio reactivity, and interactive cursor effects.

## Current Features

### Particle Modes
- **Shapes Mode**: 11 geometric shapes with smooth morphing
  - Cube, Sphere, Torus, Helix (Spiral)
  - Octahedron, Superformula, Rose
  - Wave, Ribbon, Icosahedron, Polygon
- **Free Flight**: Turbulent vortex-based particle movement
- **Fractals**: Mandelbrot-based fractal visualizations
- **Equalizer**: Audio-reactive frequency visualization

### Audio System
- **Microphone input**: Real-time audio reactivity
- **Audio file upload**: Load and play audio files
- **Frequency bands**: Bass, Mid, Treble analysis
- **Works ONLY in Equalizer mode**

### Cursor Interactions
- Attract particles
- Repel and accelerate
- Vortex (left/right spin)
- Pulsating impulse
- Quasar (accretion disk + jets)
- Magnetic flux (dipole field)

### Visual Features
- 8 color palettes with gradient interpolation
- Soft particle glow and bloom
- Depth-based fog
- Trail effects
- Camera rotation (RMB) and zoom (mouse wheel)

## Recent Fixes (Latest Commits)

### Latest Update - Möbius Strip, Equalizer & Quasar
- ✅ **Ribbon → Möbius Strip** - proper topological surface with twist
- ✅ **Equalizer Complete Rewrite** - clear flat plane with frequency waves
  - Base plane at Y = -0.8
  - Smooth frequency distribution (bass left, mid center, treble right)
  - 5x bass, 4.5x mid, 4x treble sensitivity
  - Visible demo waves when no audio
- ✅ **Quasar Complete Rewrite** - realistic astrophysical structure
  - Central black hole with strong gravity
  - Rotating accretion disk with spiral inflow
  - Vertical relativistic jets (up/down)
  - Boundary forces to keep particles contained
  - No more uncontrolled particle escape

### Previous Update - Fractals & Audio
- ✅ **5 Fractal Types**: Mandelbrot, Julia Set, Burning Ship, Tricorn, Newton
- ✅ Audio reactivity restricted to Equalizer mode only
- ✅ Added audio file upload UI with playback controls
- ✅ Microphone/file toggle with status display

### Shape Improvements
- ✅ Fixed Helix (Spiral) - proper spiral with increasing radius
- ✅ Fixed Octahedron - correct barycentric triangle interpolation
- ✅ Möbius Strip - mathematical surface with half-twist

### Cursor Effects Enhanced
- ✅ Particle repulsion increased 2.5x (4.5x force)
- ✅ Pulsating impulse now actually pulsates with visible waves
- ✅ Quasar - realistic accretion disk + jets (not a torus!)
- ✅ Magnetic flux with strong dipole field and spiral motion

### Free Flight Improvements
- ✅ Multiple layered vortex systems
- ✅ Stronger turbulence (2.8x)
- ✅ Curl noise enhanced (3.5x)

## Known Issues & TODO

### High Priority
- All major issues resolved! ✅

### Medium Priority
- Improve particle count performance at high resolutions
- Add GPU particle collision detection
- Implement particle trails with variable length
- Add screenshot/recording functionality

### Low Priority
- Custom shader editor
- Save/load presets
- Export animations
- VR support

## Technical Architecture

### WebGL2 Stack
- Compute shaders for particle physics (GLSL 300 ES)
- Transform feedback for particle updates
- Dual-buffer ping-pong for position/velocity
- FBO-based trail rendering with bloom

### Particle Physics
- Curl noise for organic flow
- Shape-based attraction forces
- Cursor interaction with falloff
- Audio-reactive modulation (Equalizer only)
- Boundary constraints (roaming sphere)

### Audio Analysis
- Web Audio API with AnalyserNode
- FFT-based frequency analysis (512 bins)
- Smoothing and sensitivity controls
- Support for MediaStream (mic) and MediaElement (file)

## File Structure
```
GPU-particles-web/
├── index.html          # UI and HTML structure
├── index.js            # Main application logic
│   ├── WebGL2 setup
│   ├── Shader compilation
│   ├── Particle simulation (GLSL)
│   ├── Shape generators
│   ├── Audio analysis
│   ├── UI controls
│   └── Render loop
├── README.md           # Project documentation
└── claude.md           # Development status (this file)
```

## Development Notes

### Performance Considerations
- Particle count: 65,536 (256×256 texture) default
- Max tested: 147,456 (384×384 texture)
- GPU-bound on most systems
- Mobile: Reduce to 128×128 for 60fps

### Browser Compatibility
- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ⚠️ WebGL2 support varies
- Mobile: ⚠️ Performance limited

### Code Style
- GLSL shaders: Embedded in template literals
- JavaScript: ES6+ with modern APIs
- No build system - direct browser execution
- Bilingual UI (Russian/English)

## Changelog

### 2025-01-XX - Möbius Strip, Equalizer & Quasar Fixes
- Ribbon → Möbius Strip with proper topological twist
- Equalizer completely rewritten - clear flat plane with frequency waves
- Quasar completely rewritten - realistic accretion disk + jets structure
- Enhanced sensitivity: bass 5x, mid 4.5x, treble 4x
- Added boundary forces to prevent particle escape in quasar mode

### 2025-01-XX - Fractals & Audio System
- Added 5 fractal types: Mandelbrot, Julia, Burning Ship, Tricorn, Newton
- Audio reactivity restricted to Equalizer mode only
- Added audio file upload with playback controls
- Microphone/file toggle with status display

### 2025-01-XX - Shape & Cursor Fixes
- Fixed Helix/Spiral geometry - proper spiral with increasing radius
- Fixed Octahedron triangulation - barycentric coordinates
- Enhanced all cursor interaction modes (4.5x repulsion, pulsating impulse)
- Improved Free Flight turbulence (2.8x, multiple vortex layers)

### Initial Release
- 11 shape modes with morphing
- Audio reactivity implementation
- Cursor interaction system
- Camera controls and color palettes
