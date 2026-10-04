# Candle wax rendering in three.js r160: translucent wax, flame-sourced light, night-scene exposure

Researched 2026-10-04. Question: how to render convincing WAX CANDLES in three.js r160 (read as translucent wax, not "metal cylinders"), make point lights read as sourced from the GLSL flame shaders (candlelight pooling on a desk), and brighten a dark night-time study scene without washing out the mood.

Current implementation reviewed: `prototype/scene.js` (wax = `CylinderGeometry(0.46,0.5,h,22)` + `MeshStandardMaterial { color 0xf0e4c8, roughness 0.55, map + bumpMap, bumpScale 0.02 }`; bloom strength 0.25 / radius 0.4 / threshold 1.5; ACESFilmicToneMapping; `toneMappingExposure = 1.12`; flame point lights 30/38 intensity).

## Verdict

Three separate problems, three fixes. All r160-native, no npm installs, no transmission (cost documented below and judged not worth it for this scene).

### 1. Wax material — kill the "metal" read with MeshPhysicalMaterial + specular control + maps

The metal look comes from a *smooth, uniform* dielectric lobe on a featureless low-poly cylinder (analysis in Finding 2). Fix with `MeshPhysicalMaterial` (r160) instead of `MeshStandardMaterial`:

```js
// replaces prototype/scene.js lines 391-395
const waxMat = new THREE.MeshPhysicalMaterial( {
  color: 0xf3e7c9,          // slightly deeper than 0xf0e4c8; keep warm
  metalness: 0,
  roughness: 0.68,          // UP from 0.55
  roughnessMap: waxRoughTex,// procedural mottle noise: R channel values ~0.45..0.95
  normalMap: waxNormalTex,  // convert the existing bump canvas to a normal map
  normalScale: new THREE.Vector2( 0.5, 0.5 ),
  sheen: 0.4,               // soft velvet-like rim scatter — the key "wax not plastic" term
  sheenColor: 0xfff0cc,
  sheenRoughness: 0.9,
  specularIntensity: 0.5,   // docs: "When set to zero, the model is effectively Lambertian" — 0.5 halves the glint
  clearcoat: 0.0,           // wax is not varnished; clearcoat is what makes it read as glossy plastic
  emissive: 0xff9a3c,
  emissiveIntensity: 0.15,
  emissiveMap: waxGlowTex,  // procedural vertical gradient: warm near wick, black below ~1/4 height
} );
```

Rationale per property in Finding 1/2. The `emissiveMap` gradient is the cheapest strong "light entering the wax" cue: it makes the wax near the flame glow from inside without any extra pass.

### 2. Fake SSS: wrapped diffuse + GDC 2011 back-transmittance via onBeforeCompile (optional but recommended)

Patch `#include <lights_fragment_begin>` with the r160 chunk content where the `RE_Direct(...)` call is routed through a wrapper that (a) calls the original `RE_Direct`, (b) adds a wrapped-diffuse term and (c) adds the GDC-2011 back-transmittance term used verbatim by three.js's own `SubsurfaceScatteringShader.js`. Full code in Finding 1. Uniforms: `uWrap = 0.5`, `uWrapStrength = 0.35`, `uTransPower = 2.0`, `uTransScale = 0.8`, `uThickness = candleRadius`.

Note: `onBeforeCompile` is not supported by `.clone()/.copy()/.toJSON()` and needs `customProgramCacheKey` if the patch is conditional — set `waxMat.customProgramCacheKey = () => 'wax-v1';`.

### 3. Flame-sourced light + night exposure

```js
// candle light: candela units in r160 (useLegacyLights defaults to false and is deprecated)
const flameLight = new THREE.PointLight( 0xffb066, 32, 12, 2 ); // 32 cd, decay 2, cut at 12 m
// per-frame flicker, same t as the flame shader's uTime:
const n = Math.sin(t*11.7)*0.4 + Math.sin(t*23.3+1.7)*0.35 + Math.sin(t*5.1)*0.25;
flameLight.intensity = 32 * ( 1 + 0.18 * n );
flameLight.position.y = wickY + 0.05 * n; // tiny positional bob sells "source is the flame"

// desk pool: wide soft SpotLight per candle (or one shared), aimed down
const pool = new THREE.SpotLight( 0xffa15e, 22, 12, 1.1, 0.9, 2 ); // angle 1.1 rad, penumbra 0.9
pool.position.copy( flameLight.position ); pool.target = deskTarget;
```

