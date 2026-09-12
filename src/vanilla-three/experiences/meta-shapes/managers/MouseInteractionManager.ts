import * as THREE from 'three';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';
import { metaShapesConf } from '../constants';

export class MouseInteractionManager {
  private mouse = new THREE.Vector2();
  private mouseWorldPosition = new THREE.Vector3();
  private smoothedMousePosition = new THREE.Vector3();
  private targetMousePosition = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private handleMouseMove!: (event: MouseEvent) => void;

  // Trail tracking
  private mouseTrail: Array<{
    position: THREE.Vector3;
    timestamp: number;
    influence: number;
  }> = [];
  private lastTrailUpdate = 0;

  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;
  private noise: ImprovedNoise;

  constructor(
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
    noise: ImprovedNoise
  ) {
    this.camera = camera;
    this.canvas = canvas;
    this.noise = noise;

    // Initialize mouse positions
    this.smoothedMousePosition.set(0, 0, 0);
    this.targetMousePosition.set(0, 0, 0);
    this.mouseWorldPosition.set(0, 0, 0);
  }

  public setupMouseInteraction(): void {
    this.handleMouseMove = (event: MouseEvent) => {
      // Convert mouse coordinates to normalized device coordinates (-1 to +1)
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Ensure camera matrix is up to date before raycasting
      this.camera.updateMatrixWorld(true);

      // Update raycaster with current camera state
      this.raycaster.setFromCamera(this.mouse, this.camera);

      // Calculate the 3D mouse position using cube bounds intersection
      const intersectPoint = this.calculateMousePositionInCube();

      if (intersectPoint) {
        // Set target position for smooth interpolation
        this.targetMousePosition.copy(intersectPoint);
      }
    };

    this.canvas.addEventListener('mousemove', this.handleMouseMove);
  }

  private calculateMousePositionInCube(): THREE.Vector3 | null {
    const countPerSide = metaShapesConf.instanceMesh.countPerSide;
    const spacing = metaShapesConf.instanceMesh.spacing;

    // Create a bounding box that encompasses the entire cube grid
    // Use consistent spacing calculation
    const gridExtent = (countPerSide - 1) * spacing * 0.5;
    const boxMin = new THREE.Vector3(-gridExtent, -gridExtent, -gridExtent);
    const boxMax = new THREE.Vector3(gridExtent, gridExtent, gridExtent);
    const box = new THREE.Box3(boxMin, boxMax);

    // Try to intersect the ray with the bounding box
    const intersectPoint = new THREE.Vector3();
    const hasIntersection = this.raycaster.ray.intersectBox(
      box,
      intersectPoint
    );

    if (hasIntersection) {
      // Ensure the intersection point is within bounds (safety check)
      intersectPoint.clamp(boxMin, boxMax);
      return intersectPoint;
    }

    // Enhanced fallback for when camera is rotated or ray doesn't intersect
    const rayDirection = this.raycaster.ray.direction.clone().normalize();
    const rayOrigin = this.raycaster.ray.origin.clone();

    // Method 1: Try intersecting with individual faces of the cube
    const faces = [
      {
        normal: new THREE.Vector3(1, 0, 0),
        point: new THREE.Vector3(gridExtent, 0, 0),
      }, // Right face
      {
        normal: new THREE.Vector3(-1, 0, 0),
        point: new THREE.Vector3(-gridExtent, 0, 0),
      }, // Left face
      {
        normal: new THREE.Vector3(0, 1, 0),
        point: new THREE.Vector3(0, gridExtent, 0),
      }, // Top face
      {
        normal: new THREE.Vector3(0, -1, 0),
        point: new THREE.Vector3(0, -gridExtent, 0),
      }, // Bottom face
      {
        normal: new THREE.Vector3(0, 0, 1),
        point: new THREE.Vector3(0, 0, gridExtent),
      }, // Front face
      {
        normal: new THREE.Vector3(0, 0, -1),
        point: new THREE.Vector3(0, 0, -gridExtent),
      }, // Back face
    ];

    let closestIntersection: THREE.Vector3 | null = null;
    let closestDistance = Infinity;

    for (const face of faces) {
      const plane = new THREE.Plane(face.normal, -face.point.dot(face.normal));
      const intersection = new THREE.Vector3();

      if (this.raycaster.ray.intersectPlane(plane, intersection)) {
        // Check if intersection is within the cube bounds
        if (
          intersection.x >= boxMin.x &&
          intersection.x <= boxMax.x &&
          intersection.y >= boxMin.y &&
          intersection.y <= boxMax.y &&
          intersection.z >= boxMin.z &&
          intersection.z <= boxMax.z
        ) {
          const distance = rayOrigin.distanceTo(intersection);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIntersection = intersection.clone();
          }
        }
      }
    }

