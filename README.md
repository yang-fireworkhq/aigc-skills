# AIGC Skills

面向 AI Agent 的视频生成与提示词优化工具集，可通过 `npx skills` 安装。本仓库包含 **5 个 skill**：两个负责调用视频服务，三个负责整理和优化提示词。每个目录包含独立的 `SKILL.md`，以及该 skill 所需的脚本或参考资料。

## Skill 一览

| Skill | 用途 | 何时选择 |
| --- | --- | --- |
| [byteplus-seedance-video](byteplus-seedance-video/SKILL.md) | 调用 BytePlus Seedance 2.0、2.0 Fast 或 2.5，上传参考素材、提交任务、等待结果并清理临时资源。 | 已经有创意或提示词，希望实际生成 Seedance 视频。 |
| [minimax-h3-video](minimax-h3-video/SKILL.md) | 调用国际版 MiniMax H3，创建、查询、等待、列出和下载视频任务。 | 希望实际生成 H3 视频，或管理已有任务。 |
| [sd25-pe](sd25-pe/SKILL.md) | 将文字、故事和多模态参考整理成 Seedance 2.5 可提交的提示词，明确素材角色、人物关系、事件状态和连续性。 | Seedance 2.5 的生成、编辑、延长、关键帧、分镜或复杂多素材需求。 |
| [sd2-pe](sd2-pe/SKILL.md) | 按 Seedance 2.0 的结构优化提示词，检查主体、动作、场景、运镜、风格和素材映射，必要时先澄清需求。 | Seedance 2.0 创意补全、提示词改写和多模态素材规划。 |
| [h3-prompt-writing](h3-prompt-writing/SKILL.md) | 按 MiniMax H3 的文本、关键帧或完整参考模式编写结构化视听提示词。 | 只想准备 H3 提示词，或在调用生成服务前明确镜头、声音及参考关系。 |

提示词 skill 本身不提交付费视频任务。实际生成时，再交给相应的生成 skill。`sd25-pe` 首次触发会尝试运行其文档规定的自动更新命令。

## 安装方法

先准备 Node.js 和 npm，确保终端可以运行 `npx`，并能访问 GitHub 与 npm。安装时按提示选择目标 Agent 和安装范围。

### 从仓库安装

```bash
npx skills add yang-fireworkhq/aigc-skills
```

### 只安装指定 skill

把 `--skill` 后的名称替换为上表中的任意名称：

```bash
npx skills add yang-fireworkhq/aigc-skills --skill byteplus-seedance-video
npx skills add yang-fireworkhq/aigc-skills --skill minimax-h3-video
npx skills add yang-fireworkhq/aigc-skills --skill sd25-pe
npx skills add yang-fireworkhq/aigc-skills --skill sd2-pe
npx skills add yang-fireworkhq/aigc-skills --skill h3-prompt-writing
```

### 查看可识别的 skill

```bash
npx skills add yang-fireworkhq/aigc-skills --list
```

### 安装全部 skill 到全局 Codex

```bash
npx skills add yang-fireworkhq/aigc-skills --all --agent codex --global --yes
```

省略 `--global` 可安装到当前项目。其他 Agent 可使用交互安装选择。安装完成后，在支持 skill 的 Agent 对话中直接写出 skill 名称；下方示例使用 Codex 的 `$skill-name` 写法。

## 使用示例

示例中的文件路径需要替换为实际素材路径。生成任务需先配置对应服务的凭据；只优化提示词无需视频服务凭据。

### 1. byteplus-seedance-video：实际生成 Seedance 视频

支持文字与图片、视频、音频参考。Seedance 2.0 和 2.0 Fast 支持 4–15 秒；2.5 支持 4–30 秒及自适应时长。脚本会处理参考素材上传、任务轮询和临时资源清理。

在 Agent 中输入：

```text
使用 $byteplus-seedance-video，用 Seedance 2.5 生成一段 10 秒、9:16 的产品展示视频。
产品参考图：/absolute/path/product.jpg。
产品放在浅色桌面上，镜头缓慢靠近，保持外观和结构一致。
不需要人声，只保留轻柔背景音乐。先展示最终提示词和参数，等我确认后提交。
凭据从当前项目的 .env 读取，不要输出密钥。
```

也可直接运行随 skill 附带的 Node.js 脚本。以下命令会实际提交生成任务：

```bash
node ~/.codex/skills/byteplus-seedance-video/scripts/create_seedance_video.mjs \
  --dotenv .env \
  --prompt "浅色桌面上的产品展示，镜头缓慢靠近，保持产品结构一致，轻柔背景音乐，无人声。" \
  --image /absolute/path/product.jpg \
  --model 2.5 --duration 10 --ratio 9:16 \
  --out result.json
```

