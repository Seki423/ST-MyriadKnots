# 千千结：玩家自定义主题创作指南

这份指南用于让 ChatGPT、Claude 等 AI 根据你的审美描述，生成可以由「千千结」导入的自定义主题 JSON 文件。

你不需要自己编写 CSS 或 JavaScript。告诉 AI 想要的配色风格，再让它按照本指南输出 JSON 即可。

> **适用范围**：千千结自定义主题包，`format` 为 `qqj-custom-themes`，`schemaVersion` 为 `1`。

---

## 1. 给 AI 的开场提示词

复制下面整段提示词，发送给你使用的 AI。把「[填写风格]」替换成你想要的视觉方向即可。

> **请按照以下规范为我生成一个千千结主题包的 JSON，主题风格是：[填写风格]。**
>
> 请严格遵守本指南的 JSON 格式、12 个颜色变量、安全规则和动态跟随规则：
>
> 1. 只输出一个完整、可直接导入的 JSON 文件内容，不要输出 Markdown 代码围栏、解释、注释或额外文字。
> 2. 顶层必须包含且只包含 `format`、`schemaVersion`、`exportedAt`、`items` 四个字段。
> 3. `format` 固定为 `qqj-custom-themes`，`schemaVersion` 固定为数字 `1`，`exportedAt` 使用 ISO 8601 时间字符串。
> 4. `items` 至少包含一个主题对象。每个主题对象必须包含 `id`、`name`、`variables`、`createdAt`、`updatedAt`。
> 5. `variables` 必须且只能包含以下 12 个字段：`paper`、`panel`、`ink`、`soft`、`faint`、`line`、`thread`、`crimson`、`knot`、`onPrimary`、`blue`、`success`。一个字段都不能缺少，也不能增加自定义字段。
> 6. `onPrimary` 一律填写字符串 `"auto"`，不要自行指定文字颜色。
> 7. `crimson`、`blue`、`success` 必须填写六位标准 HEX 静态色，例如 `"#B63745"`；不得写成 `var()`、`rgb()` 或 `hsl()`。
> 8. 其余八个字段可以使用静态 HEX / RGB / HSL 颜色，也可以按本指南的映射表使用宿主变量。使用 `var()` 时必须提供安全的颜色回退值。
> 9. 绝对不要生成 `url()`、`javascript:`、外部链接、远程资源引用、CSS 选择器、CSS 声明块或脚本。颜色值只能使用 HEX、`rgb()/rgba()`、`hsl()/hsla()`，或本指南列出的宿主变量 `var()`。
> 10. 不要添加图片地址、字体地址、脚本、CSS 文本、预览地址或任何额外元数据字段。
> 11. 颜色需要彼此协调，并保证正文与背景有足够的可读对比度。请根据主题风格自行完成整套配色，不要只改变强调色。
> 12. 输出前自行检查 JSON 语法、所有必需字段、12 个变量名称、静态语义色和安全规则。
>
> 请生成一个完整主题包；不要只返回 `variables` 片段。

### 可以怎样描述主题风格？

描述越具体，生成结果越容易接近预期。例如：

- **赛博朋克霓虹**：深蓝黑背景、荧光青主强调色、玫红危险色、冷调紫蓝信息色。
- **奶油甜品**：奶油白和浅粉卡片、柔和灰褐文字、低饱和莓果强调色。
- **复古图书馆**：暖纸张底色、深墨绿文字、黄铜色强调、沉稳的酒红提示色。
- **月光玻璃**：冷灰蓝背景、半透明感的浅色层次、银白文字、冰蓝强调色。
- **樱花手账**：柔白底色、浅樱粉卡片、灰粉文字、清透玫瑰色强调。

---

## 2. JSON 格式标准

### 2.1 顶层主题包结构

导入器识别的主题包格式如下。字段名称和类型必须保持一致：

| 字段 | 类型 | 固定要求 / 用途 |
|---|---|---|
| `format` | 字符串 | 固定写为 `"qqj-custom-themes"` |
| `schemaVersion` | 数字 | 固定写为 `1` |
| `exportedAt` | 字符串 | ISO 8601 日期时间，例如 `"2026-11-14T08:00:00.000Z"` |
| `items` | 数组 | 主题对象数组；每个对象代表一套主题 |

### 2.2 完整结构示意

下面是一个结构完整的示例主题包。它可以作为 AI 生成时的格式模板：

