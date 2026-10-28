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
- WASD: planned in M3 to move character relative to camera horizontal orientation
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

M1 单元测试已验证这三个基向量的数学映射。M2.1 的 `axis_test_01.glb` 已通过真实 Blender 导出与 GLTFLoader 解析，验证命名 +X/+Y/+Z 标记的位置和米制尺度。不要对已经完成 Y-up 转换的 glTF 再额外旋转一次。

## M2.1 camera profile

相机控制器现在接受 profile 和 mode preset；默认 foundation profile 保留 M1 行为。M1 校准场景通过 `/?scene=foundation` 访问，历史参数不变。

M2 profile 为完整岛屿扩展 distance 到 8–45 m，GUI target X/Z 到 ±12 m、Y 到 0–12 m；pitch 30–55°、yaw offset ±45°、base yaw 35°、垂直 FOV 35°、输入、阻尼和 resize 语义沿用 M1。三个预设由源参数生成至 `public/assets/manifests/blockout_v1.json`，数值见 [M2 spatial contract](M2_SPATIAL_SPEC.md)。切换模式立即应用预设；重置恢复当前模式的 target/pitch/yaw/distance。

标准机位可检查外景和剖视，未实现完整相机/建筑碰撞系统；任意 GUI target 修改可能进入或裁切几何。竖屏不自动改变机位，因此可能裁切岛屿，尚未认证真实手机性能。Blender 固定外景/剖视与 Web 使用相同角度和距离，但画布宽高比与色彩/灯光不同；不以两者像素相等作为验收。俯视与高度剖面另用检查用正交相机。
