# Source: https://developers.figma.com/docs/plugins/api/Paint/

<!-- Vendored snapshot of the Figma Plugin API docs. Captured 2026-08-04. -->

**Sources in this file** (captured 2026-08-04):

- <https://developers.figma.com/docs/plugins/api/Paint/>
- <https://developers.figma.com/docs/plugins/api/RGB/>
- <https://developers.figma.com/docs/plugins/api/Effect/>
- <https://developers.figma.com/docs/plugins/api/Transform/>
- <https://developers.figma.com/docs/plugins/api/Image/>
- <https://developers.figma.com/docs/plugins/api/BlendMode/>
- <https://developers.figma.com/docs/plugins/api/figma-util/>

> **Colour-space question, answered from the live docs** (see the RGB/RGBA section below):
>
> `RGB` / `RGBA` channels are floats in **0..1**, and they are **not** linear-light. The docs
> state: *"Figma supports color management. All colors are specified in the same color space
> which will be the color profile of the document,
> [`documentColorProfile`](https://developers.figma.com/docs/plugins/api/DocumentNode/#documentcolorprofile)."*
> For a document whose profile is sRGB — the default — the channels are ordinary
> **gamma-encoded sRGB** values, i.e. CSS `rgb(255,0,0)` is `{r: 1, g: 0, b: 0}`, *not*
> linearised. This is confirmed by `figma.util.rgb()` / `figma.util.solidPaint()`, which accept
> CSS colour strings such as `"#FF0000"` and map them straight onto these channels
> (see `api_figma_util` excerpt below).
>
> Caveat that follows from the same sentence: if a document's profile is **Display P3**, the
> same 0..1 numbers are P3 coordinates, not sRGB. `DocumentNode.documentColorProfile` is the
> only way to tell. Do **not** assume sRGB unconditionally — assume "the document's profile,
> gamma-encoded".
>
> `SolidPaint`, `GradientPaint`, `ImagePaint`, `VideoPaint`, `PatternPaint`, `ShaderPaint` and
> `ColorStop` are all documented on the single `Paint` page vendored first below; they have no
> separate pages of their own (`/docs/plugins/api/SolidPaint/`, `/GradientPaint/`, `/RGBA/`,
> `/ColorStop/` all 404 — `RGBA` lives on the `RGB` page).

---
# Paint

Figma has six types of paints: solid colors, gradients, images, videos, patterns (in beta), and shaders (in beta).

``` ts
type Paint =
  | SolidPaint
  | GradientPaint
  | ImagePaint
  | VideoPaint
  | PatternPaint
  | ShaderPaint
```

## Common properties

### visible?: boolean \[readonly\]

Whether the paint is visible. Defaults to true.

------------------------------------------------------------------------

### opacity?: number \[readonly\]

The opacity of the paint. Must be a value between 0 and 1. Defaults to 1.

You can use the [`solidPaint`](https://developers.figma.com/docs/plugins/api/properties/figma-util-solidpaint/) utility function to set both `color` and `opacity` using CSS color strings:

``` text
// Create a new SolidPaint
const paint = figma.util.solidPaint('#FF00FF88')

// Modify an existing SolidPaint
if (node.fills[0].type === 'SOLID') {
  const updated = figma.util.solidPaint('#FF00FF88', node.fills[0])
}
```

------------------------------------------------------------------------

### blendMode?: [BlendMode](https://developers.figma.com/docs/plugins/api/BlendMode/) \[readonly\]

Determines how the color of this paint blends with the colors underneath it. Defaults to "NORMAL".

------------------------------------------------------------------------

## SolidPaint

### type: 'SOLID' \[readonly\]

The string literal "SOLID" representing the type of paint this is. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### color: [RGB](https://developers.figma.com/docs/plugins/api/RGB/) \[readonly\]

The color of the paint. This does not have a alpha property, use `opacity` instead.

You can use the [`solidPaint`](https://developers.figma.com/docs/plugins/api/properties/figma-util-solidpaint/) utility function to set both `color` and `opacity` using CSS color strings:

``` text
// Create a new SolidPaint
const paint = figma.util.solidPaint('#FF00FF88')

// Modify an existing SolidPaint
if (node.fills[0].type === 'SOLID') {
  const updated = figma.util.solidPaint('#FF00FF88', node.fills[0])
}
```

------------------------------------------------------------------------

### boundVariables?: { \[field in [VariableBindablePaintField](https://developers.figma.com/docs/plugins/api/VariableBindablePaintField/)\]?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)} \[readonly\]

The variables bound to a particular field on this paint

------------------------------------------------------------------------

## GradientPaint

### type: 'GRADIENT_LINEAR' \| 'GRADIENT_RADIAL' \| 'GRADIENT_ANGULAR' \| 'GRADIENT_DIAMOND' \[readonly\]

The string literal representing the type of paint this is. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### gradientTransform: [Transform](https://developers.figma.com/docs/plugins/api/Transform/) \[readonly\]

The positioning of the gradient within the layer.

------------------------------------------------------------------------

### gradientStops: ReadonlyArray\<[ColorStop](https://developers.figma.com/docs/plugins/api/Paint/#colorstop)\> \[readonly\]

Array of colors and their position within the gradient.

------------------------------------------------------------------------

## ImagePaint

This is where you'll find images in Figma, as there are no image nodes. See this [example of working with images](https://developers.figma.com/docs/plugins/working-with-images/).

### type: 'IMAGE' \[readonly\]

The string literal "IMAGE" representing the type of paint this is. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### scaleMode: 'FILL' \| 'FIT' \| 'CROP' \| 'TILE' \[readonly\]

How the image is positioned and scaled within the layer. Same as in the properties panel.

------------------------------------------------------------------------

### imageHash: string \| null \[readonly\]

The hash (id) of the image used for this paint, if any. Use [`figma.getImageByHash`](https://developers.figma.com/docs/plugins/api/figma/#getimagebyhash) to get the corresponding image object.

------------------------------------------------------------------------

### imageTransform?: [Transform](https://developers.figma.com/docs/plugins/api/Transform/) \[readonly\]

Applicable only for `scaleMode == "CROP"`. Determines how the image is positioned (thus, cropped) within the layer.

------------------------------------------------------------------------

### scalingFactor?: number \[readonly\]

Applicable only for `scaleMode == "TILE"` (automatic for other modes). Determines the scaling (thus, repetition) of the image within the layer.

------------------------------------------------------------------------

### rotation?: number \[readonly\]

Applicable only for `scaleMode == "TILE" | "FILL" | "FIT"` (automatic for `scaleMode == "CROP"`). Determines the rotation of the image within the layer. Must be in increments of +90.

------------------------------------------------------------------------

### filters?: [ImageFilters](https://developers.figma.com/docs/plugins/api/Paint/#imagefilters) \[readonly\]

The values for the image filter slides, equivalent to those in the paint picker. All values default to 0.0 and have range -1.0 to +1.0.

------------------------------------------------------------------------

## ImageFilters

``` ts
interface ImageFilters {
  exposure?: number
  contrast?: number
  saturation?: number
  temperature?: number
  tint?: number
  highlights?: number
  shadows?: number
}
```

## ColorStop

``` ts
interface ColorStop {
  readonly position: number
  readonly color: RGBA
  readonly boundVariables?: { [field in VariableBindableColorStopField]?: VariableAlias }
}
```

### position: number \[readonly\]

The position of the stop along the gradient between 0 and 1

------------------------------------------------------------------------

### color: [RGBA](https://developers.figma.com/docs/plugins/api/RGB/#rgba) \[readonly\]

The color value of the gradient stop

------------------------------------------------------------------------

### boundVariables?: { \[field in [VariableBindableColorStopField](https://developers.figma.com/docs/plugins/api/VariableBindableColorStopField/)\]?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)} \[readonly\]

The variable bound to a gradient stop

------------------------------------------------------------------------

## VideoPaint

### type: 'VIDEO' \[readonly\]

The string literal "VIDEO" representing the type of paint this is. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### scaleMode: 'FILL' \| 'FIT' \| 'CROP' \| 'TILE' \[readonly\]

How the image is positioned and scaled within the layer. Same as in the properties panel.

------------------------------------------------------------------------

### videoHash: string \| null \[readonly\]

The hash (id) of the video used for this paint, if any.

------------------------------------------------------------------------

### videoTransform?: [Transform](https://developers.figma.com/docs/plugins/api/Transform/) \[readonly\]

Applicable only for `scaleMode == "CROP"`. Determines how the video is positioned (thus, cropped) within the layer.

------------------------------------------------------------------------

### scalingFactor?: number \[readonly\]

Applicable only for `scaleMode == "TILE"` (automatic for other modes). Determines the scaling (thus, repetition) of the video within the layer.

------------------------------------------------------------------------

### rotation?: number \[readonly\]

Applicable only for `scaleMode == "TILE" | "FILL" | "FIT"` (automatic for `scaleMode == "CROP"`). Determines the rotation of the video within the layer. Must be in increments of +90.

------------------------------------------------------------------------

### filters?: [ImageFilters](https://developers.figma.com/docs/plugins/api/Paint/#imagefilters) \[readonly\]

The values for the video filter slides, equivalent to those in the paint picker. All values default to 0.0 and have range -1.0 to +1.0.

------------------------------------------------------------------------

## PatternPaint

Pattern paints are available in beta, and the API is subject to change.

### type: 'PATTERN' \[readonly\]

The string literal representing the type of paint this is. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### sourceNodeId: string \[readonly\]

The node id of the source node for the pattern

------------------------------------------------------------------------

### tileType: 'RECTANGULAR' \| 'HORIZONTAL_HEXAGONAL' \| 'VERTICAL_HEXAGONAL' \[readonly\]

The way the pattern is tiled

------------------------------------------------------------------------

### scalingFactor: number \[readonly\]

The scaling factor of the pattern

------------------------------------------------------------------------

### spacing: [Vector](https://developers.figma.com/docs/plugins/api/Vector/) \[readonly\]

The spacing of the pattern

------------------------------------------------------------------------

### horizontalAlignment: 'START' \| 'CENTER' \| 'END' \[readonly\]

The horizontal alignment of the pattern

------------------------------------------------------------------------

## ShaderPaint

A `ShaderPaint` applies a [shader](https://developers.figma.com/docs/plugins/api/Shader/) to a node's `fills` or `strokes`. Use [`figma.listAvailableShaders`](https://developers.figma.com/docs/plugins/api/properties/figma-listavailableshaders/) and [`figma.importShaderById`](https://developers.figma.com/docs/plugins/api/properties/figma-importshaderbyid/) to discover and import shaders before applying them.

### type: 'SHADER' \[readonly\]

The string literal "SHADER" representing the type of paint this is. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### id: string \[readonly\]

The id of the shader, as returned by [`figma.listAvailableShaders`](https://developers.figma.com/docs/plugins/api/properties/figma-listavailableshaders/) and [`figma.importShaderById`](https://developers.figma.com/docs/plugins/api/properties/figma-importshaderbyid/). The shader must be imported with [`figma.importShaderById`](https://developers.figma.com/docs/plugins/api/properties/figma-importshaderbyid/) before it can be applied.

------------------------------------------------------------------------

### properties?: { \[defId: string\]: [ShaderPropertyValue](https://developers.figma.com/docs/plugins/api/Shader/#shaderpropertyvalue) } \[readonly\]

The read/write map of property assignments, keyed by property-definition id (the keys of [`propertyDefinitions`](https://developers.figma.com/docs/plugins/api/Shader/#propertydefinitions), not property names). On reads, this is populated with the paint's current assignments, including author-defined defaults, so a plugin can discover the available ids after the shader is applied.

------------------------------------------------------------------------

---

> Source: <https://developers.figma.com/docs/plugins/api/RGB/>

# RGB/RGBA

## RGBA

``` ts
interface RGBA {
  // "Red"
  readonly r: number
  // "Green"
  readonly g: number
  // "Blue"
  readonly b: number
  // "Alpha" or "opacity"
  readonly a: number
}
```

Represents a full Figma color value. These values are from 0 to 1. For example black is `{r: 0, g: 0, b: 0, a: 1}` and white is `{r: 1, g: 1, b: 1, a: 1}`.

``` ts
interface RGB {
  readonly r: number
  readonly g: number
  readonly b: number
}
```

Represents a color just like RGBA but without an alpha value. This is only used for [`SolidPaint`](https://developers.figma.com/docs/plugins/api/Paint/). Colors normally have an alpha value but all paints have an opacity value so alpha was redundant for [`SolidPaint`](https://developers.figma.com/docs/plugins/api/Paint/).

Figma supports [color management](https://help.figma.com/hc/en-us/articles/360039825114). All colors are specified in the same color space which will be the color profile of the document, [`documentColorProfile`](https://developers.figma.com/docs/plugins/api/DocumentNode/#documentcolorprofile).

---

> Source: <https://developers.figma.com/docs/plugins/api/Effect/>

# Effect

Effects can be grouped into several categories of properties: `DropShadowEffect`, `InnerShadowEffect`, `BlurEffect`, `NoiseEffect`, `TextureEffect`, `GlassEffect`, and `ShaderEffect`. The `Effect` type is then one of these:

``` ts
type Effect =
  | DropShadowEffect
  | InnerShadowEffect
  | BlurEffect
  | NoiseEffect
  | TextureEffect
  | GlassEffect
  | ShaderEffect
```

## DropShadowEffect

### type: 'DROP_SHADOW' \[readonly\]

The string literal representing the type of effect this is. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### color: [RGBA](https://developers.figma.com/docs/plugins/api/RGB/#rgba) \[readonly\]

The color of the shadow, including its opacity.

------------------------------------------------------------------------

### offset: [Vector](https://developers.figma.com/docs/plugins/api/Vector/) \[readonly\]

The offset of the shadow relative to its object. Use this property to simulate the direction of the light.

------------------------------------------------------------------------

### radius: number \[readonly\]

The blur radius of the shadow. Must be \>= 0. A lower radius creates a sharper shadow.

------------------------------------------------------------------------

### spread?: number \[readonly\]

The distance by which to expand (or contract) the shadow. For drop shadows, a positive spread value creates a shadow larger than the node, whereas a negative value creates a shadow smaller than the node. For inner shadows, a positive `spread` value contracts the shadow. `spread` values are only accepted on rectangles and ellipses, or on frames, components, and instances with visible fill paints and `clipsContent` enabled. When left unspecified, the default value is 0.

------------------------------------------------------------------------

### visible: boolean \[readonly\]

Whether this shadow is visible.

------------------------------------------------------------------------

### blendMode: [BlendMode](https://developers.figma.com/docs/plugins/api/BlendMode/) \[readonly\]

Determines how the color of this shadow blends with the colors underneath it. The typical default value is "NORMAL".

------------------------------------------------------------------------

### showShadowBehindNode?: boolean \[readonly\]

Whether the drop shadow should show behind translucent or transparent pixels within the node's geometry. Defaults to `false`.

------------------------------------------------------------------------

### boundVariables?: { \[field in [VariableBindableEffectField](https://developers.figma.com/docs/plugins/api/VariableBindableEffectField/)\]?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)} \[readonly\]

The variables bound to a particular field on this shadow effect

------------------------------------------------------------------------

## InnerShadowEffect

### type: 'INNER_SHADOW' \[readonly\]

The string literal representing the type of effect this is. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### color: [RGBA](https://developers.figma.com/docs/plugins/api/RGB/#rgba) \[readonly\]

The color of the shadow, including its opacity.

------------------------------------------------------------------------

### offset: [Vector](https://developers.figma.com/docs/plugins/api/Vector/) \[readonly\]

The offset of the shadow relative to its object. Use this property to simulate the direction of the light.

------------------------------------------------------------------------

### radius: number \[readonly\]

The blur radius of the shadow. Must be \>= 0. A lower radius creates a sharper shadow.

------------------------------------------------------------------------

### spread?: number \[readonly\]

The distance by which to expand (or contract) the shadow. For drop shadows, a positive spread value creates a shadow larger than the node, whereas a negative value creates a shadow smaller than the node. For inner shadows, a positive `spread` value contracts the shadow. `spread` values are only accepted on rectangles and ellipses, or on frames, components, and instances with visible fill paints and `clipsContent` enabled. When left unspecified, the default value is 0.

------------------------------------------------------------------------

### visible: boolean \[readonly\]

Whether this shadow is visible.

------------------------------------------------------------------------

### blendMode: [BlendMode](https://developers.figma.com/docs/plugins/api/BlendMode/) \[readonly\]

Determines how the color of this shadow blends with the colors underneath it. The typical default value is "NORMAL".

------------------------------------------------------------------------

### boundVariables?: { \[field in [VariableBindableEffectField](https://developers.figma.com/docs/plugins/api/VariableBindableEffectField/)\]?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)} \[readonly\]

The variables bound to a particular field on this shadow effect

------------------------------------------------------------------------

## BlurEffect

A blur effect can either normal or progressive (in beta, API is subject to change):

``` ts
type BlurEffect = BlurEffectNormal | BlurEffectProgressive
```

### Common properties

### type: 'LAYER_BLUR' \| 'BACKGROUND_BLUR' \[readonly\]

The string literal representing the type of effect this is. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### radius: number \[readonly\]

The radius of the blur. Must be \>= 0. A lower radius creates a sharper blur. For progressive blurs, this is the end radius of the blur.

------------------------------------------------------------------------

### visible: boolean \[readonly\]

Whether this blur is visible.

------------------------------------------------------------------------

### boundVariables?: { \['radius'\]?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/) } \[readonly\]

The variable bound to the radius field on this blur effect

------------------------------------------------------------------------

### BlurEffectNormal

### blurType: 'NORMAL' \[readonly\]

The string literal representing the blur type. Always check the `blurType` before reading other properties.

------------------------------------------------------------------------

### BlurEffectProgressive

Progressive blur is in beta, and the API is subject to change.

### blurType: 'PROGRESSIVE' \[readonly\]

The string literal representing the blur type. Always check the `blurType` before reading other properties.

------------------------------------------------------------------------

### startRadius: number \[readonly\]

Radius of the starting point of the progressive blur.

------------------------------------------------------------------------

### startOffset: [Vector](https://developers.figma.com/docs/plugins/api/Vector/) \[readonly\]

Position of the starting point of the progressive blur. The position is in normalized object space (top left corner of the bounding box of the object is (0, 0) and the bottom right is (1,1)).

------------------------------------------------------------------------

### endOffset: [Vector](https://developers.figma.com/docs/plugins/api/Vector/) \[readonly\]

Position of the ending point of the progressive blur. The position is in normalized object space (top left corner of the bounding box of the object is (0, 0) and the bottom right is (1,1)).

------------------------------------------------------------------------

## NoiseEffect

Noise effect is available in beta, and the API is subject to change.

There are three types of noise effects:

``` ts
type NoiseEffect =
  | NoiseEffectMonotone
  | NoiseEffectDuotone
  | NoiseEffectMultitone
```

### Common properties

### type: 'NOISE' \[readonly\]

The string literal representing the type of effect this is. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### color: [RGBA](https://developers.figma.com/docs/plugins/api/RGB/#rgba) \[readonly\]

The color of the noise effect.

------------------------------------------------------------------------

### visible: boolean \[readonly\]

Whether the noise effect is visible.

------------------------------------------------------------------------

### blendMode: [BlendMode](https://developers.figma.com/docs/plugins/api/BlendMode/) \[readonly\]

The blend mode of the noise.

------------------------------------------------------------------------

### noiseSize: number \[readonly\]

The size of the noise effect. Applies to both axes. When `noiseSizeVector` is set, this value is always equal to `noiseSizeVector.x`.

------------------------------------------------------------------------

### noiseSizeVector?: [Vector](https://developers.figma.com/docs/plugins/api/Vector/) \[readonly\]

The size of the noise effect along the x and y axes. When omitted, `noiseSize` applies to both axes. When provided, its `x` component must equal `noiseSize` or an error is thrown on write.

------------------------------------------------------------------------

### density: number \[readonly\]

The density of the noise effect.

------------------------------------------------------------------------

### boundVariables?: { } \[readonly\]

Noise effects currently do not support binding variables.

------------------------------------------------------------------------

### NoiseEffectMonotone

### noiseType: 'MONOTONE' \[readonly\]

The string literal representing the type of noise this is. Always check the `noiseType` before reading other properties.

------------------------------------------------------------------------

### NoiseEffectDuotone

### noiseType: 'DUOTONE' \[readonly\]

The string literal representing the type of noise this is. Always check the `noiseType` before reading other properties.

------------------------------------------------------------------------

### secondaryColor: [RGBA](https://developers.figma.com/docs/plugins/api/RGB/#rgba) \[readonly\]

The secondary color of the noise effect.

------------------------------------------------------------------------

### NoiseEffectMultitone

### noiseType: 'MULTITONE' \[readonly\]

The string literal representing the type of noise this is. Always check the `noiseType` before reading other properties.

------------------------------------------------------------------------

### opacity: number \[readonly\]

The opacity of the noise effect.

------------------------------------------------------------------------

## TextureEffect

Texture effect is available in beta, and the API is subject to change.

### type: 'TEXTURE' \[readonly\]

The string literal representing the type of effect this is. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### visible: boolean \[readonly\]

Whether the texture effect is visible.

------------------------------------------------------------------------

### noiseSize: number \[readonly\]

The size of the texture effect. Applies to both axes. When `noiseSizeVector` is set, this value is always equal to `noiseSizeVector.x`.

------------------------------------------------------------------------

### noiseSizeVector?: [Vector](https://developers.figma.com/docs/plugins/api/Vector/) \[readonly\]

The size of the texture effect along the x and y axes. When omitted, `noiseSize` applies to both axes. When provided, its `x` component must equal `noiseSize` or an error is thrown on write.

------------------------------------------------------------------------

### radius: number \[readonly\]

The radius of the texture effect.

------------------------------------------------------------------------

### clipToShape: boolean \[readonly\]

Whether the texture is clipped to the shape.

------------------------------------------------------------------------

### boundVariables?: { } \[readonly\]

Texture effects currently do not support binding variables.

------------------------------------------------------------------------

## GlassEffect

Glass effect is available in beta, and the API is subject to change.

### type: 'GLASS' \[readonly\]

The string literal representing the type of effect this is. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### visible: boolean \[readonly\]

Whether this glass effect is visible.

------------------------------------------------------------------------

### lightIntensity: number \[readonly\]

The intensity of specular highlights. Must be between 0 and 1. Higher values create brighter highlights.

------------------------------------------------------------------------

### lightAngle: number \[readonly\]

The angle of the specular light in degrees. Controls the direction of highlights on the glass surface.

------------------------------------------------------------------------

### refraction: number \[readonly\]

The intensity of the refraction distortion. Must be between 0 and 1. Higher values create more distortion.

------------------------------------------------------------------------

### depth: number \[readonly\]

The depth of the refraction effect. Must be \>= 1. Higher values create deeper glass appearance.

------------------------------------------------------------------------

### dispersion: number \[readonly\]

The amount of chromatic aberration (color separation). Must be between 0 and 1. Higher values create more rainbow-like distortion at edges.

------------------------------------------------------------------------

### radius: number \[readonly\]

The radius of frost on the glass effect.

------------------------------------------------------------------------

### boundVariables?: { } \[readonly\]

Glass effects currently do not support binding variables.

------------------------------------------------------------------------

## ShaderEffect

A `ShaderEffect` applies a [shader](https://developers.figma.com/docs/plugins/api/Shader/) to a node's `effects`. Use [`figma.listAvailableShaders`](https://developers.figma.com/docs/plugins/api/properties/figma-listavailableshaders/) and [`figma.importShaderById`](https://developers.figma.com/docs/plugins/api/properties/figma-importshaderbyid/) to discover and import shaders before applying them.

### type: 'SHADER' \[readonly\]

The string literal "SHADER" representing the type of effect this is. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### visible: boolean \[readonly\]

Whether this shader effect is visible.

------------------------------------------------------------------------

### id: string \[readonly\]

The id of the shader, as returned by [`figma.listAvailableShaders`](https://developers.figma.com/docs/plugins/api/properties/figma-listavailableshaders/) and [`figma.importShaderById`](https://developers.figma.com/docs/plugins/api/properties/figma-importshaderbyid/). The shader must be imported with [`figma.importShaderById`](https://developers.figma.com/docs/plugins/api/properties/figma-importshaderbyid/) before it can be applied.

------------------------------------------------------------------------

### properties?: { \[defId: string\]: [ShaderPropertyValue](https://developers.figma.com/docs/plugins/api/Shader/#shaderpropertyvalue) } \[readonly\]

The read/write map of property assignments, keyed by property-definition id (the keys of [`propertyDefinitions`](https://developers.figma.com/docs/plugins/api/Shader/#propertydefinitions), not property names). On reads, this is populated with the effect's current assignments, including author-defined defaults, so a plugin can discover the available ids after the shader is applied.

------------------------------------------------------------------------

---

> Source: <https://developers.figma.com/docs/plugins/api/Transform/>

# Transform

``` ts
type Transform = [
  [number, number, number],
  [number, number, number]
]
```

A transformation matrix is standard way in computer graphics to represent translation and rotation. These are the top two rows of a 3x3 matrix. The bottom row of the matrix is assumed to be \[0, 0, 1\]. This is known as an [affine transform](https://www.mathworks.com/discovery/affine-transformation.html) and is enough to represent translation, rotation, and skew.

The identity transform is `[[1, 0, 0], [0, 1, 0]]`.

A translation matrix will typically look like:

``` ts
[[1, 0, tx],
 [0, 1, ty]]
```

and a rotation matrix will typically look like:

``` ts
[[cos(angle), sin(angle), 0],
 [-sin(angle), cos(angle), 0]]
```

Another way to think about this transform is as three vectors:

- The x axis (t\[0\]\[0\], t\[1\]\[0\])
- The y axis (t\[0\]\[1\], t\[1\]\[1\])
- The translation offset (t\[0\]\[2\], t\[1\]\[2\])

The most common usage of the `Transform` matrix is the [`relativeTransform`](https://developers.figma.com/docs/plugins/api/properties/nodes-relativetransform/) property. This particular usage of the matrix has a few additional restrictions. The translation offset can take on any value but we do enforce that the axis vectors are unit vectors (i.e. have length 1). The axes are not required to be at 90° angles to each other. More details in the [`relativeTransform`](https://developers.figma.com/docs/plugins/api/properties/nodes-relativetransform/) properties page.

---

> Source: <https://developers.figma.com/docs/plugins/api/Image/>

# Image

This object is handle to an image stored in Figma.

A common misconception is that Figma has image layers. What we have instead is image fills [`ImagePaint`](https://developers.figma.com/docs/plugins/api/Paint/). In fact, dragging an image into Figma creates a rectangle with an image fill. This allows assigning images as strokes too, but it means that creating an image *on the canvas* requires creating a rectangle (or other shape), following by adding an image fill to it.

New images can be created via [`figma.createImage`](https://developers.figma.com/docs/plugins/api/properties/figma-createimage/) from a `Uint8Array` containing the bytes of the image file. Existing images can be read via [`figma.getImageByHash`](https://developers.figma.com/docs/plugins/api/figma/#getimagebyhash).

Figma supports PNG, JPEG, and GIF. Images can be up to 4096 pixels (4K) in width and height.

See this [example of working with images](https://developers.figma.com/docs/plugins/working-with-images/).

## Image

### hash: string \[readonly\]

A unique hash of the contents of the image file.

------------------------------------------------------------------------

### getBytesAsync(): Promise\<Uint8Array\>

The contents of the corresponding image file. This returns a promise because the image may still need to be downloaded (images in Figma are loaded separately from the rest of the document).

------------------------------------------------------------------------

### getSizeAsync(): Promise\<{ width: number; height: number }\>

The width and height of the image in pixels. This returns a promise because the image may still need to be downloaded (images in Figma are loaded separately from the rest of the document).

------------------------------------------------------------------------

---

> Source: <https://developers.figma.com/docs/plugins/api/BlendMode/>

# BlendMode

``` ts
type BlendMode =
  "PASS_THROUGH" |
  "NORMAL" |
  "DARKEN" |
  "MULTIPLY" |
  "LINEAR_BURN" | // "Plus darker" in Figma
  "COLOR_BURN" |
  "LIGHTEN" |
  "SCREEN" |
  "LINEAR_DODGE" | // "Plus lighter" in Figma
  "COLOR_DODGE" |
  "OVERLAY" |
  "SOFT_LIGHT" |
  "HARD_LIGHT" |
  "DIFFERENCE" |
  "EXCLUSION" |
  "HUE" |
  "SATURATION" |
  "COLOR" |
  "LUMINOSITY"
```

Blend mode describes how a color blends with what's underneath it. This property is typically set on a layer, fill or effect (e.g. blend mode of the shadow).

These blend modes are fairly standard and should match what you would find in other image processing tools. [\[Examples\]](https://developer.mozilla.org/en-US/docs/Web/CSS/blend-mode)

---

> Source: <https://developers.figma.com/docs/plugins/api/figma-util/>

## Colour helpers on `figma.util` (CSS string → RGB/RGBA)

### rgb(color: string \| [RGB](https://developers.figma.com/docs/plugins/api/RGB/) \| [RGBA](https://developers.figma.com/docs/plugins/api/RGB/#rgba)): [RGB](https://developers.figma.com/docs/plugins/api/RGB/)

Creates an `RGB` color object from a variety of common color encodings.

**Note**: since `RGB` colors are primarily used for creating `SolidPaint` objects, you might want to use [`solidPaint`](https://developers.figma.com/docs/plugins/api/properties/figma-util-solidpaint/) instead.

Accepted color formats include CSS color strings with hex, `rgb()`, `hsl()`, or `lab()` encodings, as well as `RGB` and `RGBA` objects. Alpha values in the input will be ignored. If a string encoding cannot be parsed, an error will be thrown.

Examples:

``` ts
const color1 = figma.util.rgb('#FF00FF')
const color2 = figma.util.rgb('hsl(25% 50% 75%)')
```

You can alias this function for more concise code:

``` ts
const rgb = figma.util.rgb
const color = rgb('#FF00FF')
```

[View more →](https://developers.figma.com/docs/plugins/api/properties/figma-util-rgb/)

------------------------------------------------------------------------

------------------------------------------------------------------------

### rgba(color: string \| [RGB](https://developers.figma.com/docs/plugins/api/RGB/) \| [RGBA](https://developers.figma.com/docs/plugins/api/RGB/#rgba)): [RGBA](https://developers.figma.com/docs/plugins/api/RGB/#rgba)

Creates an `RGBA` color object from a variety of common color encodings.

Accepted color formats include CSS color strings with hex, `rgb()`, `hsl()`, or `lab()` encodings, as well as `RGB` and `RGBA` objects. Alpha defaults to 1 (opaque) if not provided in the input. If a string encoding cannot be parsed, an error will be thrown.

Examples:

``` ts
const layoutGrid = {
  pattern: 'GRID',
  sectionSize: 1,
  color: figma.util.rgba('rgb(25% 25% 25% / 0.5)')
}
```

You can alias this function for more concise code:

``` ts
const rgba = figma.util.rgba
const color = rgba('rgb(25% 25% 25% / 0.5)')
```

[View more →](https://developers.figma.com/docs/plugins/api/properties/figma-util-rgba/)

------------------------------------------------------------------------

------------------------------------------------------------------------

### solidPaint(color: string \| [RGB](https://developers.figma.com/docs/plugins/api/RGB/) \| [RGBA](https://developers.figma.com/docs/plugins/api/RGB/#rgba), overrides?: Partial\<[SolidPaint](https://developers.figma.com/docs/plugins/api/Paint/#solidpaint)\>): [SolidPaint](https://developers.figma.com/docs/plugins/api/Paint/#solidpaint)

Creates a `SolidPaint` object, assigning color and opacity from a variety of common color encodings.

Accepted color formats include CSS color strings with hex, `rgb()`, `hsl()`, or `lab()` encodings, as well as `RGB` and `RGBA` objects. The resulting alpha value will be applied to the `SolidPaint`'s `opacity` property, which defaults to 1 (opaque) if not specified. If a string encoding cannot be parsed, an error will be thrown.

Optionally, you can provide a set of overrides for any of the non-color properties of the `SolidPaint` object. This is useful for modifying the color of an existing `SolidPaint` while preserving its other properties.

Examples:

``` ts
// Set the current page background to red
figma.currentPage.backgrounds = [figma.util.solidPaint("#FF0000")]

// Modify an existing SolidPaint with new color and opacity
if (node.fills[0].type === 'SOLID') {
  const updated = figma.util.solidPaint('#FF00FF88', node.fills[0])
}
```

You can alias this function for more concise code:

``` ts
const solidPaint = figma.util.solidPaint

// Set the current page background to red
figma.currentPage.backgrounds = [solidPaint("#FF0000")]

// Modify an existing SolidPaint with new color and opacity
if (node.fills[0].type === 'SOLID') {
  const updated = solidPaint('#FF00FF88', node.fills[0])
}
```

[View more →](https://developers.figma.com/docs/plugins/api/properties/figma-util-solidpaint/)

------------------------------------------------------------------------