- Sync flame emissive with light intensity using the trick from the official `webgl_lights_physical` example: `flameMat.emissiveIntensity = flameLight.intensity / Math.pow( flameRadius, 2.0 )` (Finding 3).
- Bloom: keep `threshold = 1.5` but make the flame planes output HDR values 2–4x above it (multiply the additive flame color), so only flames bloom. The threshold is a luminosity high-pass (Finding 3).
- Brightening: `toneMappingExposure` 1.12 → **1.4** (r160 default is 1.0); add `HemisphereLight( 0x36435c, 0x1d1409, 0.35 )` for directional night ambience instead of a flatter ambient raise; raise desk albedo 0x392b1a → ~0x59452c; optional `FogExp2( 0x1a120a, 0.05 )`. Details in Finding 5.

---

## Findings

### 1. Wax/translucency in three.js r160

**MeshPhysicalMaterial vs MeshStandardMaterial in r160.** `MeshPhysicalMaterial` is `MeshStandardMaterial` plus per-pixel layers: sheen, clearcoat, transmission/thickness/attenuation, iridescence, anisotropy, and non-metal specular control (`specularIntensity`, `specularColor`, `ior`). The r160 docs state plainly: "MeshPhysicalMaterial has a higher performance cost, per pixel, than other three.js materials." ([MeshPhysicalMaterial.html @ r160](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/materials/MeshPhysicalMaterial.html))

r160 property docs and defaults, quoted/verified from the r160 docs source ([MeshPhysicalMaterial.html @ r160](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/materials/MeshPhysicalMaterial.html)):

| Property | r160 doc text (quote) | Default |
|---|---|---|
| `sheen` | "The intensity of the sheen layer, from 0.0 to 1.0." | 0.0 |
| `clearcoat` | "Represents the intensity of the clear coat layer, from 0.0 to 1.0." | 0.0 |
| `transmission` | "Degree of transmission (or optical transparency), from 0.0 to 1.0." | 0.0 |
| `thickness` | "The thickness of the volume beneath the surface. The value is given in the coordinate space of the mesh." | 0 |
| `attenuationDistance` | "Density of the medium given as the average distance that light travels in the medium before interacting with a particle." | Infinity |
| `attenuationColor` | "The color that white light turns into due to absorption when reaching the attenuation distance." | white |
| `ior` | "Index-of-refraction for non-metallic materials, from 1.0 to 2.333." | 1.5 |
| `iridescence` | "The intensity of the iridescence layer, simulating RGB color shift based on the angle between the surface and the viewer." | 0.0 |
| `specularIntensity` | "A float that scales the amount of specular reflection for non-metals only. When set to zero, the model is effectively Lambertian." | 1.0 |

`specularIntensity` is the single most relevant lever for our "metal" complaint: it scales the dielectric specular lobe directly, and the docs' own wording ("effectively Lambertian" at zero) tells you it is the sanctioned way to dial a waxy, low-gloss dielectric back.

