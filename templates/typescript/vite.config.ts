import {defineConfig} from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: [
      '@google/genai',
      '@mediapipe/tasks-vision',
      '@mediapipe/tasks-audio',
      'openai',
      'lit',
      '@pmndrs/uikit',
      '@preact/signals-core',
      '@sparkjsdev/spark',
      'troika-three-text',
      'rapier3d',
      'three-mesh-bvh',
    ],
  },
  build: {
    rollupOptions: {
      external: [
        '@google/genai',
        '@mediapipe/tasks-vision',
        '@mediapipe/tasks-audio',
        'openai',
        'lit',
        '@pmndrs/uikit',
        '@preact/signals-core',
        '@sparkjsdev/spark',
        'troika-three-text',
        'rapier3d',
        'three-mesh-bvh',
      ],
    },
  },
});
