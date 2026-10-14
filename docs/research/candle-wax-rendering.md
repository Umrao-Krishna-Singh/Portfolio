# Candle Wax Rendering and Flame-Sourced Lighting (Three.js r160)

Technical reference for rendering translucent candle wax, coupling physical light sources to procedural flame shaders, and balancing night interior exposure in Three.js r160.

## 1. Wax Material Configuration (`MeshPhysicalMaterial`)

The "metal cylinder" visual defect occurs when a smooth dielectric GGX specular lobe stretches down a featureless cylinder. Wax requires grazing-angle scatter, reduced specular reflection, and roughness breakup.

```js
const waxMat = new THREE.MeshPhysicalMaterial({
  color: 0xf3e7c9,
  metalness: 0,
  roughness: 0.68,
  roughnessMap: waxRoughTex,       // Procedural noise (0.45..0.95) breaks specular streak
  normalMap: waxNormalTex,         // Tangent-space Sobel normal map from canvas noise
  normalScale: new THREE.Vector2(0.5, 0.5),
  sheen: 0.4,                      // Grazing-angle scatter (eliminates plastic/metal look)
  sheenColor: 0xfff0cc,
  sheenRoughness: 0.9,
  specularIntensity: 0.5,          // Halves dielectric reflection glint
  clearcoat: 0.0,                  // Zero clearcoat (prevents varnished plastic read)
  emissive: 0xff9a3c,
  emissiveIntensity: 0.15,
  emissiveMap: waxGlowTex           // Vertical gradient near wick: internal light bleed
});
```

## 2. Subsurface Scattering Approximation (Fake SSS)

True transmission (`MeshPhysicalMaterial.transmission`) forces an extra full-scene render pass (`renderTransmissionPass`) and models clear refraction rather than scattering. Instead, fake SSS is injected via `material.onBeforeCompile`:

1. **Wrapped Diffuse**: Softens the light terminator:
   $$\text{wrapped} = \text{saturate}\left(\frac{\mathbf{N} \cdot \mathbf{L} + w}{1.0 + w}\right)$$
   Only the delta $(\text{wrapped} - \text{saturate}(\mathbf{N} \cdot \mathbf{L})) \times \text{strength}$ is added to `reflectedLight.directDiffuse`.
2. **Back-Transmittance (GDC 2011)**: Simulates light shining through thin edges:
   $$\mathbf{H}_{\text{scatter}} = \text{normalize}(\mathbf{L} + \mathbf{N} \cdot 0.4)$$
   $$\text{scatteringDot} = \text{pow}(\text{saturate}(\mathbf{V} \cdot -\mathbf{H}_{\text{scatter}}), \text{power}) \cdot \text{scale}$$
   Added directly to `reflectedLight.directDiffuse` scaled by material thickness.

*Constraint*: `onBeforeCompile` breaks `.clone()` and requires `waxMat.customProgramCacheKey = () => 'wax-v1'` for shader cache integrity.

## 3. Flame-Light Coupling & Pooling

- **Units**: Three.js r160 enforces physical lighting (`PointLight` and `SpotLight` in candela, `decay = 2`).
- **Flicker Synchronization**: Modulate `flameLight.intensity` and flame plane shader uniforms using identical non-harmonic sine sums:
  $$f(t) = 1.0 + 0.18 \cdot (0.4 \sin(11.7t) + 0.35 \sin(23.3t + 1.7) + 0.25 \sin(5.1t))$$
  Slight positional y-bobbing ($\pm 0.05$) sells the flame as the emitter.
- **Desk Light Pool**: Bare point lights produce harsh circular cutoffs. A wide-angle, high-penumbra spotlight (`angle: 1.1–1.3 rad`, `penumbra: 0.9`, `decay: 2`) aimed downwards creates a soft, natural elliptical pool.
- **Bloom Isolation**: `UnrealBloomPass` with `threshold = 1.5` operates on linear HDR values. Desk and wax surfaces stay $< 1.0$; only the additive flame planes output values $> 2.0$, ensuring only flames bloom.

## 4. Night Scene Exposure Balance

1. **Exposure**: Set `renderer.toneMappingExposure = 1.38–1.42` under `ACESFilmicToneMapping`. ACES's compression shoulder prevents flame highlights from clipping while lifting ambient shadows.
2. **Ambient Fill**: Use `HemisphereLight(0x36435c, 0x1d1409, 0.35)` instead of flat `AmbientLight`. Sky/ground gradient gives cool moonlight above and warm wood bounce below.
3. **Albedo Raising**: Dark wood absorbs light completely. Raising desk albedo from `0x392b1a` to `0x59452c` allows physical candle lights to illuminate the scene naturally.
4. **Atmospheric Fog**: `FogExp2(0x1a120a, 0.05)` blends distant geometry into candlelit haze rather than black void.

## 5. Primary References

- **Three.js r160 Source**: [MeshPhysicalMaterial.html](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/materials/MeshPhysicalMaterial.html) · [lights_physical_fragment.glsl.js](https://github.com/mrdoob/three.js/blob/r160/src/renderers/shaders/ShaderChunk/lights_physical_fragment.glsl.js) · [SubsurfaceScatteringShader.js](https://github.com/mrdoob/three.js/blob/r160/examples/jsm/shaders/SubsurfaceScatteringShader.js) · [webgl_lights_physical.html](https://github.com/mrdoob/three.js/blob/r160/examples/webgl_lights_physical.html)
- **GDC 2011**: *Approximating Translucency for a Fast, Cheap and Convincing Subsurface Scattering Look* (Colin Barré-Brisebois & Marc Bouchard).
