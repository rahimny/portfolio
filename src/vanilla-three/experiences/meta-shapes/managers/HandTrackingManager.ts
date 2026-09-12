import * as THREE from 'three';
import { ResourceScope } from '../../../ResourceScope';
import { metaShapesConf } from '../constants';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  HandLandmarker,
  HandLandmarkerResult,
} from '@mediapipe/tasks-vision';

const MEDIAPIPE_VERSION = '0.10.22-rc.20250304';

// Moving average filter for smoothing
class MovingAverageFilter {
  private values: THREE.Vector3[] = [];
  private maxSamples: number;

  constructor(maxSamples: number = 5) {
    this.maxSamples = maxSamples;
  }

  update(value: THREE.Vector3): THREE.Vector3 {
    this.values.push(value.clone());
    if (this.values.length > this.maxSamples) {
      this.values.shift();
    }

    const sum = new THREE.Vector3();
    this.values.forEach((v) => sum.add(v));
    return sum.divideScalar(this.values.length);
  }

  reset(): void {
    this.values = [];
  }
}

export class HandTrackingManager {
  private scope?: ResourceScope;
  private pending?: Promise<boolean>;
  private disposed = false;
  private gestureOverlay: HTMLDivElement | null = null;
  private camera: THREE.PerspectiveCamera;
  // private canvas: HTMLCanvasElement; // Removed as not used in dual hand tracking
  private controls: OrbitControls | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private mediaStream: MediaStream | null = null;

  // Canvas overlay for drawing hand landmarks
  private canvasElement: HTMLCanvasElement | null = null;
  private canvasContext: CanvasRenderingContext2D | null = null;

  // Hand tracking state - now supporting dual hands
  private handLandmarker: HandLandmarker | null = null;
  private handPosition = new THREE.Vector3();
  private smoothedHandPosition = new THREE.Vector3();
  private targetHandPosition = new THREE.Vector3();
  private isHandDetected = false;
  private handedness: 'Left' | 'Right' | null = null;
  private handConfidence = 0;

  // Dual hand tracking - separate hands for different functions
  private leftHand = {
    detected: false,
    confidence: 0,
    position: new THREE.Vector3(),
    smoothedPosition: new THREE.Vector3(),
    targetPosition: new THREE.Vector3(),
    landmarks: null as Array<{ x: number; y: number; z: number }> | null,
    lastValidPosition: new THREE.Vector3(),
    isPinching: false,
    handSpread: 0.5,
  };

  private rightHand = {
    detected: false,
    confidence: 0,
    position: new THREE.Vector3(),
    smoothedPosition: new THREE.Vector3(),
    targetPosition: new THREE.Vector3(),
    landmarks: null as Array<{ x: number; y: number; z: number }> | null,
    lastValidPosition: new THREE.Vector3(),
    isPinching: false,
    handSpread: 0.5,
  };

  // Hand role assignment - can be swapped
  private cameraControlHand: 'left' | 'right' = 'left'; // Left hand for camera control
  private effectsHand: 'left' | 'right' = 'right'; // Right hand for cube effects

  // Individual finger tracking for frequency effects
  private fingerPositions = {
    thumb: new THREE.Vector3(),
    index: new THREE.Vector3(),
    middle: new THREE.Vector3(),
    ring: new THREE.Vector3(),
    pinky: new THREE.Vector3(),
  };
  private fingerActive = {
    thumb: false,
    index: false,
    middle: false,
    ring: false,
    pinky: false,
  };
  private fingerFrequencies = {
    thumb: 0.5, // Low frequency - deep bass-like effects
    index: 1.0, // Medium-low frequency
    middle: 1.5, // Medium frequency
    ring: 2.0, // Medium-high frequency
    pinky: 3.0, // High frequency - treble-like effects
  };
  private fingerColors = {
    thumb: '#ff4444', // Red
    index: '#44ff44', // Green
    middle: '#4444ff', // Blue
    ring: '#ffff44', // Yellow
    pinky: '#ff44ff', // Magenta
  };

  // Hand spread for radius control
  private handSpread = 0.5; // 0 = closed, 1 = fully open
  private handSpreadFilter = new MovingAverageFilter(2); // Reduce from 3 for more responsiveness

  // Improved smoothing and stability - make more responsive like mouse
  private positionFilter = new MovingAverageFilter(2); // Reduce from 3 for more responsiveness
  private lastValidPosition = new THREE.Vector3();
  private positionStabilityThreshold = 0.8; // Increase from 0.2 for less strict stability
  private handLostTimer = 0;
  private handLostThreshold = 300; // Reduce from 500ms for quicker hand loss detection

  // Gesture detection with hysteresis - enable pinch for camera rotation
  private isPinching = false;
  private isPointing = false;
  private isFist = false;
  private isTwisting = false;

  // Pinch detection settings
  private pinchThreshold = 0.06; // Distance threshold for pinch detection
  private pinchHysteresis = 0.02; // Hysteresis to prevent flickering

  // Camera rotation state for pinch control
  private lastPinchPosition = new THREE.Vector2();
  private pinchStartPosition = new THREE.Vector2();
  private cameraControlEnabled = false;

  // Trail tracking with improved timing
  private handTrail: Array<{
    position: THREE.Vector3;
    timestamp: number;
    influence: number;
  }> = [];
  private lastTrailUpdate = 0;
  private trailUpdateInterval = 33; // ~30 FPS for trails

  // Raycasting for 3D position calculation
  private raycaster = new THREE.Raycaster();

  // Animation frame ID for cleanup
  private animationFrameId: number | null = null;
  private lastUpdateTime = 0;
  private detectionInterval = 66; // ~15 FPS instead of 30+ FPS for better performance

  // Performance and state management
  private isPaused = false;
  private isInitialized = false;
  private performanceMode = false; // Skip some expensive calculations when true

  // Performance monitoring
  private lastPerformanceCheck = 0;
  private frameCount = 0;
  private actualFPS = 0;

  // Callbacks
  private onHandResults?: (
    position: THREE.Vector3,
    gestures: {
      isPinching: boolean;
      isPointing: boolean;
      isFist: boolean;
      isTwisting: boolean;
    }
  ) => void;

