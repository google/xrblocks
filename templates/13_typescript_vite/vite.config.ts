import {defineConfig} from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: [
      '@google/genai',
      '@mediapipe/tasks-vision',
      '@mediapipe/tasks-audio',
      'ai',
      '@ai-sdk/google',
      '@ai-sdk/openai',
      'lit',
      '@pmndrs/uikit',
      '@preact/signals-core',
      '@sparkjsdev/spark',
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
        'ai',
        '@ai-sdk/google',
        '@ai-sdk/openai',
        'lit',
        '@pmndrs/uikit',
        '@preact/signals-core',
        '@sparkjsdev/spark',
        'rapier3d',
        'three-mesh-bvh',
      ],
    },
  },
});