```json
{
  "format": "qqj-custom-themes",
  "schemaVersion": 1,
  "exportedAt": "2026-11-14T08:00:00.000Z",
  "items": [
    {
      "id": "my-first-theme",
      "name": "我的第一套主题",
      "variables": {
        "paper": "#F7F8FA",
        "panel": "#FFFFFF",
        "ink": "#22282B",
        "soft": "#637077",
        "faint": "#929DA2",
        "line": "#DCE2E5",
        "thread": "#CBD4D8",
        "crimson": "#B63745",
        "knot": "#B63745",
        "onPrimary": "auto",
        "blue": "#3B706A",
        "success": "#3D6F55"
      },
      "createdAt": "2026-11-14T08:00:00.000Z",
      "updatedAt": "2026-11-14T08:00:00.000Z"
    }
  ]
}
```

### 2.3 单个主题对象的规则

- `id`：主题唯一标识，必须是非空字符串，最长 100 个字符。建议使用英文、数字和连字符，例如 `"soft-pink-notes"`。
- `name`：显示在主题卡片上的名称，必须是非空字符串，最长 80 个字符。
- `variables`：必须包含本指南列出的完整 12 个颜色字段。
- `createdAt`、`updatedAt`：建议使用 ISO 8601 日期时间字符串。
- 顶层和单个主题对象都不要擅自增加字段。导入器会严格检查不支持的字段。
- 主题包不需要 `activePresetId`。导入后主题会加入主题库，用户再手动选择「应用」。

---

## 3. 12 个颜色变量说明

千千结主题由以下 12 个颜色变量组成。AI 必须全部输出，不能遗漏。

下表中的 HEX 是千千结内置配色的参考值。日间与夜间是两套基础调色参考，不代表主题只能使用这些颜色。

| 字段 | 用途 | 内置日间参考 | 内置夜间参考 |
|---|---|---:|---:|
| `paper` | 页面最外层底色、主要背景 | `#F7F8FA` | `#13181B` |
| `panel` | 卡片、面板等内容表面的底色 | `#FFFFFF` | `#1C2327` |
| `ink` | 正文、主要标题等核心文字 | `#22282B` | `#E7ECEE` |
| `soft` | 次级文字、说明文字 | `#637077` | `#9DB0B5` |
| `faint` | 弱化提示、辅助信息 | `#929DA2` | `#6C7C81` |
| `line` | 卡片边框、分隔线 | `#DCE2E5` | `#2B363B` |
| `thread` | 关系线、连接线等线条 | `#CBD4D8` | `#33424A` |
| `crimson` | 危险、删除、错误等语义提示色 | `#B63745` | `#D9707A` |
| `knot` | 主题主强调色、主要操作和选中状态 | `#B63745` | `#D9707A` |
| `onPrimary` | 主强调色背景上显示的文字颜色 | **`"auto"`** | **`"auto"`** |
| `blue` | 信息提示、辅助强调等语义色 | `#3B706A` | `#77B0AA` |
| `success` | 成功、完成等正向语义提示色 | `#3D6F55` | `#77B193` |

> **日间自动回退补充**：当外观模式为「跟随」且无法读取宿主主题信号时，内置自动日间回退色会与上表的显式日间色略有不同，例如页面底色为 `#E8ECEC`、卡片底色为 `#F6F8F8`、危险色和强调色为 `#A8322F`。动态主题的 `var()` 回退值由主题作者自行决定。

### 3.1 特别规则：onPrimary 一律使用 auto

**AI 生成主题时，`onPrimary` 必须写成：**

```json
{
  "onPrimary": "auto"
}
```

不要让 AI 根据主色猜测白字或黑字。使用 `auto` 后，千千结会根据实际强调色计算合适的前景文字颜色，以保持可读性。

导入器也会把导入主题的 `onPrimary` 统一归一为 `auto`。

### 3.2 特别规则：三个语义色必须是静态 HEX

以下三个变量只能使用静态 HEX 颜色：

| 字段 | 正确示例 | 错误示例 |
|---|---|---|
| `crimson` | `"#D95772"` | `"var(--SmartThemeQuoteColor, #D95772)"` |
| `blue` | `"#6D8DFF"` | `"rgb(109, 141, 255)"` |
| `success` | `"#52B788"` | `"hsl(150 45% 52%)"` |

为保证 AI 输出统一，建议这三个字段一律采用六位 `#RRGGBB` 格式。它们代表固定的危险、信息和成功语义，不随酒馆主题动态改变。

---

## 4. 动态跟随酒馆主题规则

除了 `crimson`、`blue`、`success` 三个静态语义色，以及使用 `"auto"` 的 `onPrimary` 之外，其余 **8 个字段都支持动态跟随宿主主题**。

