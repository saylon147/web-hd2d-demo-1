# Art Bible — v0.1

## Visual identity
**Stylized hand-painted 3D diorama + crisp pixel-art 2D character.** References show warm terracotta roofing, light plaster walls, rounded stonework, saturated green foliage, bright floral accents and soft directional light. Aim for a cohesive storybook miniature, not photorealism or globally pixelated 3D.

## Form and proportions
- World scale: 1 unit = 1 meter; characters target 1.6–1.8 units tall (art direction may adjust).
- Buildings: simple readable silhouettes; mildly exaggerated roof tiles, doors and windows.
- Stones: rounded asymmetrical forms, broad color patches rather than noisy microdetail.
- Vegetation: layered leaf masses and readable flowers; avoid photoreal foliage cards.
- Details must read at default camera distance, not just in close-up.

## Initial palette (provisional, tune in Golden Scene)
- Plaster cream: #E9DEC4
- Terracotta: #BC6937
- Leaf green: #4F8A49
- Deep foliage: #32673D
- Sage door: #638F79
- Warm stone: #B7AF98
- Pink flower: #E68B91
- Sea/sky accent: #54B9CA

Do not apply colors mechanically to every asset; preserve controlled variation and hierarchy. Record palette changes in presets.

## Material families
1. Plaster — matte, broad low-frequency stains and edge wear.
2. Terracotta — warm tile variation, visible geometry and restrained hand-painted texture.
3. Stone — neutral warm irregular patches, rounded shapes.
4. Foliage — clean color groups, layered silhouettes, limited specular response.

Use MeshStandardMaterial initially; color textures in sRGB, high roughness, no unnecessary metalness. Test custom shaders only when a specific visual gap is documented.

## Lighting
One soft key directional light + hemisphere/ambient fill, soft shadow maps and conservative AO. Warm sun, readable shadow shape, no pitch-black contact. Configure renderer output color space and tone mapping explicitly.

## Character integration
Character remains pixel-crisp (NearestFilter) while the 3D world remains smoothly rendered. No full-screen pixelation. Prefer independent ground contact shadow. DOF, if used, must not blur the sprite unintentionally.

## Golden Scene and approval
Golden Scene contains one building, stairs, stones, vegetation, pixel character, and a neutral comparison background. Lock camera, exposure and lighting for comparison. Each new asset is reviewed for scale, palette, silhouette, texture frequency, material response and performance before approval.

## Art review rubric (1–5)
Silhouette readability; palette harmony; texture consistency; scale compatibility; lighting response; pixel/3D cohesion. Record failures and revise assets rather than masking them with postprocessing.
