# GPU Particles Web - Project Structure

## Overview
This project has been refactored into a modular structure for better maintainability and organization.

## Directory Structure

```
GPU-particles-web/
├── index.html              # Main HTML file
├── index.js                # Main entry point (orchestrates all modules)
├── index.original.js       # Original monolithic version (backup)
├── package.json
└── src/
    ├── config/             # Configuration and constants
    │   └── constants.js    # Shape names, palettes, constants
    ├── core/               # Core WebGL functionality
    │   ├── webgl.js        # WebGL2 initialization
    │   └── utils.js        # WebGL utility functions
    ├── shaders/            # GLSL shader code
    │   ├── common.js       # Common shader code (noise, utils)
    │   └── shapes.js       # Shape generation GLSL code
    ├── camera/             # Camera controls
    │   └── controls.js     # Camera management and matrices
    ├── audio/              # Audio analysis
    │   └── analyzer.js     # Audio reactivity system
    └── ui/                 # User interface
        └── i18n.js         # Internationalization (RU/EN)
```

## Module Descriptions

### config/constants.js
- Exports all application constants
- Shape names (EN/RU)
- Color palettes
- Shape IDs and configuration values

### core/webgl.js
- WebGL2 context initialization
- Extension checking
- GPU limits detection

### core/utils.js
- Shader compilation and linking
- Texture and FBO creation
- VAO management
- Drawing utilities

### shaders/common.js
- Common GLSL code shared across shaders
- Noise functions (hash, noise, curl)
- Basic vertex shader

### shaders/shapes.js
- All shape generation functions
- 3D shapes: cube, sphere, torus, helix, octahedron, wave, ribbon, icosahedron
- 2D shapes: superformula, rose, polygon
- Equalizer shape for audio visualization
- Rotation helpers

### camera/controls.js
- Camera state management
- Matrix math (perspective, lookAt)
- View/projection matrix updates

### audio/analyzer.js
- Audio context initialization
- Frequency analysis (bass, mid, treble)
- Microphone and file input support
- Real-time audio reactivity

### ui/i18n.js
- Bilingual support (Russian/English)
- Translation management
- Dynamic language switching
- UI label updates

## Key Features

1. **Modular Design**: Each concern is separated into its own module
2. **ES6 Modules**: Uses import/export for clean dependencies
3. **Maintainability**: Easier to locate and modify specific functionality
4. **Scalability**: New features can be added as new modules
5. **Testability**: Individual modules can be tested in isolation

## Original File
The original `index.js` (~3000 lines) has been preserved as `index.original.js` for reference.

## Development

To work with the modular structure:

1. Modify individual modules in `src/` directories
2. The main `index.js` orchestrates all modules
3. Use a local server to serve the files (ES6 modules require HTTP/HTTPS)

Example:
```bash
python3 -m http.server 8000
# or
npx serve
```

## Migration Notes

- All original functionality is preserved
- Performance characteristics remain the same
- Shader code is unchanged (only reorganized)
- UI behavior is identical to original

## Future Improvements

Potential areas for further modularization:
- Simulation logic (particle physics)
- Rendering pipeline
- Shape scheduling and morphing
- Pointer interaction system
- Color management
- Mobile menu handling