脚本路径适用于安装到 `~/.codex/skills` 的情况；项目级安装或其他 Agent 请改为实际安装路径。

### 2. minimax-h3-video：生成与管理 H3 视频

支持文字、首帧、首尾帧，以及图片、视频和音频参考。生成时长为 4–15 秒，分辨率支持 768P 或 2K。首尾帧模式与参考素材模式不能混用。

```text
使用 $minimax-h3-video，以 /absolute/path/first-frame.png 为首帧，
生成 8 秒、768P 的视频：杯中的热气缓慢上升，镜头固定，只保留室内环境声。
先展示提示词、素材映射和参数，执行 dry-run，等我确认后再提交付费任务。
```

查询或下载已有任务：

```text
使用 $minimax-h3-video，查询任务 TASK_ID 的当前状态，只查一次。
```

```text
使用 $minimax-h3-video，等待任务 TASK_ID 完成，成功后下载到
/absolute/path/output.mp4，并检查时长、画面尺寸和音轨。
```

### 3. sd25-pe：优化 Seedance 2.5 提示词

适合复杂人物与道具关系、多素材映射、视频编辑或延长。它会区分生成、编辑和延长任务，并保留用户明确指定的素材引用。

```text
使用 $sd25-pe 优化下面的 Seedance 2.5 提示词，只输出可提交的提示词，不生成视频：
@Image1 定义店员的外貌和服装，@Image2 定义顾客，@Image3 定义咖啡馆。
店员站在柜台内侧，顾客站在外侧。店员把唯一一杯咖啡递给顾客，
结束时咖啡只在顾客手中，店员松开双手。全程无对白，只保留咖啡馆环境声。
```

比例、总时长和分辨率等生成参数应在下游页面或 API 设置，不混入普通生成任务的提示词正文。

### 4. sd2-pe：优化 Seedance 2.0 提示词

适合从粗略想法开始，逐步确认主体、动作、环境、运镜和声音。信息缺失或运镜冲突时，会先给出澄清问题或可选建议。

```text
使用 $sd2-pe 优化 Seedance 2.0 提示词，不提交生成任务：
@Image 1 是产品参考图。产品摆在木桌中央，窗边自然光照亮表面。
0–4 秒：固定镜头展示产品整体；4–8 秒：镜头缓慢推进，展示材质细节。
写实风格，无人声，无字幕，只有轻柔背景音乐。
如有必须确认的信息，请集中提出。
```

### 5. h3-prompt-writing：编写 H3 结构化提示词

支持文本生成（T2VA）、首帧（I2VA）、首尾帧（FL2VA）、尾帧（L2VA）及完整参考（Ref2VA）的提示词编写。基础模式使用三段结构，完整参考模式使用六段结构。结构说明使用英文，对白、歌词和画面文字保留原语言。

```text
使用 $h3-prompt-writing，为 MiniMax H3 编写一个 8 秒的文本生成提示词。
场景：清晨的安静厨房，一杯热咖啡放在窗边，蒸汽缓慢上升。
镜头从中景缓慢推进至杯口，窗外有轻微鸟鸣，无对白，无画面文字，无背景音乐。
按 T2VA 的标准字段输出，只准备提示词，不调用生成 API。
```

尾帧模式是此 skill 支持的提示词编写模式；实际提交前需另行确认生成工具是否提供相应参数。当前 `minimax-h3-video` 脚本提供首帧及可选尾帧方式。

## 凭据与运行环境

| 生成 skill | 环境要求 | 凭据 |
| --- | --- | --- |
| byteplus-seedance-video | Node.js 18+，无需额外 npm 依赖 | 纯文字需要 `ARK_API_KEY`；使用参考素材还需要 `BYTEPLUS_ACCESS_KEY`、`BYTEPLUS_SECRET_KEY`、`BYTEPLUS_TOS_BUCKET`。 |
| minimax-h3-video | Python 3；使用国际版 `https://api.minimax.io` | `MINIMAX_API_KEY_INTER`，通过进程环境变量提供。 |

BytePlus 可选区域配置、脚本参数和素材限制见对应 [SKILL.md](byteplus-seedance-video/SKILL.md)。MiniMax 的参数、提示词格式和任务操作见对应 [SKILL.md](minimax-h3-video/SKILL.md)。

实际视频生成可能产生费用；请在确认最终提示词、素材和参数后提交。不要将 API Key、`.env`、生成结果或私人素材提交到仓库。提示词验证、脚本语法检查及 dry-run 不等于已验证服务端生成效果。