动态字段使用 CSS 自定义属性 `var()`。当酒馆切换主题时，千千结会读取这些变量；括号内的第二个参数是安全回退色，当宿主未提供对应变量时使用。

### 4.1 官方映射表

AI 只能按下表为对应字段选择宿主变量：

| 千千结字段 | 宿主变量 | 跟随内容 |
|---|---|---|
| `paper` | `--SmartThemeBlurTintColor` | 页面背景色调 |
| `panel` | `--SmartThemeChatTintColor` | 聊天内容表面 / 面板色调 |
| `ink` | `--SmartThemeBodyColor` | 正文文字色 |
| `soft` | `--SmartThemeEmColor` | 次级文字色 |
| `faint` | `--SmartThemeEmColor` | 弱化文字色 |
| `line` | `--SmartThemeBorderColor` | 边框颜色 |
| `thread` | `--SmartThemeBorderColor` | 连接线颜色 |
| `knot` | `--SmartThemeQuoteColor` | 引用 / 强调色 |

注意：`soft` 和 `faint` 共用同一个宿主变量；`line` 和 `thread` 也共用同一个宿主变量。它们各自的回退 HEX 可以不同。

### 4.2 正确的动态写法

```json
{
  "paper": "var(--SmartThemeBlurTintColor, #F7F8FA)",
  "panel": "var(--SmartThemeChatTintColor, #FFFFFF)",
  "ink": "var(--SmartThemeBodyColor, #22282B)",
  "soft": "var(--SmartThemeEmColor, #637077)",
  "faint": "var(--SmartThemeEmColor, #929DA2)",
  "line": "var(--SmartThemeBorderColor, #DCE2E5)",
  "thread": "var(--SmartThemeBorderColor, #CBD4D8)",
  "knot": "var(--SmartThemeQuoteColor, #B63745)"
}
```

### 4.3 动态主题与静态主题怎么选？

- **全静态主题**：12 个字段都使用具体颜色（但 `onPrimary` 仍然必须是 `"auto"`）。无论酒馆切换到什么主题，这套主题都尽量维持自己的配色风格。
- **动态跟随主题**：上面 8 个字段使用对应的 `var(--SmartTheme..., 回退色)`，三个语义色保持静态 HEX，`onPrimary` 使用 `"auto"`。这样能保留千千结的视觉层次，同时跟随酒馆的主背景、文字和边框色调。

---

## 5. 安全避坑指南

> [!CAUTION]
> **给 AI 的最高优先级安全要求：绝对不能生成 `url()`、`javascript:` 或任何外部链接。不要引入远程图片、远程 CSS、字体文件、脚本或外部资源。**

主题 JSON 只保存颜色表达式，不是 CSS 文件，也不是网页。不要把 CSS 代码或脚本塞进颜色字段。

### 允许使用的颜色写法

- HEX：`#RGB`、`#RGBA`、`#RRGGBB`、`#RRGGBBAA`。推荐普通六位 HEX。
- RGB：`rgb(34, 40, 43)`、`rgba(34, 40, 43, 0.8)`。
- HSL：`hsl(210 20% 30%)`、`hsla(210, 20%, 30%, 0.8)`。
- 本指南映射表中的宿主变量 `var(--SmartTheme..., 安全回退色)`。

为便于跨主题和跨 AI 工具稳定导入，建议优先使用六位 HEX，以及本指南列出的八种宿主变量写法。

### 绝对禁止

| 禁止内容 | 示例 | 原因 |
|---|---|---|
| 外部资源函数 | `url(https://example.com/theme.css)` | 主题颜色不应加载外部资源 |
| JavaScript 协议 | `javascript:alert(1)` | 不是颜色表达式，可能带来脚本风险 |
| 外部链接 / 远程地址 | `https://example.com/palette` | 主题包不接受外部资源地址 |
| CSS 选择器或声明块 | `body { background: red; }` | 主题包只允许颜色变量，不接受任意 CSS |
| 脚本或 HTML | `<script>...` | 主题包不是可执行代码容器 |
| 未列入映射表的变量 | `var(--SomeOtherPluginColor, #fff)` | AI 不应自行猜测或引用其他插件变量 |

### 额外格式限制

- 每个颜色值最多 200 个字符。
- `var()` 必须使用本指南列出的宿主变量，并提供颜色回退值。
- 不得在颜色值里加入分号、花括号或 CSS 注释。
- 不得增加未列出的变量名或主题对象元数据。
- 导入器会逐项校验主题；不合法的主题会被跳过，不会因为文件里有其他合法主题就获得执行权限。

