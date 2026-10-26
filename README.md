# InfinityCodeView

在二维无限画布中阅读项目，用自己摆放的文件位置建立空间记忆。基于 Tauri 2、React、TypeScript 和 DOM。

目前是第一阶段的可运行原型：项目读取、空间布局与只读代码浏览。

## 运行

需要 Node.js、pnpm、Rust 及系统的 [Tauri 开发环境](https://v2.tauri.app/start/prerequisites/)。

```sh
pnpm install
pnpm tauri dev
```

`pnpm dev` 仅运行浏览器界面，可点击“体验示例”验证画布交互。本地目录选择和项目读取需要 Tauri 桌面应用。

## 使用

- 点击“打开项目”，选择目录。扫描遵循嵌套 `.gitignore`，不展示 `.git`，不跟随符号链接。
- 滚轮围绕鼠标缩放；中键拖动视野；`F` 适应全图。缩小时按目录层级折叠为大标题，双击大标题逐层展开。
- 选中的文件在任何缩放下都显示完整内容，所有祖先目录保持展开、取消覆盖式大标题；支持多选，取消选中后恢复正常概览。
- 宏观视图卸载未选中文件的代码和折叠目录的内部节点，放大到文字可读时才显示源码；边框随缩放补偿粗细。标题自动缩放、必要时换行，完整居中且不超出框。
- 拖动文件或文件夹标题改变位置。文件夹随内容伸缩，拖动文件夹会带动全部子项。
- 空白处左键拖动框选；`Shift` 点击标题追加/取消选择，再拖动任意选中标题批量移动。
- 代码可以选中、复制，不能编辑；拖动右侧边缘（含右下角）改变卡片宽度，代码自动换行。新代码卡片默认宽 1024px，至少容纳 120 个等宽字符；已保存的自定义宽度继续保留。
- 左侧查找文件并点击定位。右上角切换明暗主题，暗色配色参考 [VS Code Dark Modern](https://github.com/microsoft/vscode/blob/main/extensions/theme-defaults/themes/dark_modern.json)。
- 文件卡片按后缀和特殊文件名配色（CSS 粉、JS 黄、TS 蓝），常见目录名也有配色；大标题使用淡填充、彩色文字与边框，展开后保留源码语法高亮。文件与目录关联参考 [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme)，并为明暗主题调整了文字对比度。
- 选择单个文件夹，点击“整理这个文件夹”仅排列其直接子项。
- “重置布局”清除整个项目的旧位置与宽度，使用当前默认宽度重新排布并自动保存。本次打开项目期间可用“撤销重置”恢复最近一次重置前的布局与视口。
- “刷新”重新读取磁盘，保留已有节点位置。新增文件寻找空位；删除和代码增长不触发整体重排。
- 点击“保存布局”或 `Cmd/Ctrl+S` 保存布局与视口。切换项目时先保存当前布局。

布局保存到 Tauri 应用数据目录的 `layouts/` 子目录，不修改被阅读项目。macOS 路径为 `~/Library/Application Support/com.fittencode.infinity-code-view/layouts/`。示例布局保存到 WebView 的 localStorage。

## 验证

```sh
pnpm test
pnpm build
cd src-tauri
cargo test --lib
cargo clippy --all-targets -- -D warnings
```

## 当前边界与后续

当前以手动刷新同步变化，同层节点允许重叠。代码文件按支持的扩展名识别，UTF-8 且不超过 2 MiB 时展示全文；其他文件使用紧凑卡片。大项目的视口范围剔除与高亮调度、碰撞模式、布局撤销、自动监视、批注、连线与可重定位锚点尚未实现。

下一步建议加入“文件/文件夹批注 → 代码片段批注 → 连线与锚点解析”，详见 [架构说明](docs/architecture.md)。
