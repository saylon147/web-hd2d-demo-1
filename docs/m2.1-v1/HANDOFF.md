# M2.1 V1 外景评审

[同机位 V0 / V1](../screenshots/m2.1-v1/exterior-before-after.png) · [原始概念对照](../screenshots/m2.1-v1/reference-comparison.png) · [上下层平面](../screenshots/m2.1-v1/floor-plan-check.png) · [剖面](../screenshots/m2.1-v1/height-and-stair-check.png)

本次以现有外景机位拍摄，V0 使用仓库留存的 Web 截图。V1 将平顶岩台的侧面改为连续变宽、局部起伏的岩坡，保留地下室空腔和两段沿海楼梯。矮木栏标记前庭边界，降低屋脊，使用色块区分屋瓦、墙面、树冠、海水和沙滩。全部资产为程序化评审占位件。

## 空间与限制

三处平台轮廓的水平投影合计 318.77 平方米，小屋占地 36 平方米，比值 8.85。验证脚本另从上方以 0.2 米网格采样导出的 GLB，排除小屋、障碍、海水和超过 30 度的表面，得到约 244.64 平方米外露室外地面。该估计受采样分辨率影响，未模拟角色的宽度与路线连通性。室内沿用原有 6 × 6 米布局及后左 U 形楼梯，尚待评审。岛顶较平，前侧仍可辨认两级平台，树冠、裸岩和水面还有明显的占位感。

## 复核

运行 npm run assets:blockout、npm run assets:validate、npm run build、npm run lint、npm test、npm run test:browser 和 npm run evidence:compare。Windows 本机浏览器使用 Chrome，NO_PROXY 包含 localhost 和 127.0.0.1。

Blender 5.2.1 完成源场景、模型及六张渲染图。资产与空间检查 54 项、单元测试 24 项、Chrome 浏览器测试 11 项全部通过。TypeScript、lint 和构建通过，Vite 提示主包超过 500 kB。场景 GLB 728628 字节，6856 个三角形。外景含阴影 329 次绘制调用，设备帧率尚未测量。

主要修改位于参数 island_cottage_v2.json、生成脚本 generate_blockout.py、验证和对照图脚本，以及 Web 场景配置、灯光和对应测试。资产文件名 v2 对应第二次导出，评审版本名 V1 对应 V0 之后的第一次修订。下一步根据外景动线、前庭尺度和室内平剖反馈继续调整，获批后进入 M2.2 小屋主资产制作。