  constructor(camera: THREE.PerspectiveCamera, controls?: OrbitControls) {
    this.camera = camera;
    this.controls = controls || null;

    // Initialize hand positions
    this.smoothedHandPosition.set(0, 0, 0);
    this.targetHandPosition.set(0, 0, 0);
    this.handPosition.set(0, 0, 0);
    this.lastValidPosition.set(0, 0, 0);

    // Store initial camera distance for zoom reference - DISABLED
    // if (this.controls) {
    //   this.initialCameraDistance = this.camera.position.distanceTo(
    //     this.controls.target
    //   );
    // }
  }

  public init(signal?: AbortSignal): Promise<boolean> {
    if (this.disposed || signal?.aborted) return Promise.resolve(false);
    if (this.pending) return this.pending;
    if (this.isInitialized) return Promise.resolve(true);
    this.isPaused = false;
    const scope = new ResourceScope();
    this.scope = scope;
    const abort = () => {
      if (this.scope === scope) this.pause();
      else scope.dispose();
    };
    signal?.addEventListener('abort', abort, { once: true });
    scope.defer(() => signal?.removeEventListener('abort', abort));
    const pending = this.initialise(scope).finally(() => {
      if (this.pending === pending) this.pending = undefined;
    });
    this.pending = pending;
    return pending;
  }

