import ExperimentLayout from '@/components/ExperimentLayout';
import { ShaderGalleryExperience } from '@/vanilla-three/experiences/shaders/ShaderGalleryExperience';
import { useParams, Navigate } from 'react-router-dom';
import type { ExperienceOptions } from '@/vanilla-three/experiences/BaseExperience';
import { getVariant } from '@/features/lab/registry';
import { useCallback } from 'react';

export default function GenericShaderExperiment() {
  const { shaderId } = useParams<{ shaderId: string }>();
  const createShaderExperience = useCallback(
    (canvas: HTMLCanvasElement, options: ExperienceOptions = {}) =>
      new ShaderGalleryExperience(canvas, shaderId!, options),
    [shaderId]
  );

  // Early return with proper error handling
  if (!shaderId) {
    return <Navigate to="/experiments/shader-gallery" replace />;
  }

  // Validate shader exists
  const shaderExists = getVariant('shader-gallery', shaderId);
  if (!shaderExists) {
    return <Navigate to="/experiments/shader-gallery" replace />;
  }

  return (
    <ExperimentLayout
      experienceFactory={createShaderExperience}
      showControls={true}
    />
  );
}
