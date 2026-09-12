import * as THREE from 'three';
import { metaShapesConf, colorPalettes } from '../constants';

export class ColorManager {
  public calculateColor(
    x: number,
    y: number,
    z: number,
    nz: number,
    time: number,
    countPerSide: number,
    mouseColorInfluence: number
  ): THREE.Color {
    const colorConfig = metaShapesConf.color;
    const color = new THREE.Color();

    switch (colorConfig.mode) {
      case 'original':
        return this.calculateOriginalColor(
          nz,
          time,
          color,
          mouseColorInfluence
        );

      case 'palette':
        return this.calculatePaletteColor(
          x,
          y,
          z,
          nz,
          time,
          countPerSide,
          color,
          mouseColorInfluence
        );

      case 'rainbow':
        return this.calculateRainbowColor(
          x,
          y,
          z,
          nz,
          time,
          countPerSide,
          color,
          mouseColorInfluence
        );

      case 'distance':
        return this.calculateDistanceColor(
          x,
          y,
          z,
          nz,
          time,
          countPerSide,
          color,
          mouseColorInfluence
        );

      case 'position':
        return this.calculatePositionColor(
          x,
          y,
          z,
          nz,
          time,
          countPerSide,
          color,
          mouseColorInfluence
        );

      default:
        return this.calculateOriginalColor(
          nz,
          time,
          color,
          mouseColorInfluence
        );
    }
  }

  private calculateOriginalColor(
    nz: number,
    time: number,
    color: THREE.Color,
    mouseColorInfluence: number
  ): THREE.Color {
    const config = metaShapesConf.color;
    const hue =
      config.baseHue +
      nz * config.noiseInfluence +
      time * config.timeInfluence +
      mouseColorInfluence * 0.3;
    color.setHSL(
      hue,
      config.saturation + mouseColorInfluence * 0.2,
      config.lightness + nz * 0.1 + mouseColorInfluence * 0.3
    );
    return color;
  }

  private calculatePaletteColor(
    x: number,
    y: number,
    z: number,
    nz: number,
    time: number,
    countPerSide: number,
    color: THREE.Color,
    mouseColorInfluence: number
  ): THREE.Color {
    const config = metaShapesConf.color;
    const palette = colorPalettes[config.paletteIndex];

    // Use noise and position to select from palette
    const factor = (nz + 3) / 6; // Normalize noise from -3,3 to 0,1
    const timeFactor = Math.sin(time * config.timeInfluence * 10) * 0.5 + 0.5;
    const positionFactor = (x + y + z) / (countPerSide * 3);

    const combinedFactor =
      (factor * 0.6 +
        timeFactor * 0.2 +
        positionFactor * 0.2 +
        mouseColorInfluence * 0.4) %
      1;
    const paletteIndex = combinedFactor * (palette.hues.length - 1);
    const index = Math.floor(paletteIndex);
    const t = paletteIndex - index;

    // Interpolate between two palette colors
    const hue1 = palette.hues[index];
    const sat1 = palette.saturations[index];
    const light1 = palette.lightnesses[index];

    const nextIndex = Math.min(index + 1, palette.hues.length - 1);
    const hue2 = palette.hues[nextIndex];
    const sat2 = palette.saturations[nextIndex];
    const light2 = palette.lightnesses[nextIndex];

    const finalHue = hue1 + (hue2 - hue1) * t;
    const finalSat = sat1 + (sat2 - sat1) * t + mouseColorInfluence * 0.3;
    const finalLight =
      light1 + (light2 - light1) * t + nz * 0.05 + mouseColorInfluence * 0.4;

    color.setHSL(
      finalHue % 1,
      Math.max(0.1, Math.min(1.0, finalSat)),
      Math.max(0.1, Math.min(0.9, finalLight))
    );
    return color;
  }

  private calculateRainbowColor(
    x: number,
    y: number,
    z: number,
    nz: number,
    time: number,
    countPerSide: number,
    color: THREE.Color,
    mouseColorInfluence: number
  ): THREE.Color {
    const config = metaShapesConf.color;
    const normalizedX = x / (countPerSide - 1);
    const normalizedY = y / (countPerSide - 1);
    const normalizedZ = z / (countPerSide - 1);

    const hue =
      (normalizedX +
        normalizedY * 0.5 +
        normalizedZ * 0.3 +
        time * config.timeInfluence +
        mouseColorInfluence * 0.5) %
      1;
    const saturation = config.saturation + mouseColorInfluence * 0.2;
    const lightness =
      config.lightness +
      nz * config.noiseInfluence +
      Math.sin(time * 2 + x * 0.1) * 0.1 +
      mouseColorInfluence * 0.3;

    color.setHSL(
      hue,
      Math.max(0.1, Math.min(1.0, saturation)),
      Math.max(0.1, Math.min(0.9, lightness))
    );
    return color;
  }

  private calculateDistanceColor(
    x: number,
    y: number,
    z: number,
    nz: number,
    time: number,
    countPerSide: number,
    color: THREE.Color,
    mouseColorInfluence: number
  ): THREE.Color {
    const config = metaShapesConf.color;
    const centerX = (countPerSide - 1) / 2;
    const centerY = (countPerSide - 1) / 2;
    const centerZ = (countPerSide - 1) / 2;

    const distance = Math.sqrt(
      Math.pow(x - centerX, 2) +
        Math.pow(y - centerY, 2) +
        Math.pow(z - centerZ, 2)
    );
    const maxDistance = Math.sqrt(3 * Math.pow(centerX, 2));
    const normalizedDistance = distance / maxDistance;

    const hue =
      (config.baseHue +
        normalizedDistance * config.hueRange +
        time * config.timeInfluence +
        mouseColorInfluence * 0.4) %
      1;
    const saturation = config.saturation + mouseColorInfluence * 0.2;
    const lightness =
      config.lightness +
      nz * config.noiseInfluence +
      normalizedDistance * 0.3 +
      mouseColorInfluence * 0.3;

    color.setHSL(
      hue,
      Math.max(0.1, Math.min(1.0, saturation)),
      Math.max(0.1, Math.min(0.9, lightness))
    );
    return color;
  }

  private calculatePositionColor(
    x: number,
    y: number,
    z: number,
    nz: number,
    time: number,
    countPerSide: number,
    color: THREE.Color,
    mouseColorInfluence: number
  ): THREE.Color {
    const config = metaShapesConf.color;
    const normalizedX = x / (countPerSide - 1);
    const normalizedY = y / (countPerSide - 1);
    const normalizedZ = z / (countPerSide - 1);

    const hue =
      (config.baseHue +
        normalizedX * config.hueRange +
        time * config.timeInfluence +
        mouseColorInfluence * 0.4) %
      1;
    const saturation =
      config.saturation - normalizedY * 0.3 + mouseColorInfluence * 0.2;
    const lightness =
      config.lightness +
      normalizedZ * 0.4 +
      nz * config.noiseInfluence +
      mouseColorInfluence * 0.3;

    color.setHSL(
      hue,
      Math.max(0.2, Math.min(1.0, saturation)),
      Math.max(0.1, Math.min(0.9, lightness))
    );
    return color;
  }
}
