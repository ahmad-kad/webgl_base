# WebGL Gaussian Splat Viewer

A high-performance web-based viewer for Gaussian Splat rendering, supporting multiple PLY formats and offering an immersive 3D visualization experience.

## Overview

This project implements a WebGL-based renderer for Gaussian Splats, featuring:

- Real-time rendering of large point cloud datasets
- Support for multiple PLY file formats (Standard, INRIA v1/v2, PlayCanvas)
- Advanced camera controls with intuitive navigation
- Octree-based spatial partitioning for improved performance
- Optional VR support for immersive visualization (Quest and Vision Pro)

## Features

### Rendering Capabilities
- Gaussian splat rendering with customizable parameters
- Dynamic point size and opacity controls
- Depth-aware rendering with proper transparency
- Adaptive level of detail using octree structure

### File Format Support
- Standard PLY files
- INRIA v1/v2 formats with spherical harmonics
- PlayCanvas compressed formats
- Automatic format detection and parsing

### Controls
- WASD keys for movement
- QE keys for vertical movement
- IJKL keys for camera rotation
- Mouse interaction for point selection
- Double-click or F key for camera reset

## Getting Started

### Prerequisites
- Modern web browser with WebGL support
- Node.js and npm installed

### Installation

1. Clone the repository:

```bash
git clone https://github.com/ahmad-kad/webgl_base.git
cd webgl_base
```

### 2. Install Dependencies

```bash
npm install
```

This will install all the project dependencies specified in the `package.json` file.

### 3. To Start the Project
```bash
npm start
```

This will start the application at `http://localhost:8080/` in your default web browser.

### 4. To Load the Gaussian Splats

Find a .ply or .splat file online and drag it into the browser window.
Some examples can be found [here](https://huggingface.co/VladKobranov/splats/tree/main)

### 5. To Stop the Project
```bash
ctrl+c
```