  private async initialise(scope: ResourceScope): Promise<boolean> {
    try {
      console.log('HandTrackingManager: Attempting to initialize...');

      // Try dynamic import instead
      const { FilesetResolver, HandLandmarker } = await scope.wait(
        import('@mediapipe/tasks-vision')
      );
      console.log('HandTrackingManager: MediaPipe import successful');

      // Initialize MediaPipe Tasks Vision
      const vision = await scope.wait(
        FilesetResolver.forVisionTasks(
          `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
        )
      );
      console.log('HandTrackingManager: FilesetResolver initialized');

      // Create Hand Landmarker with optimized settings for dual hand tracking
      this.handLandmarker = await scope.acquire(
        HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          },
          runningMode: 'VIDEO',
          numHands: 2, // Enable dual hand tracking
          minHandDetectionConfidence: 0.7, // Slightly lower for dual hands
          minHandPresenceConfidence: 0.6, // Slightly lower for dual hands
          minTrackingConfidence: 0.5, // Lower for better continuity with two hands
        }),
        (landmarker) => landmarker.close()
      );
      console.log('HandTrackingManager: HandLandmarker created');

      // Create video element for camera feed - move to left side with shadcn styling
      const video = document.createElement('video');
      this.videoElement = video;
      scope.defer(() => {
        video.pause();
        video.srcObject = null;
        video.remove();
      });
      this.videoElement.autoplay = true;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;
      this.videoElement.style.position = 'fixed';
      this.videoElement.style.top = '20px';
      this.videoElement.style.left = '20px'; // Move to left side
      this.videoElement.style.width = '280px'; // Slightly larger
      this.videoElement.style.height = '210px';
      this.videoElement.style.zIndex = '1000';
      this.videoElement.style.border = '1px solid hsl(var(--border))'; // shadcn border
      this.videoElement.style.borderRadius = '12px'; // shadcn rounded-xl
      this.videoElement.style.boxShadow =
        '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)'; // shadcn shadow-lg
      this.videoElement.style.transform = 'scaleX(-1)'; // Mirror the video
      this.videoElement.style.backgroundColor = 'hsl(var(--background))'; // shadcn background
      document.body.appendChild(this.videoElement);

      // Create canvas overlay for drawing hand landmarks - match video position
      const canvas = document.createElement('canvas');
      this.canvasElement = canvas;
      scope.defer(() => canvas.remove());
      this.canvasElement.width = 280;
      this.canvasElement.height = 210;
      this.canvasElement.style.position = 'fixed';
      this.canvasElement.style.top = '20px';
      this.canvasElement.style.left = '20px'; // Move to left side
      this.canvasElement.style.width = '280px';
      this.canvasElement.style.height = '210px';
      this.canvasElement.style.zIndex = '1001'; // Above video
      this.canvasElement.style.pointerEvents = 'none'; // Don't block video clicks
      this.canvasElement.style.transform = 'scaleX(-1)'; // Mirror to match video
      this.canvasElement.style.borderRadius = '12px'; // Match video border radius
      document.body.appendChild(this.canvasElement);

      this.canvasContext = this.canvasElement.getContext('2d');

      // Create gesture status overlay with shadcn styling
      const gestureOverlay = document.createElement('div');
      this.gestureOverlay = gestureOverlay;
      scope.defer(() => gestureOverlay.remove());
      gestureOverlay.id = 'gesture-status-overlay';
      gestureOverlay.style.position = 'fixed';
      gestureOverlay.style.top = '240px'; // Below the video (20px + 210px + 10px spacing)
      gestureOverlay.style.left = '20px'; // Match video left position
      gestureOverlay.style.width = '280px'; // Match video width
      gestureOverlay.style.padding = '12px'; // shadcn p-3
      gestureOverlay.style.background = 'hsl(var(--background) / 0.95)'; // shadcn semi-transparent background
      gestureOverlay.style.backdropFilter = 'blur(8px)'; // shadcn backdrop-blur-sm
      gestureOverlay.style.color = 'hsl(var(--foreground))'; // shadcn text color
      gestureOverlay.style.fontSize = '12px'; // shadcn text-xs
      gestureOverlay.style.borderRadius = '12px'; // shadcn rounded-xl
      gestureOverlay.style.border = '1px solid hsl(var(--border))'; // shadcn border
      gestureOverlay.style.fontFamily =
        "ui-monospace, SFMono-Regular, 'SF Mono', monospace"; // monospace font
      gestureOverlay.style.zIndex = '1001';
      gestureOverlay.style.boxShadow =
        '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)'; // shadcn shadow-lg
      gestureOverlay.innerHTML =
        '<div style="color: hsl(var(--muted-foreground));">No hand detected</div>';
      document.body.appendChild(gestureOverlay);

      // Get camera stream with optimized settings
      this.mediaStream = await scope.acquire(
        navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640, max: 1280 }, // Lower resolution for better performance
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 30 },
            facingMode: 'user',
          },
        }),
        (stream) => stream.getTracks().forEach((track) => track.stop())
      );

      video.srcObject = this.mediaStream;
      await scope.wait(video.play());
      console.log('HandTrackingManager: Video stream started');

      // Start hand detection loop
      this.startDetection();

      console.log('Hand tracking initialized successfully');
      return true;
    } catch (error) {
      if (!scope.signal.aborted)
        console.error('Failed to initialize hand tracking:', error);
      if (this.scope === scope) this.releaseResources();
      else scope.dispose();
      return false;
    }
  }

  private startDetection(): void {
    const detectHands = (currentTime: number) => {
      if (this.disposed || this.isPaused || !this.isInitialized) return;

      if (
        this.handLandmarker &&
        this.videoElement &&
        this.videoElement.readyState >= 2
      ) {
        // Throttle detection to ~15 FPS for better performance (was ~30 FPS)
        if (currentTime - this.lastUpdateTime > this.detectionInterval) {
          const results = this.handLandmarker.detectForVideo(
            this.videoElement,
            currentTime
          );
          this.processHandResults(results, currentTime);
          this.lastUpdateTime = currentTime;

          // Update FPS counter
          this.frameCount++;
          if (currentTime - this.lastPerformanceCheck > 1000) {
            // Every second
            this.actualFPS = this.frameCount;
            this.frameCount = 0;
            this.lastPerformanceCheck = currentTime;
          }
        }
      }

      this.animationFrameId = requestAnimationFrame(detectHands);
    };

    this.isInitialized = true;
    detectHands(performance.now());
  }

  private processHandResults(
    results: HandLandmarkerResult,
    currentTime: number
  ): void {
    // Early exit if paused
    if (this.isPaused) {
      return;
    }

    // Reset both hands
    this.leftHand.detected = false;
    this.rightHand.detected = false;

    if (
      results.landmarks &&
      results.landmarks.length > 0 &&
      results.handednesses &&
      results.handednesses.length > 0
    ) {
      // Process each detected hand
      for (let i = 0; i < results.landmarks.length && i < 2; i++) {
        const landmarks = results.landmarks[i];
        const handedness = results.handednesses[i][0];
        const confidence = handedness.score;

        // Only process if confidence is high enough
        if (confidence > metaShapesConf.handTracking.minTrackingConfidence) {
          const isLeftHand = handedness.categoryName === 'Left';
          const hand = isLeftHand ? this.leftHand : this.rightHand;

          // Update hand state
          hand.detected = true;
          hand.confidence = confidence;
          hand.landmarks = landmarks;

          // Use index finger tip (landmark 8) as the primary control point
          this.calculateHandPositionForHand(landmarks[8], hand);

          // Calculate hand spread for this hand
          this.calculateHandSpreadForHand(landmarks, hand);

          // Apply position filtering for this hand
          this.applyPositionFilteringForHand(hand);

          // Process based on hand role
          if (
            (isLeftHand && this.cameraControlHand === 'left') ||
            (!isLeftHand && this.cameraControlHand === 'right')
          ) {
            // This hand is assigned to camera control
            this.processCameraControlHand(landmarks, hand);
          }

          if (
            (isLeftHand && this.effectsHand === 'left') ||
            (!isLeftHand && this.effectsHand === 'right')
          ) {
            // This hand is assigned to cube effects
            this.processEffectsHand(landmarks, hand, currentTime);
          }
        }
      }

      // Update legacy single-hand properties for backward compatibility
      this.updateLegacyHandProperties();

      // Draw all detected hands
      this.drawAllHandLandmarks();

      // Update gesture overlay
      this.updateGestureOverlay();

      // Trigger callback with combined hand data
      if (this.onHandResults) {
        this.onHandResults(this.handPosition, {
          isPinching: this.isPinching,
          isPointing: this.isPointing,
          isFist: this.isFist,
          isTwisting: this.isTwisting,
        });
      }
    } else {
      // No hands detected - handle loss
      this.handleNoHandsDetected(currentTime);
    }
  }

  private handleNoHandsDetected(currentTime: number): void {
    // Similar to old handleLowConfidenceOrLoss but for dual hands
    this.handLostTimer += 16;

    if (this.handLostTimer > this.handLostThreshold) {
      // Reset all hand states
      this.leftHand.detected = false;
      this.leftHand.confidence = 0;
      this.rightHand.detected = false;
      this.rightHand.confidence = 0;

      this.isHandDetected = false;
      this.handConfidence = 0;
      this.positionFilter.reset();

      // End camera control if active
      if (this.isPinching) {
        this.isPinching = false;
        this.leftHand.isPinching = false;
        this.rightHand.isPinching = false;
        this.endCameraControl();
      }
      this.cameraControlEnabled = false;

      // Clear canvas overlay
      if (this.canvasContext && this.canvasElement) {
        this.canvasContext.clearRect(
          0,
          0,
          this.canvasElement.width,
          this.canvasElement.height
        );
      }

      // Re-enable orbit controls
      if (this.controls) {
        this.controls.enableRotate = true;
      }

      // Update overlay
      this.updateGestureOverlay();

      // Log the time when hands were lost for debugging
      console.log(`Hands lost at time: ${currentTime}`);
    }
  }

  private calculateHandPositionForHand(
    indexFingerTip: { x: number; y: number; z: number },
    hand: typeof this.leftHand
  ): void {
    // Convert normalized coordinates to normalized device coordinates
    const x = (indexFingerTip.x - 0.5) * 2; // Center around 0, range -1 to 1
    const y = -((indexFingerTip.y - 0.5) * 2); // Flip Y and center, range -1 to 1

    // Calculate 3D position for this specific hand
    this.calculateHandPositionInCubeForHand(x, y, indexFingerTip.z, hand);
  }

  private calculateHandPositionInCubeForHand(
    x: number,
    y: number,
    z: number,
    hand: typeof this.leftHand
  ): void {
    const countPerSide = metaShapesConf.instanceMesh.countPerSide;
    const spacing = metaShapesConf.instanceMesh.spacing;
    const gridExtent = (countPerSide - 1) * spacing * 0.5;

    // Direct mapping from hand coordinates to 3D space
    const handX = x * gridExtent * 1.2;
    const handY = y * gridExtent * 1.2;

    // Use depth from MediaPipe more directly
    const depthRange = gridExtent * 0.8;
    const handZ =
      (z - 0.5) *
      depthRange *
      metaShapesConf.handTracking.depthSensitivity *
      0.1;

    // Clamp to cube bounds
    hand.targetPosition.set(
      Math.max(-gridExtent, Math.min(gridExtent, handX)),
      Math.max(-gridExtent, Math.min(gridExtent, handY)),
      Math.max(-gridExtent, Math.min(gridExtent, handZ))
    );
  }

  private calculateHandSpreadForHand(
    landmarks: Array<{ x: number; y: number; z: number }>,
    hand: typeof this.leftHand
  ): void {
    // Calculate distance between thumb tip and pinky tip for hand spread
    const thumbTip = landmarks[4];
    const pinkyTip = landmarks[20];

    const spreadDistance = Math.sqrt(
      Math.pow(thumbTip.x - pinkyTip.x, 2) +
        Math.pow(thumbTip.y - pinkyTip.y, 2) +
        Math.pow(thumbTip.z - pinkyTip.z, 2)
    );

    // Normalize spread distance
    const normalizedSpread = Math.max(0, Math.min(1, spreadDistance / 0.15));
    hand.handSpread = normalizedSpread;
  }

  private applyPositionFilteringForHand(hand: typeof this.leftHand): void {
    // Simple position filtering for each hand
    const positionDelta = hand.targetPosition.distanceTo(
      hand.lastValidPosition
    );

    if (
      positionDelta < this.positionStabilityThreshold ||
      hand.lastValidPosition.length() === 0
    ) {
      hand.lastValidPosition.copy(hand.targetPosition);
    } else {
      // For very large jumps, use interpolation
      hand.targetPosition.lerpVectors(
        hand.lastValidPosition,
        hand.targetPosition,
        0.7
      );
      hand.lastValidPosition.copy(hand.targetPosition);
    }
  }

  private processCameraControlHand(
    landmarks: Array<{ x: number; y: number; z: number }>,
    hand: typeof this.leftHand
  ): void {
    // Detect pinch gesture for camera rotation
    this.detectPinchGestureForHand(landmarks, hand);
  }

  private processEffectsHand(
    landmarks: Array<{ x: number; y: number; z: number }>,
    hand: typeof this.leftHand,
    currentTime: number
  ): void {
    // Calculate individual finger positions and activity for effects
    this.calculateFingerPositions(landmarks);

    // Update trail with better timing for effects hand
    this.updateHandTrail(hand.targetPosition, currentTime);
  }

  private detectPinchGestureForHand(
    landmarks: Array<{ x: number; y: number; z: number }>,
    hand: typeof this.leftHand
  ): void {
    // Calculate distance between thumb tip and index finger tip for pinch detection
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];

    const pinchDistance = Math.sqrt(
      Math.pow(thumbTip.x - indexTip.x, 2) +
        Math.pow(thumbTip.y - indexTip.y, 2) +
        Math.pow(thumbTip.z - indexTip.z, 2)
    );

    // Apply hysteresis to prevent flickering
    const currentThreshold = hand.isPinching
      ? this.pinchThreshold + this.pinchHysteresis
      : this.pinchThreshold;

    const wasPinching = hand.isPinching;
    hand.isPinching = pinchDistance < currentThreshold;

    // Handle pinch state changes for camera control
    if (hand.isPinching && !wasPinching) {
      this.startCameraControl(landmarks);
    } else if (!hand.isPinching && wasPinching) {
      this.endCameraControl();
    } else if (hand.isPinching) {
      this.updateCameraRotation(landmarks);
    }
  }

  private updateLegacyHandProperties(): void {
    // Update legacy properties for backward compatibility
    // Prioritize effects hand for cube interactions
    const effectsHandData =
      this.effectsHand === 'left' ? this.leftHand : this.rightHand;
    const cameraHandData =
      this.cameraControlHand === 'left' ? this.leftHand : this.rightHand;

    if (effectsHandData.detected) {
      this.handPosition.copy(effectsHandData.targetPosition);
      this.targetHandPosition.copy(effectsHandData.targetPosition);
      this.handConfidence = effectsHandData.confidence;
      this.handedness = this.effectsHand === 'left' ? 'Left' : 'Right';
      this.handSpread = effectsHandData.handSpread;
      this.isHandDetected = true;
    } else if (cameraHandData.detected) {
      this.handPosition.copy(cameraHandData.targetPosition);
      this.targetHandPosition.copy(cameraHandData.targetPosition);
      this.handConfidence = cameraHandData.confidence;
      this.handedness = this.cameraControlHand === 'left' ? 'Left' : 'Right';
      this.handSpread = cameraHandData.handSpread;
      this.isHandDetected = true;
    } else {
      this.isHandDetected = false;
      this.handConfidence = 0;
    }

    // Update pinch state based on camera control hand
    this.isPinching = cameraHandData.isPinching;
  }

  private drawAllHandLandmarks(): void {
    if (!this.canvasContext || !this.canvasElement) return;

    const canvasWidth = this.canvasElement.width;
    const canvasHeight = this.canvasElement.height;

    // Clear the canvas
    this.canvasContext.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw left hand if detected
    if (this.leftHand.detected && this.leftHand.landmarks) {
      this.drawSingleHandLandmarks(
        this.leftHand.landmarks,
        '#00ff88',
        this.leftHand.isPinching
      );
    }

    // Draw right hand if detected
    if (this.rightHand.detected && this.rightHand.landmarks) {
      this.drawSingleHandLandmarks(
        this.rightHand.landmarks,
        '#88ff00',
        this.rightHand.isPinching
      );
    }
  }

  private drawSingleHandLandmarks(
    landmarks: Array<{ x: number; y: number; z: number }>,
    color: string,
    isPinching: boolean
  ): void {
    if (!this.canvasContext || !this.canvasElement) return;

    const canvasWidth = this.canvasElement.width;
    const canvasHeight = this.canvasElement.height;

    // Hand landmark connections
    const connections = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4], // Thumb
      [0, 5],
      [5, 6],
      [6, 7],
      [7, 8], // Index finger
      [0, 9],
      [9, 10],
      [10, 11],
      [11, 12], // Middle finger
      [0, 13],
      [13, 14],
      [14, 15],
      [15, 16], // Ring finger
      [0, 17],
      [17, 18],
      [18, 19],
      [19, 20], // Pinky
      [5, 9],
      [9, 13],
      [13, 17], // Palm connections
    ];

    // Draw connections
    this.canvasContext.strokeStyle = color;
    this.canvasContext.lineWidth = 2;
    this.canvasContext.lineCap = 'round';

    for (const [start, end] of connections) {
      if (landmarks[start] && landmarks[end]) {
        this.canvasContext.beginPath();
        this.canvasContext.moveTo(
          landmarks[start].x * canvasWidth,
          landmarks[start].y * canvasHeight
        );
        this.canvasContext.lineTo(
          landmarks[end].x * canvasWidth,
          landmarks[end].y * canvasHeight
        );
        this.canvasContext.stroke();
      }
    }

    // Draw landmark points
    this.canvasContext.fillStyle = color;
    for (let i = 0; i < landmarks.length; i++) {
      const landmark = landmarks[i];

      // Highlight thumb tip (4) and index tip (8) when pinching
      if (isPinching && (i === 4 || i === 8)) {
        this.canvasContext.fillStyle = '#ff0000';
        this.canvasContext.beginPath();
        this.canvasContext.arc(
          landmark.x * canvasWidth,
          landmark.y * canvasHeight,
          6,
          0,
          2 * Math.PI
        );
        this.canvasContext.fill();

        // Add pulsing ring for pinch landmarks
        this.canvasContext.strokeStyle = '#ff0000';
        this.canvasContext.lineWidth = 3;
        this.canvasContext.beginPath();
        this.canvasContext.arc(
          landmark.x * canvasWidth,
          landmark.y * canvasHeight,
          8 + Math.sin(performance.now() * 0.01) * 2,
          0,
          2 * Math.PI
        );
        this.canvasContext.stroke();

        this.canvasContext.fillStyle = color;
      } else {
        this.canvasContext.beginPath();
        this.canvasContext.arc(
          landmark.x * canvasWidth,
          landmark.y * canvasHeight,
          3,
          0,
          2 * Math.PI
        );
        this.canvasContext.fill();
      }
    }
  }

  private updateHandTrail(position: THREE.Vector3, currentTime: number): void {
    const config = metaShapesConf.mouseInteraction; // Reuse mouse interaction config

    // Add new trail point with improved timing
    if (currentTime - this.lastTrailUpdate > this.trailUpdateInterval) {
      this.handTrail.push({
        position: position.clone(),
        timestamp: currentTime,
        influence: 1.0,
      });

      this.lastTrailUpdate = currentTime;
    }

    // Remove old trail points
    const trailDuration = config.trailFadeTime * 1000;
    this.handTrail = this.handTrail.filter(
      (point) => currentTime - point.timestamp < trailDuration
    );

    // Update influence based on age with smoother curve
    this.handTrail.forEach((point) => {
      const age = currentTime - point.timestamp;
      const normalizedAge = age / trailDuration;
      // Use smoothstep for more natural fade
      point.influence =
        1 - normalizedAge * normalizedAge * (3 - 2 * normalizedAge);
    });
  }

  public calculateHandEffects(
    basePosition: THREE.Vector3,
    time: number
  ): {
    scaleInfluence: number;
    positionInfluence: number;
    colorInfluence: number;
    rotationInfluence: { x: number; y: number; z: number };
    positionOffset: THREE.Vector3;
  } {
    // Early exit if paused or not properly initialized
    if (
      this.isPaused ||
      !this.isInitialized ||
      !this.isHandDetected ||
      this.handConfidence < metaShapesConf.handTracking.minTrackingConfidence
    ) {
      return {
        scaleInfluence: 0,
        positionInfluence: 0,
        colorInfluence: 0,
        rotationInfluence: { x: 0, y: 0, z: 0 },
        positionOffset: new THREE.Vector3(),
      };
    }

    // Use mouse interaction settings but with dynamic radius based on hand spread
    const mouseConfig = metaShapesConf.mouseInteraction;
    let totalIntensity = 0;
    let scaleInfluence = 0;
    let colorInfluence = 0;
    const rotationInfluence = { x: 0, y: 0, z: 0 };
    const positionOffset = new THREE.Vector3();

    // Calculate dynamic radius based on hand spread
    // Range from 20% to 200% of the configured radius - more reasonable range
    const minRadiusMultiplier = 0.2; // Increase from 0.1 to 0.2
    const maxRadiusMultiplier = 2.0; // Reduce from 3.0 to 2.0
    const radiusMultiplier =
      minRadiusMultiplier +
      this.handSpread * (maxRadiusMultiplier - minRadiusMultiplier);
    const dynamicRadius = mouseConfig.radius * radiusMultiplier;

    // Calculate influence from current hand position
    const distance = basePosition.distanceTo(this.handPosition);

    if (distance < dynamicRadius) {
      const normalizedDistance = distance / dynamicRadius;
      const falloff = Math.pow(
        1 - normalizedDistance,
        mouseConfig.falloffPower
      );
      let intensity = falloff * mouseConfig.intensity;

      // Apply confidence scaling for smoother transitions
      intensity *= Math.min(1, this.handConfidence * 1.5);

      const finalIntensity = intensity;
      const effectType = mouseConfig.effectType;
      const handDirection = basePosition
        .clone()
        .sub(this.handPosition)
        .normalize();

      // Apply the same effects as mouse interaction
      if (effectType === 'attraction' || effectType === 'combined') {
        positionOffset.add(
          handDirection
            .clone()
            .multiplyScalar(-finalIntensity * mouseConfig.attractionStrength)
        );
      }

      if (effectType === 'repulsion' || effectType === 'combined') {
        positionOffset.add(
          handDirection
            .clone()
            .multiplyScalar(finalIntensity * mouseConfig.attractionStrength)
        );
      }

      if (effectType === 'scale' || effectType === 'combined') {
        scaleInfluence += finalIntensity * mouseConfig.scaleMultiplier;
      }

      if (effectType === 'colorWave' || effectType === 'combined') {
        const waveValue = Math.sin(
          time * mouseConfig.colorWaveSpeed + distance * 0.1
        );
        colorInfluence += finalIntensity * waveValue;
      }

      if (effectType === 'rotationInfluence' || effectType === 'combined') {
        rotationInfluence.x +=
          finalIntensity * mouseConfig.rotationMultiplier * handDirection.x;
        rotationInfluence.y +=
          finalIntensity * mouseConfig.rotationMultiplier * handDirection.y;
        rotationInfluence.z +=
          finalIntensity * mouseConfig.rotationMultiplier * handDirection.z;
      }

      totalIntensity += finalIntensity;
    }

    // Add trail effects if enabled (same as mouse)
    if (mouseConfig.trailEnabled && this.handTrail.length > 0) {
      this.handTrail.forEach((trailPoint) => {
        const trailDistance = basePosition.distanceTo(trailPoint.position);
        if (trailDistance < dynamicRadius) {
          const normalizedDistance = trailDistance / dynamicRadius;
          const falloff = Math.pow(
            1 - normalizedDistance,
            mouseConfig.falloffPower
          );
          const trailIntensity =
            falloff * mouseConfig.trailInfluenceStrength * trailPoint.influence;

          scaleInfluence += trailIntensity * 0.5;
          colorInfluence += trailIntensity;
        }
      });
    }

    // Add frequency-based effects from individual fingers
    if (!this.performanceMode) {
      // Skip expensive finger calculations in performance mode
      Object.keys(this.fingerPositions).forEach((fingerName) => {
        const finger = fingerName as keyof typeof this.fingerPositions;
        if (this.fingerActive[finger]) {
          const fingerPos = this.fingerPositions[finger];
          const fingerDistance = basePosition.distanceTo(fingerPos);
          const fingerRadius = dynamicRadius * 0.4; // Fingers have smaller radius than overall hand

          if (fingerDistance < fingerRadius) {
            const frequency = this.fingerFrequencies[finger];
            const normalizedDistance = fingerDistance / fingerRadius;
            const falloff = Math.pow(
              1 - normalizedDistance,
              mouseConfig.falloffPower
            );

            // Create frequency-based wave effects
            const waveValue = Math.sin(
              time * frequency * 2 + fingerDistance * frequency * 0.5
            );
            const pulseValue = Math.sin(time * frequency * 4) * 0.5 + 0.5;

            // Each finger adds its own frequency signature
            const fingerIntensity = falloff * mouseConfig.intensity * 0.3; // Reduce individual finger intensity

            // Frequency-based color waves
            colorInfluence += fingerIntensity * waveValue * frequency * 0.2;

            // Frequency-based scale pulsing
            scaleInfluence += fingerIntensity * pulseValue * 0.15;

            // Frequency-based position ripples
            const rippleDirection = basePosition
              .clone()
              .sub(fingerPos)
              .normalize();
            const rippleStrength =
              fingerIntensity *
              Math.sin(time * frequency * 3 + fingerDistance * 0.8) *
              0.1;
            positionOffset.add(rippleDirection.multiplyScalar(rippleStrength));

            // Frequency-based rotation
            rotationInfluence.x +=
              fingerIntensity *
              Math.sin(time * frequency + fingerDistance) *
              0.5;
            rotationInfluence.y +=
              fingerIntensity *
              Math.cos(time * frequency * 1.3 + fingerDistance) *
              0.5;
            rotationInfluence.z +=
              fingerIntensity *
              Math.sin(time * frequency * 0.7 + fingerDistance) *
              0.5;
          }
        }
      });
    }

    return {
      scaleInfluence,
      positionInfluence: totalIntensity,
      colorInfluence,
      rotationInfluence,
      positionOffset,
    };
  }

  public updateSmoothHandPosition(deltaTime: number): void {
    if (this.isHandDetected) {
      // Make hand movement much more responsive, like mouse interaction
      const confidenceMultiplier = Math.min(1, this.handConfidence * 1.5);

      // Much more responsive lerp factor - almost direct movement like mouse
      const lerpFactor = Math.min(
        1,
        deltaTime * 60 * confidenceMultiplier // Increase from 30 to 60 for much faster response
      );

      this.smoothedHandPosition.lerp(this.targetHandPosition, lerpFactor);
      this.handPosition.copy(this.smoothedHandPosition);
    }
  }

  public setResultCallback(
    callback: (
      position: THREE.Vector3,
      gestures: {
        isPinching: boolean;
        isPointing: boolean;
        isFist: boolean;
        isTwisting: boolean;
      }
    ) => void
  ): void {
    this.onHandResults = callback;
  }

  public getHandPosition(): THREE.Vector3 {
    return this.handPosition.clone();
  }

  public getHandTrail(): Array<{
    position: THREE.Vector3;
    timestamp: number;
    influence: number;
  }> {
    return [...this.handTrail];
  }

  public isHandActive(): boolean {
    return (
      this.isHandDetected &&
      this.handConfidence > metaShapesConf.handTracking.minTrackingConfidence
    );
  }

  public getGestures(): {
    isPinching: boolean;
    isPointing: boolean;
    isFist: boolean;
    isTwisting: boolean;
  } {
    return {
      isPinching: this.isPinching,
      isPointing: this.isPointing,
      isFist: this.isFist,
      isTwisting: this.isTwisting,
    };
  }

  public getHandedness(): 'Left' | 'Right' | null {
    return this.handedness;
  }

  public getHandConfidence(): number {
    return this.handConfidence;
  }

  public getHandSpread(): number {
    return this.handSpread;
  }

  public getDynamicRadius(): number {
    const mouseConfig = metaShapesConf.mouseInteraction;
    const minRadiusMultiplier = 0.2;
    const maxRadiusMultiplier = 2.0;
    const radiusMultiplier =
      minRadiusMultiplier +
      this.handSpread * (maxRadiusMultiplier - minRadiusMultiplier);
    return mouseConfig.radius * radiusMultiplier;
  }

  public getFingerPositions(): typeof this.fingerPositions {
    return { ...this.fingerPositions };
  }

  public getActiveFingers(): typeof this.fingerActive {
    return { ...this.fingerActive };
  }

  public getFingerFrequencies(): typeof this.fingerFrequencies {
    return { ...this.fingerFrequencies };
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  public pause(): void {
    this.isPaused = true;
    this.releaseResources();
  }

  public async resume(): Promise<void> {
    if (this.disposed || (!this.isPaused && this.isInitialized)) return;
    await this.init();
  }

  private releaseResources(): void {
    this.scope?.dispose();
    this.scope = undefined;
    this.pending = undefined;
    if (this.animationFrameId !== null)
      cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
    this.mediaStream = null;
    this.handLandmarker = null;
    this.videoElement = null;
    this.canvasElement = null;
    this.canvasContext = null;
    this.gestureOverlay = null;
    this.isInitialized = false;
    this.isHandDetected = false;
    this.handConfidence = 0;
    this.positionFilter.reset();
    this.handSpreadFilter.reset();
    this.handTrail.length = 0;
    if (this.controls) this.controls.enableRotate = true;
  }

  public async setPaused(paused: boolean): Promise<void> {
    if (paused) {
      this.pause();
    } else {
      await this.resume();
    }
  }

  public setPerformanceMode(enabled: boolean): void {
    this.performanceMode = enabled;
    if (enabled) {
      // Increase detection interval for even better performance
      this.detectionInterval = 100; // ~10 FPS
    } else {
      // Reset to default
      this.detectionInterval = 66; // ~15 FPS
    }
  }

  public getPerformanceMode(): boolean {
    return this.performanceMode;
  }

  public setCameraControlsEnabled(enabled: boolean): void {
    if (!enabled && this.controls) {
      this.controls.enableRotate = true; // Re-enable mouse rotation
      this.cameraControlEnabled = false;
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseResources();
  }

  private updateGestureOverlay(): void {
    const overlay = this.gestureOverlay;
    if (!overlay) return;

    if (this.isPaused) {
      overlay.innerHTML =
        '<div style="color: hsl(var(--muted-foreground));">Hand tracking paused</div>';
      return;
    }

    // Check if any hands are detected
    const anyHandDetected = this.leftHand.detected || this.rightHand.detected;

    if (!anyHandDetected) {
      overlay.innerHTML =
        '<div style="color: hsl(var(--muted-foreground));">No hands detected</div>';
      return;
    }

    // Show dual hand status
    const leftHandStatus = this.leftHand.detected
      ? `<span style="color: #00ff88; font-weight: 500;">LEFT</span> <span style="color: hsl(var(--muted-foreground));">(${Math.round(
          this.leftHand.confidence * 100
        )}%)</span>`
      : '<span style="color: hsl(var(--muted-foreground));">LEFT</span>';

    const rightHandStatus = this.rightHand.detected
      ? `<span style="color: #88ff00; font-weight: 500;">RIGHT</span> <span style="color: hsl(var(--muted-foreground));">(${Math.round(
          this.rightHand.confidence * 100
        )}%)</span>`
      : '<span style="color: hsl(var(--muted-foreground));">RIGHT</span>';

    // Determine which hand is doing what
    const cameraHand =
      this.cameraControlHand === 'left' ? this.leftHand : this.rightHand;
    const effectsHand =
      this.effectsHand === 'left' ? this.leftHand : this.rightHand;

    const cameraHandName = this.cameraControlHand.toUpperCase();
    const effectsHandName = this.effectsHand.toUpperCase();

    // Show active fingers for effects hand only
    const activeFingers: string[] = [];
    if (effectsHand.detected) {
      Object.keys(this.fingerActive).forEach((fingerName) => {
        const finger = fingerName as keyof typeof this.fingerActive;
        if (this.fingerActive[finger]) {
          const freq = this.fingerFrequencies[finger];
          const color = this.fingerColors[finger];
          activeFingers.push(
            `<span style="color: ${color}; font-weight: 500;">${fingerName.toUpperCase()}</span> <span style="color: hsl(var(--muted-foreground)); font-size: 10px;">(${freq}Hz)</span>`
          );
        }
      });
    }

    const baseRadius = metaShapesConf.mouseInteraction.radius;
    const currentRadius = effectsHand.detected
      ? baseRadius * (0.2 + effectsHand.handSpread * 1.8)
      : baseRadius;

    overlay.innerHTML = `
      <div style="color: hsl(var(--foreground)); font-weight: 600; margin-bottom: 6px;">
        ${leftHandStatus} • ${rightHandStatus}
      </div>
      <div style="color: hsl(var(--muted-foreground)); font-size: 11px; margin-bottom: 6px; line-height: 1.3;">
        🎥 Camera: <span style="color: ${
          cameraHand.detected ? '#00ff88' : 'hsl(var(--muted-foreground))'
        };">${cameraHandName}</span>
        ${
          cameraHand.isPinching
            ? ' <span style="color: #ff0000; font-weight: 600;">📌 PINCHING</span>'
            : ''
        }
        <br>
        🎵 Effects: <span style="color: ${
          effectsHand.detected ? '#88ff00' : 'hsl(var(--muted-foreground))'
        };">${effectsHandName}</span>
      </div>
      ${
        this.cameraControlEnabled
          ? '<div style="color: #ff6600; font-weight: 500; margin-bottom: 6px; font-size: 11px;">🎥 Camera Rotation Active</div>'
          : ''
      }
      <div style="color: hsl(var(--muted-foreground)); font-size: 10px; margin-bottom: 4px;">
        Spread: <span style="color: hsl(var(--foreground)); font-weight: 500;">${Math.round(
          (effectsHand.handSpread || 0) * 100
        )}%</span> | 
        Radius: <span style="color: hsl(var(--foreground)); font-weight: 500;">${currentRadius.toFixed(
          1
        )}</span> |
        FPS: <span style="color: hsl(var(--foreground)); font-weight: 500;">${
          this.actualFPS
        }</span>
      </div>
      ${
        effectsHand.detected
          ? `
        <div style="font-size: 10px; margin-bottom: 4px; line-height: 1.3;">
          ${
            activeFingers.length > 0
              ? activeFingers.join(' • ')
              : '<span style="color: hsl(var(--muted-foreground));">No fingers extended</span>'
          }
        </div>
      `
          : ''
      }
      <div style="color: hsl(var(--muted-foreground)); font-size: 9px; line-height: 1.2;">
        ${
          cameraHand.isPinching
            ? 'Pinch camera hand to rotate view'
            : effectsHand.detected
              ? 'Extend fingers on effects hand for frequencies'
              : 'Show both hands for full control'
        }
      </div>
    `;
  }

  private calculateFingerPositions(
    landmarks: Array<{ x: number; y: number; z: number }>
  ): void {
    // Finger tip landmark indices: thumb=4, index=8, middle=12, ring=16, pinky=20
    // Finger MCP (base) landmarks: thumb=2, index=5, middle=9, ring=13, pinky=17

    const fingerTips = {
      thumb: landmarks[4],
      index: landmarks[8],
      middle: landmarks[12],
      ring: landmarks[16],
      pinky: landmarks[20],
    };

    const fingerMCPs = {
      thumb: landmarks[2],
      index: landmarks[5],
      middle: landmarks[9],
      ring: landmarks[13],
      pinky: landmarks[17],
    };

    // Calculate 3D positions for each finger tip
    Object.keys(fingerTips).forEach((fingerName) => {
      const tip = fingerTips[fingerName as keyof typeof fingerTips];
      const x = tip.x * 2 - 1;
      const y = -(tip.y * 2 - 1);

      // Calculate 3D position similar to main hand position
      this.calculateFingerPositionInCube(
        x,
        y,
        tip.z,
        fingerName as keyof typeof this.fingerPositions
      );
    });

    // Determine which fingers are "active" (extended)
    Object.keys(fingerTips).forEach((fingerName) => {
      const tip = fingerTips[fingerName as keyof typeof fingerTips];
      const mcp = fingerMCPs[fingerName as keyof typeof fingerMCPs];

      // Calculate if finger is extended (tip is higher than base for most fingers)
      // Thumb has different logic since it moves sideways
      let isExtended = false;
      if (fingerName === 'thumb') {
        // For thumb, check if it's extended outward (distance from wrist)
        const wrist = landmarks[0];
        const thumbDistance = Math.sqrt(
          Math.pow(tip.x - wrist.x, 2) +
            Math.pow(tip.y - wrist.y, 2) +
            Math.pow(tip.z - wrist.z, 2)
        );
        isExtended = thumbDistance > 0.1; // Threshold for thumb extension
      } else {
        // For other fingers, check if tip is above MCP joint
        isExtended = tip.y < mcp.y - 0.02; // Negative because Y is flipped
      }

      this.fingerActive[fingerName as keyof typeof this.fingerActive] =
        isExtended;
    });
  }

  private calculateFingerPositionInCube(
    x: number,
    y: number,
    z: number,
    fingerName: keyof typeof this.fingerPositions
  ): void {
    // Set up raycaster from finger position
    const mouse = new THREE.Vector2(x, y);
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(mouse, this.camera);

    const countPerSide = metaShapesConf.instanceMesh.countPerSide;
    const spacing = metaShapesConf.instanceMesh.spacing;

    // Create bounding box for the cube grid
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
      // Use depth information from MediaPipe to adjust Z position
      const depthScale = metaShapesConf.handTracking.depthSensitivity;
      const adjustedZ = intersectPoint.z + (z - 0.5) * depthScale * 0.5;

      this.fingerPositions[fingerName as keyof typeof this.fingerPositions].set(
        intersectPoint.x,
        intersectPoint.y,
        Math.max(boxMin.z, Math.min(boxMax.z, adjustedZ))
      );
    } else {
      // Fallback positioning
      const fallbackDistance = gridExtent * 0.8;
      const rayDirection = this.raycaster.ray.direction.clone().normalize();
      const fallbackPoint = this.raycaster.ray.origin
        .clone()
        .add(rayDirection.multiplyScalar(fallbackDistance));

      this.fingerPositions[
        fingerName as keyof typeof this.fingerPositions
      ].copy(fallbackPoint);
      this.fingerPositions[
        fingerName as keyof typeof this.fingerPositions
      ].clamp(boxMin, boxMax);
    }
  }

  private startCameraControl(
    landmarks: Array<{ x: number; y: number; z: number }>
  ): void {
    if (!this.controls) return;

    console.log('Starting pinch camera control');
    this.cameraControlEnabled = true;

    // Store initial pinch position (midpoint between thumb and index)
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];

    this.pinchStartPosition.set(
      (thumbTip.x + indexTip.x) / 2,
      (thumbTip.y + indexTip.y) / 2
    );
    this.lastPinchPosition.copy(this.pinchStartPosition);

    // Don't disable orbit controls completely, we'll work with them
    this.controls.enableRotate = true;
  }

  private endCameraControl(): void {
    if (!this.controls) return;

    console.log('Ending pinch camera control');
    this.cameraControlEnabled = false;

    // Re-enable normal orbit controls
    this.controls.enableRotate = true;
  }

  private updateCameraRotation(
    landmarks: Array<{ x: number; y: number; z: number }>
  ): void {
    if (!this.controls || !this.cameraControlEnabled) return;

    // Calculate current pinch position (midpoint between thumb and index)
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];

    const currentPinchPosition = new THREE.Vector2(
      (thumbTip.x + indexTip.x) / 2,
      (thumbTip.y + indexTip.y) / 2
    );

    // Calculate movement delta
    const deltaX = (currentPinchPosition.x - this.lastPinchPosition.x) * 4; // Sensitivity multiplier
    const deltaY = (currentPinchPosition.y - this.lastPinchPosition.y) * 4;

    // Apply rotation using spherical coordinates (similar to orbit controls)
    const spherical = new THREE.Spherical();
    spherical.setFromVector3(
      this.camera.position.clone().sub(this.controls.target)
    );

    // Update spherical coordinates based on hand movement
    spherical.theta -= deltaX * Math.PI; // Horizontal rotation
    spherical.phi += deltaY * Math.PI; // Vertical rotation

    // Clamp vertical rotation to prevent flipping
    spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

    // Apply the new position
    const newPosition = new THREE.Vector3();
    newPosition.setFromSpherical(spherical).add(this.controls.target);
    this.camera.position.copy(newPosition);
    this.camera.lookAt(this.controls.target);

    // Update controls
    this.controls.update();

    // Store current position for next frame
    this.lastPinchPosition.copy(currentPinchPosition);
  }
}
