uniform vec2 uResolution;
uniform sampler2D uPictureTexture;
uniform sampler2D uDisplacementTexture;

attribute float aDisplacementIntensity;
attribute float aDisplacementAngle;

varying vec3 vColor;

void main()
{
    vec3 newPosition = position;
    float displacementIntensity = texture(uDisplacementTexture, uv).r;
    displacementIntensity = smoothstep(0.1, 0.3, displacementIntensity);
    vec3 displacement = vec3(cos(aDisplacementAngle) * 0.2, sin(aDisplacementAngle) * 0.2, 1.0);
    displacement = normalize(displacement);
    displacement *= displacementIntensity;
    displacement *= 2.0;
    displacement *= aDisplacementIntensity;
    newPosition += displacement;

    // Final position
    vec4 modelPosition = modelMatrix * vec4(newPosition, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    gl_Position = projectedPosition;

    // Picture
    float pictureIntensity = texture(uPictureTexture, uv).r;

    // Point size
    gl_PointSize = 0.15 * pictureIntensity * uResolution.y;
    gl_PointSize *= (1.0 / - viewPosition.z);

    vColor = vec3(pow(pictureIntensity, 2.0));
}