**Which combination approximates backlit wax without transmission.** Judgment (art-direction call, grounded in the verified API): `sheen` (soft grazing-angle scatter — sheen exists precisely for fabric/wax-like grazing response, handled in r160's `RE_Direct_Physical` under `USE_SHEEN` with `material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 )`; [lights_physical_fragment.glsl.js @ r160](https://github.com/mrdoob/three.js/blob/r160/src/renderers/shaders/ShaderChunk/lights_physical_fragment.glsl.js)) + `specularIntensity ≈ 0.5` + roughness/normal variation + an emissive gradient near the wick. This needs no extra render pass.

**Transmission cost, confirmed from r160 renderer source.** Transmission is NOT a screen-space trick hidden inside the material — it is a second scene render. In r160's `WebGLRenderer.js`, `_transmissionRenderTarget` is created lazily inside `renderTransmissionPass`, which renders `opaqueObjects` into it, and it is invoked from the render loop as `if ( transmissiveObjects.length > 0 ) renderTransmissionPass( opaqueObjects, transmissiveObjects, scene, camera );` — i.e. every frame while any transmissive mesh is visible, the entire opaque scene is rendered one extra time (plus mipmapping work for the refraction sampling). ([WebGLRenderer.js @ r160](https://github.com/mrdoob/three.js/blob/r160/src/renderers/WebGLRenderer.js)) For a two-candle desk scene at 1080p this is survivable but pointless: transmission models *see-through* volumes (glass, water); a candle body is a strongly scattering, milky medium where the wrap+back-transmittance approximation below looks closer than refraction. Verdict: skip transmission.

**The wrap-diffuse / fake-SSS technique, against r160 source.**

The injection points, verified in r160:

- The material's fragment shader (r160 `meshphysical.glsl.js`) includes, in order: `#include <lights_physical_pars_fragment>` (top, declarations), then later in the accumulation block `#include <lights_fragment_begin>`, `#include <lights_fragment_maps>`, `#include <lights_fragment_end>`. ([meshphysical.glsl.js @ r160](https://github.com/mrdoob/three.js/blob/r160/src/renderers/shaders/ShaderLib/meshphysical.glsl.js))
- `lights_fragment_begin.glsl.js` is where each punctual light calls the response function: `RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );` — same call form for point, spot and directional lights. ([lights_fragment_begin.glsl.js @ r160](https://github.com/mrdoob/three.js/blob/r160/src/renderers/shaders/ShaderChunk/lights_fragment_begin.glsl.js))
- `RE_Direct_Physical` (defined in `lights_physical_pars_fragment.glsl.js`, i.e. *above* the include we patch) computes `float dotNL = saturate( dot( geometryNormal, directLight.direction ) ); vec3 irradiance = dotNL * directLight.color; reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );` ([lights_physical_pars_fragment.glsl.js @ r160](https://github.com/mrdoob/three.js/blob/r160/src/renderers/shaders/ShaderChunk/lights_physical_pars_fragment.glsl.js))

So the technique: in `material.onBeforeCompile`, replace the `#include <lights_fragment_begin>` line with (1) a `RE_Direct_Wax` wrapper defined inline (it may call `RE_Direct` because the pars include precedes it — verified order above), and (2) the r160 chunk body with the three `RE_Direct(...)` call sites routed to `RE_Direct_Wax`. The wrap term replaces the hard `saturate(dotNL)` cutoff with `saturate((dotNL + w) / (1 + w))`; since `RE_Direct` already added the standard lambert term, add only the *difference* so the lit side doesn't double up:

```js
// after waxMat creation (see Verdict). r160 chunk text: lights_fragment_begin.glsl.js,
// with 'RE_Direct(' replaced by 'RE_Direct_Wax(' at the 3 call sites.
const patched = LIGHTS_FRAGMENT_BEGIN_R160.replace( /RE_Direct\(/g, 'RE_Direct_Wax(' );
waxMat.onBeforeCompile = ( shader ) => {
  shader.uniforms.uWrap = { value: 0.5 };
  shader.uniforms.uWrapStrength = { value: 0.35 };
  shader.uniforms.uTransPower = { value: 2.0 };
  shader.uniforms.uTransScale = { value: 0.8 };
  shader.uniforms.uThickness = { value: 0.45 }; // ~candle radius in world units
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_fragment_begin>', /* glsl */`
    uniform float uWrap, uWrapStrength, uTransPower, uTransScale, uThickness;
    void RE_Direct_Wax( const in IncidentLight directLight,
        const in vec3 geometryPosition, const in vec3 geometryNormal,
        const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal,
        const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
      RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir,
                 geometryClearcoatNormal, material, reflectedLight );
      // wrapped diffuse: only the EXTRA beyond the hard cutoff
      float dotNL = dot( geometryNormal, directLight.direction );
      float wrapped = saturate( ( dotNL + uWrap ) / ( 1.0 + uWrap ) );
      float lambert = saturate( dotNL );
      reflectedLight.directDiffuse += directLight.color
        * BRDF_Lambert( material.diffuseColor )
        * ( wrapped - lambert ) * uWrapStrength;
      // back-transmittance, from three.js r160 SubsurfaceScatteringShader.js (GDC 2011):
      vec3 scatteringHalf = normalize( directLight.direction
                                       + ( geometryNormal * 0.4 ) );
      float scatteringDot = pow( saturate( dot( geometryViewDir, -scatteringHalf ) ),
                                 uTransPower ) * uTransScale;
      reflectedLight.directDiffuse += ( scatteringDot + 0.05 ) * uThickness
        * directLight.color * material.diffuseColor;
    }
    ${ patched }` );
};
```

The GDC math is copied from three.js's own shipped shader, whose comment reads: "Based on GDC 2011 – Approximating Translucency for a Fast, Cheap and Convincing Subsurface Scattering Look", with the exact lines `vec3 scatteringHalf = normalize(directLight.direction + (geometryNormal * thicknessDistortion));`, `float scatteringDot = pow(saturate(dot(geometryViewDir, -scatteringHalf)), thicknessPower) * thicknessScale;`, `vec3 scatteringIllu = (scatteringDot + thicknessAmbient) * thickness;` ([SubsurfaceScatteringShader.js @ r160](https://github.com/mrdoob/three.js/blob/r160/examples/jsm/shaders/SubsurfaceScatteringShader.js)). That shader itself is the pattern proof that injected lighting functions work: it injects `RE_Direct_Scattering` into the Phong shader by string replacement, gated behind `#if defined( SUBSURFACE ) && defined( USE_UV )`, and is used by the official example `examples/webgl_materials_subsurface_scattering.html` (a rotating bunny with thickness GUI, importing `SubsurfaceScatteringShader` from `three/addons/shaders/`) ([example @ r160](https://github.com/mrdoob/three.js/blob/r160/examples/webgl_materials_subsurface_scattering.html)).

Caveats, stated honestly:
- `SubsurfaceScatteringShader.js` is built on `MeshPhongMaterial`, not MeshStandard/Physical — using it directly would drop the PBR lighting/sheen. Hence the onBeforeCompile route above; the official shader is cited as the verified reference implementation of the math, not as the drop-in.
- I found NO official three.js r160 addon named `SubsurfaceScatteringMaterial.js` in `examples/jsm/materials/` (checked; that directory contains only `MeshGouraudMaterial.js` at r160) — older tutorials referencing that path are out of date or wrong. ([examples/jsm/materials listing @ r160](https://api.github.com/repos/mrdoob/three.js/contents/examples/jsm/materials?ref=r160))
- A community wrap-lighting example with a fetchable URL was searched for but not verified; the recipe above relies only on r160 chunk sources + the official SSS shader/example. (Uncertainty marked as required.)
- `onBeforeCompile` docs (r160 Material): "An optional callback that is executed immediately before the shader program is compiled", "Useful for the modification of built-in materials", "the callback is not supported by .clone(), .copy() and .toJSON()", and use `customProgramCacheKey` so shader caching stays correct. ([Material.html @ r160](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/materials/Material.html))

### 2. Why the current candle reads as METAL

Verified facts first, then the diagnosis.

- With `metalness = 0`, the r160 shader sets the dielectric specular to a fixed 4% reflectance: `material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );` and `material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );` ([lights_physical_fragment.glsl.js @ r160](https://github.com/mrdoob/three.js/blob/r160/src/renderers/shaders/ShaderChunk/lights_physical_fragment.glsl.js)). So the surface is a textbook dielectric — the *model* is not the problem.
- `MeshStandardMaterial.roughness` default is 1.0 ("0.0 means a smooth mirror reflection, 1.0 means fully diffuse"); our 0.55 sits right where the GGX lobe is a broad, bright, smooth band ([MeshStandardMaterial.html @ r160](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/materials/MeshStandardMaterial.html)).
- With no `envMap` on the material and no `scene.environment`, there is no indirect specular at all — the only specular response is the GGX lobe of the two candle point lights ([MeshStandardMaterial.html @ r160](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/materials/MeshStandardMaterial.html) — `envMap` default null, plus "To ensure a physically correct rendering, you should only add environment maps which were preprocessed by PMREMGenerator"; [Scene.html @ r160](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/scenes/Scene.html) — `scene.environment` default null applies to all physical materials).
- Our cylinder is 22 radial segments with `bumpScale 0.02` of 128x256 canvas noise (`prototype/scene.js` lines 391–395) — i.e. essentially no normal variation to break the highlight into wax-irregular patches.

Diagnosis (this is analysis, each lever cited above): what reads as "metal" is a single smooth, anisotropic-looking vertical streak highlight — a broad GGX lobe at roughness 0.55 stretched down a featureless cylinder by small near-tangent point lights, with zero environment/specular breakup and zero roughness variation. Metals read as metals partly because their reflections are *clean and coherent*; a uniform lobe on a uniform cylinder produces exactly that coherence. Tone mapping is a minor factor (ACES compresses the bright streak but also warm-shifts it). The fix is irregularity + lobe softening, in priority order:

1. `roughnessMap` (mottle, 0.45–0.95) so the highlight breaks into patches; roughness default doc above confirms the range semantics.
2. `normalMap` (converted from a better procedural bump — Finding 4) at `normalScale ≈ (0.5, 0.5)`; replace `bumpMap/bumpScale 0.02` — bump at that scale does almost nothing at grazing angles.
3. `sheen 0.4` — grazing scatter fills the dark rim with soft warm light, the classic wax/soap/fabric read (sheen is a first-class r160 term in `RE_Direct_Physical`, verified above).
4. `specularIntensity 0.5` — halves the streak brightness ("scales the amount of specular reflection for non-metals only", docs quote above).
5. Optional: a very dim `scene.environment` via `RoomEnvironment` (exists at r160: `class RoomEnvironment extends Scene`, a synthetic room of emissive panels for PMREM) at low intensity to give the dielectric *something* to reflect besides the two point lights. ([RoomEnvironment.js @ r160](https://github.com/mrdoob/three.js/blob/r160/examples/jsm/environments/RoomEnvironment.js)) Uncertainty note: I verified the addon exists and what it builds, but not its interaction with a dark night scene — try `scene.environmentIntensity`-style dimming carefully; in r160 dimming an environment means scaling the texture or using a low-intensity PMREM render. (Marked unverified for the exact dimming knob in r160.)

### 3. Making flame light READ as flame-sourced

**r160 light units (verified).** Since r155, "WebGLRenderer.useLegacyLights is now set to false by default and deprecated." ([three.js Migration Guide wiki](https://github.com/mrdoob/three.js/wiki/Migration-Guide), 154→155 section). r160's renderer source confirms: `this._useLegacyLights = false;` plus a deprecation warning string on the property accessor ([WebGLRenderer.js @ r160](https://github.com/mrdoob/three.js/blob/r160/src/renderers/WebGLRenderer.js)). The official r155 announcement states: "The intensity of point and spot lights is measured in candela (cd) now which usually requires much higher intensity values than before." and "Ambient and hemisphere lights (which are special kind of lights and essentially simplified models of light probes) as well as directional lights do not use SI units." ([Updates to lighting in three.js r155](https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733)). The r159→r160 migration section contains no lighting changes ([Migration Guide wiki](https://github.com/mrdoob/three.js/wiki/Migration-Guide)) — our pinned r160 behaves exactly as the r155 rules.

r160 `PointLight`: "The light's luminous intensity measured in candela (cd). Default is 1."; `decay` default 2 — "In context of physically-correct rendering the default value should not be changed."; `distance` default 0; and `power` is "the luminous power of the light measured in lumens (lm)" with "Changing the power will also change the light's intensity" ([PointLight.html @ r160](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/lights/PointLight.html)). Our existing intensities (30/38) are plausible candela values — the problem is not magnitude (Finding 2 and the pooling techniques below are the problem).

**Techniques (all verified against r160 APIs/examples):**

1. **Flicker sync.** Drive `flameLight.intensity` (and a small y-bob) from the same time value as the flame shader's `uTime`, using 2–3 summed sines at non-harmonic frequencies (recipe in Verdict). Multiplied ±18% is the sweet spot; more reads as fire, less reads as mains hum. (Parameter values are judgment; the sync mechanism uses only verified APIs.)
2. **Emissive-light coupling** — from the official r160 example `webgl_lights_physical.html`: the bulb mesh uses `new THREE.MeshStandardMaterial( { emissive: 0xffffee, emissiveIntensity: 1, color: 0x000000 } )` and per frame `bulbMat.emissiveIntensity = bulbLight.intensity / Math.pow( 0.02, 2.0 ); // convert from intensity to irradiance at bulb surface`, so the visible emitter scales exactly with the physical light ([webgl_lights_physical.html @ r160](https://github.com/mrdoob/three.js/blob/r160/examples/webgl_lights_physical.html)). Applied to us: make the flame planes' additive brightness (and the wax `emissiveMap` gradient) scale with the same flickered intensity — the eye tolerates brightness differences but NOT brightness that desyncs from the source.
3. **The desk pool.** r160 `SpotLight`: `angle` — "Maximum extent of the spotlight, in radians, from its direction", default `Math.PI/3`, max `Math.PI/2`; `penumbra` — "Percent of the spotlight cone that is attenuated due to penumbra. Takes values between zero and 1", default 0; intensity in candela, decay 2 ([SpotLight.html @ r160](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/lights/SpotLight.html)). A wide-angle (1.1–1.3 rad), high-penumbra (0.9) spotlight from the wick aimed at the desk zone produces the soft elliptical pool a bare point light cannot shape. Keep `decay 2` (docs quote above).
4. **Bloom tuned so ONLY flames bloom.** r160 `UnrealBloomPass` is `constructor( resolution, strength, radius, threshold )` and feeds `threshold` into a luminosity high-pass each frame: `this.highPassUniforms[ 'luminosityThreshold' ].value = this.threshold;` in the pass step labeled "// 1. Extract Bright Areas", using `LuminosityHighPassShader` ([UnrealBloomPass.js @ r160](https://github.com/mrdoob/three.js/blob/r160/examples/jsm/postprocessing/UnrealBloomPass.js)). With our order (bloom before `OutputPass`), the threshold applies to linear HDR values, so a threshold of 1.5 only passes pixels pushed above 1.5 — exactly the flame planes if we scale their additive output to 2–4; lit desk surfaces (all < 1 in linear) will not bloom. Our current flame planes likely hover near/below the threshold with bloom strength 0.25, which is why the flames don't *radiate*; raise flame output instead of lowering threshold.
5. **Warm color.** The official physical-lights example uses `new THREE.PointLight( 0xffee88, 1, 100, 2 )` for a warm bulb and drives it via `.power` in lumens ([webgl_lights_physical.html @ r160](https://github.com/mrdoob/three.js/blob/r160/examples/webgl_lights_physical.html)). Candle color should be *lower* temperature than a bulb — 0xffb066..0xffc98a (our existing 0xffc98a is fine as a base; slightly deeper orange reads more flame-like). Color choice is judgment; the API points above are verified.

### 4. Procedural texture quality

Craft guidance (judgment — there is no three.js doc for "make a good wax normal map"; the API side verified below):

- **Switch bump → normal map.** r160 supports `normalMap` + `normalScale` on Standard/Physical ([MeshStandardMaterial.html @ r160](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/materials/MeshStandardMaterial.html)). Convert the canvas bump to a tangent-space normal with a 3x3 Sobel over the height field; a `bumpScale` of 0.02 on a cylinder radius 0.46 is far too weak to matter.
- **Height field recipe** (canvas 256x512, wrapped horizontally so the cylinder seam is invisible): 4–5 octaves of value noise (amplitude halving, frequency doubling) at 60% blend + 10–15 hand-placed vertical drip streaks — each drip is a thin vertical run of slightly *higher* height (wax ridges) with a rounded bead at its end; add a torus-equivalent melted-rim ridge into the height map itself (bright ring near the top) so the normal map carries it, instead of relying on separate torus geometry matching the same low-roughness material.
- **Roughness map from the same noise:** invert the height mottle (crevices rougher ~0.9, ridges slicker ~0.5) into the R channel; three.js multiplies `roughnessMap` values with the `roughness` scalar — "If roughnessMap is provided, both values are multiplied" ([MeshStandardMaterial.html @ r160](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/materials/MeshStandardMaterial.html)) — so set `roughness: 0.7` and paint the map around 0.65–1.35 meaning-wise (values are multiplied, keep within 0–1 and scale the scalar accordingly).
- **Emissive gradient map:** radial/vertical gradient from the wick — warm orange, ~15% of height, black below. This is what makes the top of the candle look lit-from-inside even where the point light can't reach.

Primary-source note for the canvas path: procedural textures are `CanvasTexture`/`DataTexture` uploads — standard r160 API, no citation controversy; the *artistic* claims above are unverify-able against docs and are marked as craft judgment.

**CC0 sources (license statements verified in Finding/CC0 section below): ambientCG has NO wax or candle material at all** — API queries `q=wax` and `q=candle` both returned `numberOfResults: 0` (verified 2026-10-04). So for wax specifically, procedural is not just preferred per ADR-0004, it is the only CC0-friendly option found. (Poly Haven candidates not verified — see CC0 section.)

### 5. Brightening the scene without washing out the night

Verified levers, in the order I'd apply them:

1. **`toneMappingExposure` is the global knob.** r160 default is `this.toneMappingExposure = 1.0;` ([WebGLRenderer.js @ r160](https://github.com/mrdoob/three.js/blob/r160/src/renderers/WebGLRenderer.js)). The official glTF example renders a sunlit exterior at `ACESFilmicToneMapping` / exposure 1, and the physical-lights example computes `renderer.toneMappingExposure = Math.pow( params.exposure, 5.0 ); // to allow for very bright scenes` — i.e. exposure is expected to move over orders of magnitude ([webgl_loader_gltf.html @ r160](https://github.com/mrdoob/three.js/blob/r160/examples/webgl_loader_gltf.html); [webgl_lights_physical.html @ r160](https://github.com/mrdoob/three.js/blob/r160/examples/webgl_lights_physical.html)). Ours is 1.12 (+0.18 night lift in `prototype/scene.js` line 713). Try **1.4–1.5 at night**; ACES's shoulder keeps flame/desk highlights from clipping while midtones lift. This brightens everything uniformly — combine with (2)–(4) so the *composition* still reads as night.
2. **HemisphereLight instead of a flat ambient raise.** r160 `HemisphereLight`: "A light source positioned directly above the scene, with color fading from the sky color to the ground color", intensity default 1, cannot cast shadows ([HemisphereLight.html @ r160](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/lights/HemisphereLight.html)). It does not use SI units ("do not use SI units" — [r155 forum announcement](https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733)), so its intensity is a plain multiplier. The sky/ground gradient gives night air a direction (cool above, warm bounce below) that a single `AmbientLight` color cannot. The official physical example runs a hemisphere at 0.02 for a bright interior — for our night scene, 0.25–0.45 with sky `0x36435c`, ground `0x1d1409` is the sanity range (values are judgment).
3. **Raise albedo, not just lights.** Diffuse bounce scales with `material.diffuseColor` (`material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );` — [lights_physical_fragment.glsl.js @ r160](https://github.com/mrdoob/three.js/blob/r160/src/renderers/shaders/ShaderChunk/lights_physical_fragment.glsl.js)). Our desk is `0x392b1a` at roughness 1 (`prototype/scene.js` line 112) — very dark wood absorbs most of the candle light before it can bounce to the walls. Raising to ~0x59452c makes the SAME candle lights light the room more, which strengthens (not weakens) the "light comes from the candles" read. Same logic for the wax itself (0xf3e7c9 is fine) and stone walls.
4. **Warm fog to keep depth without darkness.** r160 `FogExp2`: "gives a clear view near the camera and a faster than exponentially densening fog farther from the camera", `density` default 0.00025 (tuned for km-scale scenes; indoor desks need ~0.03–0.08 — the density value scale is judgment, the class behavior is from [FogExp2.html @ r160](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/scenes/FogExp2.html)). Fog color slightly warmer than black (`0x1a120a`) fades the back wall into candlelit air instead of a black hole. Note `scene.backgroundIntensity` "Only applies to background textures" — it will NOT dim/boost a plain `Color` background ([Scene.html @ r160](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/scenes/Scene.html)), so brighten the background Color itself if needed.
5. **What NOT to do:** don't raise ambient to daylight levels (kills night), don't lower bloom threshold (whole scene glows), don't switch off ACES (washed highlights). Official warm-interior reference points verified above: `webgl_lights_physical` (warm bulb 0xffee88 + low hemisphere + emissive-coupled bulb mesh) and `webgl_loader_gltf` (ACES, exposure 1, environment-driven).

## CC0 asset candidates

License statements verified 2026-10-04:

- **ambientCG** — "All assets are released under the Creative Commons CC0 license, making them free to use without attribution - even in commercial circumstances." ([ambientcg.com](https://ambientcg.com/)). CC0 confirmed consistent with [ADR-0004](../adr/0004-cc0-only-assets.md). **However: no wax material.** API queries `type=Material&q=wax` and `&q=candle` both return `numberOfResults: 0` ([ambientCG API v2](https://ambientcg.com/api/v2/full_json?type=Material&q=wax&limit=10)). The project already uses ambientCG Wood051 (CC0) for the desk per ADR-0004 and `prototype/scene.js`.
- **Poly Haven** — "Our assets are all licensed as CC0"; "You can use our assets for any purpose, including commercial work."; "You do not need to give credit or attribution when using them (although it is appreciated)." ([polyhaven.com/license](https://polyhaven.com/license)). I did NOT verify specific wax/candle texture or model assets exist there — treat any Poly Haven candle asset as unverified until checked. No download candidates are listed beyond that, because none were verified.

Conclusion: stay pure-procedural for wax (also the ADR-0004 preference); both sites' CC0 terms are confirmed safe if a stone/wood/prop texture is ever wanted as fallback.

## Claims I could not verify (explicit)

- Any specific Poly Haven wax/candle asset (not checked for existence).
- A community wrap-lighting demo with a fetchable URL on discourse.threejs.org (search returned nothing usable; recipe relies on r160 chunk sources instead).
- The exact r160 knob for dimming a PMREM `scene.environment` (RoomEnvironment's existence verified; the dimming workflow not verified).
- Bloom "only flames bloom" behavior is verified mechanism-wise (luminosity high-pass on the linear HDR buffer) but the numeric 2–4x flame output is a starting point to tune, not a doc'd constant.

## Sources

- three.js r160 source (pin for all behavior claims): [WebGLRenderer.js](https://github.com/mrdoob/three.js/blob/r160/src/renderers/WebGLRenderer.js) · [meshphysical.glsl.js](https://github.com/mrdoob/three.js/blob/r160/src/renderers/shaders/ShaderLib/meshphysical.glsl.js) · [lights_fragment_begin.glsl.js](https://github.com/mrdoob/three.js/blob/r160/src/renderers/shaders/ShaderChunk/lights_fragment_begin.glsl.js) · [lights_physical_pars_fragment.glsl.js](https://github.com/mrdoob/three.js/blob/r160/src/renderers/shaders/ShaderChunk/lights_physical_pars_fragment.glsl.js) · [lights_physical_fragment.glsl.js](https://github.com/mrdoob/three.js/blob/r160/src/renderers/shaders/ShaderChunk/lights_physical_fragment.glsl.js) · [UnrealBloomPass.js](https://github.com/mrdoob/three.js/blob/r160/examples/jsm/postprocessing/UnrealBloomPass.js) · [SubsurfaceScatteringShader.js](https://github.com/mrdoob/three.js/blob/r160/examples/jsm/shaders/SubsurfaceScatteringShader.js) · [RoomEnvironment.js](https://github.com/mrdoob/three.js/blob/r160/examples/jsm/environments/RoomEnvironment.js)
- three.js r160 docs: [MeshPhysicalMaterial](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/materials/MeshPhysicalMaterial.html) · [MeshStandardMaterial](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/materials/MeshStandardMaterial.html) · [Material](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/materials/Material.html) · [PointLight](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/lights/PointLight.html) · [SpotLight](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/lights/SpotLight.html) · [HemisphereLight](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/lights/HemisphereLight.html) · [Scene](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/scenes/Scene.html) · [FogExp2](https://github.com/mrdoob/three.js/blob/r160/docs/api/en/scenes/FogExp2.html)
- three.js r160 examples: [webgl_lights_physical.html](https://github.com/mrdoob/three.js/blob/r160/examples/webgl_lights_physical.html) · [webgl_loader_gltf.html](https://github.com/mrdoob/three.js/blob/r160/examples/webgl_loader_gltf.html) · [webgl_materials_subsurface_scattering.html](https://github.com/mrdoob/three.js/blob/r160/examples/webgl_materials_subsurface_scattering.html)
- Lighting migration: [three.js Migration Guide (wiki)](https://github.com/mrdoob/three.js/wiki/Migration-Guide) · [Updates to lighting in three.js r155 (official forum)](https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733)
- Licenses: [ambientCG](https://ambientcg.com/) · [ambientCG API v2 (wax query)](https://ambientcg.com/api/v2/full_json?type=Material&q=wax&limit=10) · [Poly Haven license](https://polyhaven.com/license)
- Repo: [docs/adr/0004-cc0-only-assets.md](../adr/0004-cc0-only-assets.md) · `prototype/scene.js`