    if (closestIntersection) {
      return closestIntersection;
    }

    // Method 2: Project to closest point on cube surface
    const cubeCenter = new THREE.Vector3(0, 0, 0);
    const toCube = cubeCenter.clone().sub(rayOrigin);
    const projectionLength = Math.max(0, toCube.dot(rayDirection));

    const projectedPoint = rayOrigin
      .clone()
      .add(rayDirection.multiplyScalar(projectionLength));

    // Find the closest point on the cube surface
    const clampedPoint = projectedPoint.clone();
    clampedPoint.clamp(boxMin, boxMax);

    return clampedPoint;
  }

  public calculateMouseEffects(
    basePosition: THREE.Vector3,
    time: number
  ): {
    scaleInfluence: number;
    positionInfluence: number;
    colorInfluence: number;
    rotationInfluence: { x: number; y: number; z: number };
    positionOffset: THREE.Vector3;
  } {
    const config = metaShapesConf.mouseInteraction;

    // Initialize results
    let totalIntensity = 0;
    let scaleInfluence = 0;
    const positionInfluence = 0;
    let colorInfluence = 0;
    let rotationInfluence = { x: 0, y: 0, z: 0 };
    const positionOffset = new THREE.Vector3();

    // Calculate influence from current mouse position
    const currentInfluence = this.calculateOrganicInfluence(
      basePosition,
      this.mouseWorldPosition,
      time
    );
    totalIntensity += currentInfluence;

    // Calculate influence from trail if enabled
    if (config.trailEnabled && this.mouseTrail.length > 0) {
      const currentTime = Date.now();
      const trailDuration = config.trailFadeTime * 1000;

      for (const trailPoint of this.mouseTrail) {
        const age = currentTime - trailPoint.timestamp;
        const ageFactor = Math.max(0, 1 - age / trailDuration); // Linear fade
        const smoothFade = ageFactor * ageFactor; // Smooth fade curve

        const trailInfluence = this.calculateOrganicInfluence(
          basePosition,
          trailPoint.position,
          time
        );

        totalIntensity +=
          trailInfluence * smoothFade * config.trailInfluenceStrength;
      }
    }

    // Apply effects if there's meaningful influence
    if (totalIntensity > 0.01) {
      // Use the current mouse position as primary direction for directional effects
      const mouseDirection = new THREE.Vector3()
        .subVectors(basePosition, this.mouseWorldPosition)
        .normalize();

      // Add organic curl-based offset to the direction
      const curlOffset = this.calculateCurlNoise(basePosition, time);
      curlOffset.multiplyScalar(config.curlNoiseStrength * 0.3);
      mouseDirection.add(curlOffset).normalize();

      switch (config.effectType) {
        case 'attraction':
          this.applyAttractionEffect(
            mouseDirection,
            totalIntensity,
            config,
            positionOffset
          );
          break;

        case 'repulsion':
          this.applyRepulsionEffect(
            mouseDirection,
            totalIntensity,
            config,
            positionOffset
          );
          break;

        case 'scale':
          scaleInfluence = this.applyScaleEffect(totalIntensity, config);
          break;

        case 'colorWave':
          colorInfluence = this.applyColorWaveEffect(
            basePosition.distanceTo(this.mouseWorldPosition),
            time,
            config
          );
          // Add trail color influences
          if (config.trailEnabled) {
            for (const trailPoint of this.mouseTrail) {
              const age = Date.now() - trailPoint.timestamp;
              const ageFactor = Math.max(
                0,
                1 - age / (config.trailFadeTime * 1000)
              );
              const trailColorInfluence = this.applyColorWaveEffect(
                basePosition.distanceTo(trailPoint.position),
                time,
                config
              );
              colorInfluence +=
                trailColorInfluence * ageFactor * config.trailInfluenceStrength;
            }
          }
          break;

        case 'rotationInfluence':
          rotationInfluence = this.applyRotationInfluenceEffect(
            mouseDirection,
            totalIntensity,
            config
          );
          break;

        case 'heightWave':
          positionOffset.y = this.applyHeightWaveEffect(
            basePosition.distanceTo(this.mouseWorldPosition),
            time,
            config
          );
          break;

        case 'combined': {
          // Apply multiple effects with organic blending
          const combinedIntensity = totalIntensity * 0.6;

          // Gentle attraction with curl noise
          this.applyAttractionEffect(
            mouseDirection,
            combinedIntensity * 0.3,
            config,
            positionOffset
          );

          // Scale effect
          scaleInfluence =
            this.applyScaleEffect(combinedIntensity, config) * 0.5;

          // Color wave with trail
          colorInfluence =
            this.applyColorWaveEffect(
              basePosition.distanceTo(this.mouseWorldPosition),
              time,
              config
            ) * 0.8;

          // Add trail color influences
          if (config.trailEnabled) {
            for (const trailPoint of this.mouseTrail) {
              const age = Date.now() - trailPoint.timestamp;
              const ageFactor = Math.max(
                0,
                1 - age / (config.trailFadeTime * 1000)
              );
              const trailColorInfluence = this.applyColorWaveEffect(
                basePosition.distanceTo(trailPoint.position),
                time,
                config
              );
              colorInfluence +=
                trailColorInfluence *
                ageFactor *
                config.trailInfluenceStrength *
                0.4;
            }
          }

          // Rotation influence with organic variation
          const rotInfluence = this.applyRotationInfluenceEffect(
            mouseDirection,
            combinedIntensity * 0.4,
            config
          );
          rotationInfluence.x = rotInfluence.x * 0.3;
          rotationInfluence.y = rotInfluence.y * 0.3;
          rotationInfluence.z = rotInfluence.z * 0.3;

          // Height wave with organic variations
          positionOffset.y +=
            this.applyHeightWaveEffect(
              basePosition.distanceTo(this.mouseWorldPosition),
              time,
              config
            ) * 0.4;

          // Add organic curl displacement
          const organicDisplacement = this.calculateCurlNoise(
            basePosition,
            time
          );
          organicDisplacement.multiplyScalar(combinedIntensity * 0.1);
          positionOffset.add(organicDisplacement);
          break;
        }
      }
    }

    return {
      scaleInfluence,
      positionInfluence,
      colorInfluence,
      rotationInfluence,
      positionOffset,
    };
  }

  private applyAttractionEffect(
    mouseDirection: THREE.Vector3,
    intensity: number,
    config: typeof metaShapesConf.mouseInteraction,
    positionOffset: THREE.Vector3
  ): void {
    const attractionForce = mouseDirection
      .clone()
      .multiplyScalar(-config.attractionStrength * intensity);
    positionOffset.add(attractionForce);
  }

  private applyRepulsionEffect(
    mouseDirection: THREE.Vector3,
    intensity: number,
    config: typeof metaShapesConf.mouseInteraction,
    positionOffset: THREE.Vector3
  ): void {
    const repulsionForce = mouseDirection
      .clone()
      .multiplyScalar(config.attractionStrength * intensity);
    positionOffset.add(repulsionForce);
  }

  private applyScaleEffect(
    intensity: number,
    config: typeof metaShapesConf.mouseInteraction
  ): number {
    return intensity * config.scaleMultiplier;
  }

  private applyColorWaveEffect(
    distance: number,
    time: number,
    config: typeof metaShapesConf.mouseInteraction
  ): number {
    const wavePhase = distance * 0.5 - time * config.colorWaveSpeed;
    return Math.sin(wavePhase) * 0.5 + 0.5; // Normalize to 0-1
  }

  private applyRotationInfluenceEffect(
    mouseDirection: THREE.Vector3,
    intensity: number,
    config: typeof metaShapesConf.mouseInteraction
  ): { x: number; y: number; z: number } {
    const rotationSpeed = config.rotationMultiplier * intensity;
    return {
      x: mouseDirection.y * rotationSpeed,
      y: mouseDirection.x * rotationSpeed,
      z: (mouseDirection.x + mouseDirection.y) * rotationSpeed * 0.5,
    };
  }

  private applyHeightWaveEffect(
    distance: number,
    time: number,
    config: typeof metaShapesConf.mouseInteraction
  ): number {
    const wavePhase = distance * 0.3 - time * 2;
    return Math.sin(wavePhase) * config.heightWaveAmplitude;
  }

  private updateMouseTrail(intersectPoint: THREE.Vector3): void {
    const currentTime = Date.now();
    const config = metaShapesConf.mouseInteraction;
    const trailDuration = config.trailFadeTime * 1000; // Convert to milliseconds

    // Remove old trail points
    this.mouseTrail = this.mouseTrail.filter(
      (point) => currentTime - point.timestamp < trailDuration
    );

    // Add new trail point if enough time has passed (avoid too many points)
    const timeSinceLastUpdate = currentTime - this.lastTrailUpdate;
    if (timeSinceLastUpdate > 50) {
      // Update every 50ms max
      this.mouseTrail.push({
        position: intersectPoint.clone(),
        timestamp: currentTime,
        influence: 1.0,
      });
      this.lastTrailUpdate = currentTime;

      // Limit trail length
      if (this.mouseTrail.length > config.trailLength) {
        this.mouseTrail.shift();
      }
    }
  }

  private calculateCurlNoise(
    position: THREE.Vector3,
    time: number
  ): THREE.Vector3 {
    const scale = metaShapesConf.mouseInteraction.curlNoiseScale;
    const eps = 0.05; // Reduced offset for smoother derivatives

    // Use slower time progression for smoother animation
    const smoothTime = time * 0.3;

    // Sample noise at different positions to calculate curl
    const px = this.noise.noise(
      position.x * scale,
      position.y * scale,
      smoothTime
    );

    // Calculate partial derivatives for curl with reduced sensitivity
    const dx =
      (this.noise.noise(
        (position.x + eps) * scale,
        position.y * scale,
        smoothTime
      ) -
        px) *
      0.5;
    const dy =
      (this.noise.noise(
        position.x * scale,
        (position.y + eps) * scale,
        smoothTime
      ) -
        px) *
      0.5;
    const dz =
      (this.noise.noise(position.x * scale, position.y * scale, smoothTime) -
        px) *
      0.5;

    return new THREE.Vector3(dy - dz, dz - dx, dx - dy);
  }

  private calculateDynamicRadius(
    basePosition: THREE.Vector3,
    time: number
  ): number {
    const config = metaShapesConf.mouseInteraction;
    const baseRadius = config.radius;

    // Use slower time progression for smoother variations
    const smoothTime = time * 0.2;

    // Add noise variation with reduced intensity
    const noiseValue = this.noise.noise(
      basePosition.x * config.radiusNoiseScale,
      basePosition.y * config.radiusNoiseScale,
      smoothTime
    );
    const noiseVariation = noiseValue * config.radiusNoiseAmplitude * 0.5; // Reduce intensity

    // Add sine wave variation with smoother frequency
    const sinVariation =
      Math.sin(smoothTime * config.radiusSinFrequency) *
      config.radiusSinAmplitude *
      0.5;

    return Math.max(0.5, baseRadius + noiseVariation + sinVariation);
  }

  private calculateOrganicInfluence(
    basePosition: THREE.Vector3,
    influencePoint: THREE.Vector3,
    time: number
  ): number {
    const config = metaShapesConf.mouseInteraction;

    // Calculate dynamic radius for this influence point
    const dynamicRadius = this.calculateDynamicRadius(basePosition, time);

    // Base distance
    const distance = basePosition.distanceTo(influencePoint);

    // Apply curl noise to create organic influence boundaries (reduced influence)
    const curlOffset = this.calculateCurlNoise(basePosition, time);
    curlOffset.multiplyScalar(config.curlNoiseStrength * 0.3); // Reduced multiplier

    // Modify the effective distance with curl noise (clamped to prevent extreme values)
    const curlInfluence = Math.max(
      -dynamicRadius * 0.3,
      Math.min(dynamicRadius * 0.3, curlOffset.length())
    );
    const organicDistance = Math.max(0, distance + curlInfluence);

    // Calculate falloff
    const normalizedDistance = Math.min(organicDistance / dynamicRadius, 1.0);
    const easeOutQuart = (x: number) => 1 - Math.pow(1 - x, 4);
    const naturalIntensity = easeOutQuart(1.0 - normalizedDistance);

    return naturalIntensity * config.intensity;
  }

  public updateSmoothMousePosition(deltaTime: number): void {
    const config = metaShapesConf.mouseInteraction;

    // If smoothing is very low, use direct position to prevent drift
    if (config.smoothingFactor < 0.1) {
      this.smoothedMousePosition.copy(this.targetMousePosition);
      this.mouseWorldPosition.copy(this.smoothedMousePosition);
    } else {
      // Use smoothing factor to interpolate between current and target position
      const smoothingSpeed = Math.max(0.01, 1 - config.smoothingFactor) * 8; // Reduced multiplier for better control
      const lerpFactor = Math.min(1, smoothingSpeed * deltaTime);

      // Smoothly interpolate to target position
      this.smoothedMousePosition.lerp(this.targetMousePosition, lerpFactor);

      // Update the main mouse position with smoothed version
      this.mouseWorldPosition.copy(this.smoothedMousePosition);
    }

    // Update trail with the actual mouse world position
    if (config.trailEnabled) {
      this.updateMouseTrail(this.mouseWorldPosition);
    }
  }

  public dispose(): void {
    // Remove mouse listener
    if (this.handleMouseMove) {
      this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    }

    // Clear mouse trail
    this.mouseTrail.length = 0;
  }

  // Getters for accessing mouse data if needed
  public getMouseWorldPosition(): THREE.Vector3 {
    return this.mouseWorldPosition;
  }

  public getSmoothedMousePosition(): THREE.Vector3 {
    return this.smoothedMousePosition;
  }

  public getMouseTrail(): Array<{
    position: THREE.Vector3;
    timestamp: number;
    influence: number;
  }> {
    return this.mouseTrail;
  }
}
