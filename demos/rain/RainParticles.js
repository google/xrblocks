import * as THREE from 'three';


const kMaxAnimationFrames = 15;
const kAnimationSpeed = 2.0;
const DEBUG_SINGLE = false;
// const DEBUG_SINGLE = true;

function clamp(x, a, b) {
  return Math.min(Math.max(x, a), b);
}

export class RainParticles extends THREE.Object3D {
  constructor() {
    super();
    // Sets the number of particles and defines the range of the raindrop
    // effect.
    this.particleCount = DEBUG_SINGLE ? 1 : 200;
    this.RANGE = 4;
    this.raycaster = new THREE.Raycaster();

    // Initializes arrays for fall speeds, animation weights, and visibility
    // states of each particle.
    this.velocities = new Float32Array(this.particleCount);
    this.particleWeights = new Float32Array(this.particleCount);
    this.particleVisibility = new Float32Array(this.particleCount);

    // Placeholder for the InstancedMesh representing the raindrop particles.
    this.raindropMesh = null;
  }

  /**
   * Initializes raindrop particles with a shader material and instanced
   * geometry. Loads the texture and sets up the particle mesh and instanced
   * attributes.
   */
  init() {
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('textures/rain_sprite_sheet.png', (raindropTexture) => {
      // Creates a custom shader material for the raindrop particles.
      const raindropMaterial = this.createRaindropMaterial(raindropTexture);

      // Creates a simple plane geometry for each raindrop particle.
      const raindropGeometry = new THREE.PlaneGeometry(0.1, 0.1);

      // Initializes an InstancedMesh with the defined geometry and material.
      this.raindropMesh = new THREE.InstancedMesh(
          raindropGeometry, raindropMaterial, this.particleCount);

      // Populates the particle mesh with initial positions and properties.
      this.initializeParticles();

      // Adds instanced attributes for weight and visibility to control raindrop
      // animation and rendering.
      this.raindropMesh.geometry.setAttribute(
          'aWeight',
          new THREE.InstancedBufferAttribute(this.particleWeights, 1)
              .setUsage(THREE.DynamicDrawUsage));
      this.raindropMesh.geometry.setAttribute(
          'aVisibility',
          new THREE.InstancedBufferAttribute(this.particleVisibility, 1)
              .setUsage(THREE.DynamicDrawUsage));

      // Flags the instance matrix for an initial update and adds the raindrop
      // mesh to the scene.
      this.raindropMesh.instanceMatrix.needsUpdate = true;
      this.add(this.raindropMesh);
    });
  }