---

## 6. 两个完整、可直接导入的 JSON 示例

下面两个示例都是完整主题包。复制其中任意一个 JSON 对象，分别保存为 UTF-8 编码的 `.json` 文件，即可在千千结里导入。

### 示例 A：全静态「霓虹赛博」

特点：深蓝黑底色、荧光青强调色、玫红危险提示、冷紫蓝信息色。所有颜色都是静态色，不跟随酒馆切换。

```json
{
  "format": "qqj-custom-themes",
  "schemaVersion": 1,
  "exportedAt": "2026-11-14T08:00:00.000Z",
  "items": [
    {
      "id": "cyber-neon-city",
      "name": "霓虹赛博 · Neon City",
      "variables": {
        "paper": "#080D1A",
        "panel": "#111A2C",
        "ink": "#EAFBFF",
        "soft": "#A8BCD3",
        "faint": "#6D819B",
        "line": "#263B5A",
        "thread": "#34506F",
        "crimson": "#FF4F87",
        "knot": "#00E5FF",
        "onPrimary": "auto",
        "blue": "#7C83FF",
        "success": "#58E6A5"
      },
      "createdAt": "2026-11-14T08:00:00.000Z",
      "updatedAt": "2026-11-14T08:00:00.000Z"
    }
  ]
}
```

### 示例 B：动态「跟随酒馆」

特点：页面底色、卡片、文字、边框和强调色跟随酒馆主题；三个语义色保持固定，主强调色文字由千千结自动计算。

```json
{
  "format": "qqj-custom-themes",
  "schemaVersion": 1,
  "exportedAt": "2026-11-14T08:00:00.000Z",
  "items": [
    {
      "id": "host-following-soft",
      "name": "酒馆跟随 · Soft Host",
      "variables": {
        "paper": "var(--SmartThemeBlurTintColor, #F7F8FA)",
        "panel": "var(--SmartThemeChatTintColor, #FFFFFF)",
        "ink": "var(--SmartThemeBodyColor, #22282B)",
        "soft": "var(--SmartThemeEmColor, #637077)",
        "faint": "var(--SmartThemeEmColor, #929DA2)",
        "line": "var(--SmartThemeBorderColor, #DCE2E5)",
        "thread": "var(--SmartThemeBorderColor, #CBD4D8)",
        "crimson": "#B63745",
        "knot": "var(--SmartThemeQuoteColor, #B63745)",
        "onPrimary": "auto",
        "blue": "#3B706A",
        "success": "#3D6F55"
      },
      "createdAt": "2026-11-14T08:00:00.000Z",
      "updatedAt": "2026-11-14T08:00:00.000Z"
    }
  ]
}
```

---

## 7. 如何导入主题

1. 将 AI 返回的 JSON 内容保存为一个文件，例如 `my-theme.json`。确认文件是纯 JSON，不包含 Markdown 代码围栏或解释文字。
2. 打开 SillyTavern 中的「千千结 → 设置 → 通用设置 → 外观」。
3. 找到「自定义主题」区块，点击「导入主题」并选择刚才保存的 JSON 文件。
4. 导入完成后，主题会出现在主题卡片列表中。点击「应用」即可启用。
5. 若主题名称或颜色需要调整，可以点击该主题卡片的「编辑」。

### 导入时需要知道的限制

- 当前主题库最多保存 **50 套主题**。
- 单个导入文件最大为 **1 MiB**。
- 文件顶层格式或版本不正确时，整个文件会被拒绝。
- 文件中某个主题不合法时，该主题会被跳过，其他合法主题仍可导入。
- 如果导入主题的 `id` 与已有主题重复，导入器会为新主题生成不冲突的 ID，不会覆盖原主题。
- 导入后不会自动应用主题，需要手动点击「应用」。

---

## 8. 给玩家的最后建议

把你喜欢的图片、配色参考或风格关键词发给 AI，再附上本指南中的「给 AI 的开场提示词」。你可以让 AI 先给出一套完整配色，也可以要求它生成多个不同方向的主题包。

**记住三个最重要的规则：**

1. 12 个变量一个不能少。
2. `onPrimary` 一律为 `"auto"`；`crimson`、`blue`、`success` 一律为静态 HEX。
3. 绝不允许 `url()`、`javascript:`、外部链接或任意 CSS / 脚本内容。

只要主题包结构正确、颜色值符合安全规则，就可以通过千千结的主题导入器进行校验和导入。
