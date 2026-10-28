# Camera and input specification

## Projection
PerspectiveCamera with initial FOV 35°, pitch 42° down from horizontal, target at scene center or tracked character, yaw offset 0°, orbit distance 16 units.

## Clamps
- Pitch: 30°–55° down from horizontal
- Yaw: ±45° from configured base direction
- Orbit distance: 8–25 units
- Avoid camera clipping into ground and major geometry; adjust near/far planes to scene bounds.

## Controls
- Pointer drag: orbit yaw/pitch within clamps
- Wheel: smooth zoom
- WASD: move character relative to camera horizontal orientation
- Touch: one-finger orbit, two-finger pinch zoom (when supported)
- UI interactions must not propagate to camera drag

## Engineering requirements
Use a single canonical camera state (target, yaw, pitch, distance, FOV). Support resize, damping with frame-rate-independent interpolation, and explicit reset. Art Lab may edit these values and export/import preset JSON. Lock deterministic default framing for Golden Scene screenshots.

## Validation
Test camera at every extreme, on 16:9 and portrait viewports, and while character moves behind buildings. Limited orbit does not eliminate the need for character-relative direction switching.

## M1 implementation contract

- 世界使用右手坐标系：+X 右、+Y 上、−Z 前；地面 Y=0，1 unit = 1 m。
- `baseYaw = 35°` 是 M1 选择的基准构图参数，不是从参考截图测量得出的角度。绝对 yaw 为 `baseYaw + yawOffset`。
- yaw 从 +Z 朝 +X 增大；yaw=0 时相机位于目标的 +Z 侧，yaw=90° 时位于 +X 侧。配置与 GUI 的角度均为度。
- pitch 指**观察方向从水平向下的俯角**；相机位置相对目标向上抬高同样的角度。它不等同于直接修改 Three.js Euler rotation.x。
- 默认 target=(0, 0.8, 0)，距观察目标的三维轨道距离为 16，而非水平地面距离。垂直 FOV 固定为 35°，GUI 中仅展示；水平 FOV 随视口比例变化。
- 轨道位置：`x = target.x + d cos(pitch) sin(yaw)`，`y = target.y + d sin(pitch)`，`z = target.z + d cos(pitch) cos(yaw)`；相机通过 `lookAt(target)` 定向。
- GUI 可将 target 的 X/Z 调整到 −3…3，Y 调整到 0…3。金色球为目标，金色圆环为其地面投影。重置同时恢复 target。
- 规范状态只有 `ConstrainedCamera.state`；输入与 GUI 共同修改它。内部 `rendered` 仅为阻尼插值结果，不接受外部输入。HUD 展示请求值，画面平滑接近请求值。
- 阻尼系数为 `1-exp(-10*dt)`。渲染循环将长帧 dt 限制为 0.1 秒，标签页恢复时重置时间基准；重置视角直接应用默认位置。
- 鼠标向右拖动使 yawOffset 减小，向下拖动使 pitch 增大。正向滚轮拉远；捏合张开拉近。滚轮的像素、行和页 deltaMode 均转换为像素量。
- 输入监听仅绑定在 canvas。Pointer capture 支持拖出画布后结束；pointercancel、失去 capture、窗口失焦和页面隐藏都会清理手势。canvas 使用 `touch-action:none`；GUI 使用独立 DOM。
- ResizeObserver 观察画布容器，窗口 resize 和 DPR 变化同步投影及绘图缓冲区。DPR 上限为 2，3D 画面保持抗锯齿，不做全屏像素化。
- 相机 near/far 为 0.1/100。当前地面及目标约束下，相机至少位于 Y=4，另有 0.25 的地面安全下限；测试几何最高 2.7，不会进入其体积。复杂建筑的相机碰撞需在 M2 场景引入后验证。
- 竖屏不自动改变 distance/FOV；默认及近距离取景可能裁切外围体块，可手动拉远。保持参数一致有助于之后的固定视角对比。

## Coordinate conversion status

Blender Z-up 到运行时 Y-up 的标准基变换为绕 X 轴 −90°：`(x, y, z) → (x, z, -y)`。因此 Blender +Z → Three.js +Y，Blender +Y → Three.js −Z，+X 保持 +X。

M1 单元测试已验证这三个基向量的数学映射。M1 没有 GLB 导入或 Blender 导出；**真实 Blender → GLB → Three.js 轴测试资产仍在 M2 验证**。不要对已经完成 Y-up 转换的 glTF 再额外旋转一次。
