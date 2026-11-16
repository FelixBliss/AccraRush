# Accra Rush Vehicle Assets

## Corolla taxi model

File: `accrarush_corolla_taxi.glb`

Source: preserved from the `accraride/road-network-integration` branch and copied into `master` as a standalone asset. The source branch was not merged.

Previously inspected asset metadata: GLB 2.0, approximately 633 KB, 33 mesh definitions, 44 nodes, 22 materials and 4 embedded textures. The model includes exterior taxi geometry and interior-related nodes, plus wheel/steering pivot nodes.

Expected use: load through Three.js GLTFLoader as a vehicle visual model. Keep the physics body separate from the rendered GLB. Check model scale, forward axis, wheel pivot names, materials, and cockpit camera position in the actual game before integrating it into the production scene.

Important: copying the asset into master does not mean it has been integrated into the driving game or verified on Android. Keep it as an isolated reusable asset until the vehicle integration test passes.