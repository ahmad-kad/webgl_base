import { Camera } from './camera.js';
import { ViewerControls } from './viewer-controls.js';

console.log('Testing module loading...');

try {
    const camera = new Camera();
    console.log('Camera created successfully');
} catch (error) {
    console.error('Error creating camera:', error);
}

// Add more test cases as needed