  /**
   * Creates and returns a custom shader material for the raindrop particles.
   * Uses a texture and sets up uniforms for the camera position to handle
   * billboard rotation.
   */
  createRaindropMaterial(texture) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTexture: {value: texture},
        uCameraPosition: {value: new THREE.Vector3()},
        uCameraRotationMatrix: {value: new THREE.Matrix4()},
      },
      vertexShader: `
        attribute float aWeight;
        attribute float aVisibility;
        varying float vWeight;
        varying float vVisibility;
        varying vec2 vUv;
        uniform vec3 uCameraPosition;
        uniform mat4 uCameraRotationMatrix;

        const float PI = 3.14159265359;


        void main() {
          vUv = uv;
          vWeight = aWeight;
          vVisibility = aVisibility;

          // Get the world position of the instance
          vec4 worldPosition = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

          vec3 rotatedPosition;

          if (vWeight < 1.5) {
            // Compute vector from particle to camera, projected onto XZ plane
            vec3 toCamera = uCameraPosition - worldPosition.xyz;
            toCamera.y = 0.0; // Ignore vertical component
            toCamera = normalize(toCamera);

            // Compute the angle to rotate around Y-axis
            float angle = atan(toCamera.x, toCamera.z);

            // Create rotation matrix around Y-axis
            mat3 rotationMatrix = mat3(
              cos(angle), 0.0, -sin(angle),
              0.0,        1.0,  0.0,
              sin(angle), 0.0,  cos(angle)
            );

            // Apply rotation to vertex position
            rotatedPosition = rotationMatrix * position;
          } else {
            // Rotate the particle to face positive Y-axis
            // This is a rotation of -90 degrees around X-axis
            float angle = 0.5 * PI; // -90 degrees in radians

            // Create rotation matrix around X-axis
            mat3 rotationMatrix = mat3(
              1.0,       0.0,        0.0,
              0.0, cos(angle), -sin(angle),
              0.0, sin(angle),  cos(angle)
            );

            // Apply rotation to vertex position
            rotatedPosition = rotationMatrix * position;
          }

          // Apply instance transformations
          vec4 finalPosition = instanceMatrix * vec4(rotatedPosition, 1.0);

          // Transform to clip space
          gl_Position = projectionMatrix * viewMatrix * finalPosition;
        }

      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        varying vec2 vUv;
        varying float vWeight;
        varying float vVisibility;

        void main() {
          const float kAnimationSpeed = 2.0;
          vec2 uv = vUv * 0.25;  // Assumes a 4x4 texture grid.
          float frame = floor(vWeight / kAnimationSpeed);
          float xIndex = mod(frame, 4.0);
          float yIndex = floor(frame / 4.0);
          uv += vec2(xIndex, 3.0 - yIndex) * 0.25;  // Maps frame index to UV coordinates.
          vec4 texColor = texture2D(uTexture, uv);
          gl_FragColor = vec4(pow(texColor.rgb, vec3(0.5)), texColor.a * vVisibility * 0.8 - step(vWeight, 0.5) * 0.2);  // Applies visibility factor.
          // gl_FragColor = vec4(0.5, 0.5, 0.0, 1.0);  // Applies visibility factor.
        }
      `,
      transparent: true,
      // side: THREE.DoubleSide,
    });
  }

  /**
   * Initializes the positions and properties for each particle.
   * Assigns random positions, fall speeds, and visibility states to each
   * particle instance.
   */
  initializeParticles() {
    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.particleCount; i++) {
      // Assigns random initial position within the defined range.
      dummy.position.set(
          Math.random() * this.RANGE * 2 - this.RANGE,
          Math.random() * this.RANGE * 2,
          Math.random() * this.RANGE * 2 - this.RANGE);

      if (DEBUG_SINGLE) {
        dummy.position.set(0, 1.2, -1);
      }

      // Updates the instance matrix with the dummy object's position.
      dummy.updateMatrix();
      this.raindropMesh.setMatrixAt(i, dummy.matrix);

      // Sets random fall speed and initial visibility for each particle.
      this.velocities[i] = Math.random() * 0.05 + 0.2;
      // this.velocities[i] = 0.1;
      this.particleWeights[i] = 0;
      this.particleVisibility[i] = 1;
    }
  }

  /**
   * Updates particle positions and visibility on each frame.
   * Adjusts particle weights, visibility, and repositions particles as they
   * "fall."
   */
  update(camera, xrDepth) {
    if (!this.raindropMesh) return;
    const depthMesh = xrDepth.depthMesh;

    const dummy = new THREE.Object3D();
    const particleWeightsAttribute =
        this.raindropMesh.geometry.attributes.aWeight;
    const particleVisibilityAttribute =
        this.raindropMesh.geometry.attributes.aVisibility;
    // const nextDummy = new THREE.Object3D();

    // Compute the camera's rotation excluding Y-axis rotation (yaw)
    const cameraEuler =
        new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    const cameraEulerNoYaw = new THREE.Euler(
        cameraEuler.x,  // pitch
        0,              // yaw
        cameraEuler.z,  // roll
        'YXZ');
    const cameraRotationMatrix =
        new THREE.Matrix4().makeRotationFromEuler(cameraEulerNoYaw);
    const inverseCameraRotationMatrix = cameraRotationMatrix.clone().invert();

    // Update the uniform with the inverse rotation matrix
    this.raindropMesh.material.uniforms.uCameraRotationMatrix.value.copy(
        inverseCameraRotationMatrix);

    for (let i = 0; i < this.raindropMesh.count; ++i) {
      // Gets the current transformation matrix of the particle instance.
      this.raindropMesh.getMatrixAt(i, dummy.matrix);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);


      // Proceeds the raindrop.
      if (this.particleWeights[i] < 0.5) {
        dummy.position.y -= this.velocities[i];
      }

      // Computes screen position and depth for visibility checks.
      const screenPos = dummy.position.clone().project(camera);

      // Check if the point is within the visible NDC range.
      // const isWithinFoV = screenPos.x >= -1 && screenPos.x <= 1 &&
      //     screenPos.y >= -1 && screenPos.y <= 1 && screenPos.z >= 0 &&
      //     screenPos.z <= 1;

      const isWithinFoV = screenPos.x >= -0.8 && screenPos.x <= 0.6 &&
          screenPos.y >= -1.0 && screenPos.y <= 1.0 && screenPos.z >= 0 &&
          screenPos.z <= 1;

      let isOccluded = false;
      let maxVisibility = 1.0;
      let deltaDepth = 0.0;

      const isHigh = dummy.position.y > 2.0;

      if (isWithinFoV) {
        const depth =
            xrDepth.getDepth((screenPos.x + 1) / 2, (screenPos.y + 1) / 2);

        // Transform the point to camera space.
        const pointInCameraSpace =
            dummy.position.clone().applyMatrix4(camera.matrixWorldInverse);

        // The z-coordinate in camera space is the perpendicular distance to the
        // camera plane
        const distanceToCameraPlane = -pointInCameraSpace.z;

        isOccluded = depth == 0 || depth < distanceToCameraPlane;
        deltaDepth = Math.abs(distanceToCameraPlane - depth);
        // console.log(
        //     'occluded: ' + isOccluded, 'isWithinFoV: ' + isWithinFoV, depth,
        //     distanceToCameraPlane);

        if (this.particleWeights[i] == 0 && this.particleVisibility[i] > 0.5 &&
            isOccluded && !isHigh) {
          this.particleWeights[i] = 1;

          if (depth < 0.3) {
            // maxVisibility *= 0.2 + depth;
            maxVisibility = 0.0;
          } else if (depth > 2.0) {
            maxVisibility *= 0.5 + (4.0 - depth) / 4.0;
          }
          // console.log('hit ', dummy.position.y, depth,
          // distanceToCameraPlane);
        }
      }

      if (isWithinFoV) {
        // console.log(
        //     depth, distanceToCameraPlane, pointInCameraSpace.z,
        //     dummy.position);

        this.particleVisibility[i] = (isOccluded && !isHigh) ?
            clamp(0.6 - deltaDepth, 0.0, 0.6) :
            maxVisibility;

      } else {
        this.particleVisibility[i] = 0.0;
      }

      // Hits the floor.
      if (dummy.position.y < 0) {
        dummy.position.y = 0;
        if (this.particleWeights[i] < 0.5) {
          this.particleWeights[i] = 1;
        }

        this.particleVisibility[i] =
            (isOccluded && !isHigh) ? 0.0 : maxVisibility;
      }

      if (this.particleWeights[i] > 0) {
        this.particleWeights[i] += 1;
      }


      // Global minimum test.
      if (depthMesh.minDepth < 0.1) {
        this.particleVisibility[i] = 0.0;
      }

      // this.particleVisibility[i] = 1.0;

      // if (this.particleVisibility[i] > 0.5) {
      //   console.log(
      //       'current: w', this.particleWeights[i], 'v',
      //       this.particleVisibility[i], dummy.position.y,
      //       this.velocities[i]);
      // }

      if (this.particleWeights[i] > kMaxAnimationFrames * kAnimationSpeed) {
        // Resets particle position and animation weight upon animation
        // completion.
        // console.log('reset', dummy.position.y, this.velocities[i]);
        this.respawnPrticle(dummy, i, camera, depthMesh);
      }

      // if (depth > 1) {
      //   depth *= 1.1;
      // }
      // TODO: use a slerp.
      // Sets visibility based on the distance to the screen and depth.

      // this.particleVisibility[i] = (this.particleWeights[i] > 0.0) ? 0.6 :
      // 0.9;

      // Occlusion
      // if (distanceToScreen > depth + 0.5) {
      //   this.particleVisibility[i] = 0.0;
      // }

      // if (depth < 0.3) {
      //   if (distanceToScreen > 0.5) {
      //     this.particleVisibility[i] = 1.0;
      //   } else {
      //     this.particleVisibility[i] = 0.4;
      //     this.particleWeights[i] += 1;
      //   }
      // }

      // if (distanceToScreen < 0.5) {
      //   this.particleVisibility[i] = 0.0;
      // }


      // this.particleVisibility[i] = 1.0;


      // if (this.particleWeights[i] == 0) {
      //   dummy.scale.set(1, 1, 1);
      // } else {
      //   dummy.scale.set(0.5, 0.5, 0.5);
      // }

      // console.log(
      //     'current: w', this.particleWeights[i], 'v',
      //     this.particleVisibility[i], 'y', dummy.position,
      //     this.velocities[i]);

      // Updates weight attribute for the shader.
      particleVisibilityAttribute.setX(i, this.particleVisibility[i]);
      particleWeightsAttribute.setX(i, this.particleWeights[i]);
      dummy.updateMatrix();
      this.raindropMesh.setMatrixAt(i, dummy.matrix);
    }

    // Marks mesh attributes for update and updates camera position uniform.
    this.raindropMesh.instanceMatrix.needsUpdate = true;
    particleWeightsAttribute.needsUpdate = true;
    particleVisibilityAttribute.needsUpdate = true;
    this.raindropMesh.material.uniforms.uCameraPosition.value.copy(
        camera.position);
  }

  /**
   * Resets a particle's position and animation weight upon reaching the ground.
   */
  respawnPrticle(dummy, index, camera, depthMesh) {
    let u = Math.random();
    let v = Math.random();
    const half = Math.random();
    // const vertex = depthMesh.getPosition(u, v);
    let vertex;
    let inited = false;
    let threshold = 0.05;
    if (depthMesh.minDepth < 0.16) {
      threshold = depthMesh.minDepth * 0.01;
    }

    threshold = 0.1;

    if (Math.random() < threshold) {
      u = u * 0.8 + 0.1;
      v = v * 0.8 + 0.1;
      this.raycaster.setFromCamera(
          {x: u * 2.0 - 1.0, y: v * 2.0 - 1.0}, camera);
      const intersections = this.raycaster.intersectObject(depthMesh);
      if (intersections.length > 0) {
        vertex = intersections[0].point;
        inited = true;
      }
    }

    if (!inited) {
      const theta = u * 2 * Math.PI;
      let radius = Math.sqrt(v) * this.RANGE + 0.2;
      if (half < 0.5) {
        radius = Math.sqrt(v) * 0.7 + 0.3;
      } else if (half < 0.7) {
        radius = Math.sqrt(v) * 1.5 + 0.3;
      }

      vertex = {
        x: radius * Math.cos(theta),
        z: radius * Math.sin(theta),
        y: 4.0
      };
    } else {
      // if (half < 0.5) {
      //   vertex = vertex.clone().lerp(camera.position, 0.5);
      //   dummy.position.set(vertex.x, 4.0, vertex.z);
      //   inited = false;
      // }
    }

    vertex = DEBUG_SINGLE ? new THREE.Vector3(-1, 4, -1) : vertex;

    dummy.position.set(vertex.x, vertex.y, vertex.z);
    dummy.rotation.set(0, 0, 0);
    this.particleWeights[index] = inited ? 1.0 : 0.0;

    // // Generate a random angle.
    // const theta = Math.random() * 2 * Math.PI;
    // // Generate a random radius with uniform distribution.
    // const radius = Math.sqrt(Math.random()) * this.RANGE;
    // // Calculate x and z positions.
    // const x = radius * Math.cos(theta);
    // const z = radius * Math.sin(theta);
    // const y = 4.0;

    // // Set the new position and reset other properties
    // dummy.position.set(x, y, z);
    // dummy.rotation.set(0, 0, 0);
    // this.particleWeights[index] = 0;
  }
}
