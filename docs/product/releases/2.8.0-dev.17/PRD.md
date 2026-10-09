# Maple 字体与配色

用户来源：https://github.com/subframe7536/maple-font/blob/v7/README_CN.md

目标：Studio使用参考字体和截图所链接的Maple主题配色。默认按整个Studio界面处理，使用Maple Mono NF CN、深灰底与低饱和蓝/紫/绿/暖色；保留深浅模式与现有布局、操作流程。HMI文字统一字体，其车机黑色材质背景保留。

实施：自托管常规字重191个woff2分片及unicode-range；其他字重由浏览器合成。CSS取消local()以避免不同电脑已装字体的版本差异。字体原始字节不改动，保留许可证。无需访问外部CDN即可渲染。

配色来源：https://github.com/subframe7536/vscode-theme-maple 。主色取自官方Maple，语义色阶和浅色控件做应用适配，不宣称逐像素复刻编辑器截图。

非目标：修改节点行为、模型、项目数据、HMI3D模型、独立Bloub动画对照页。

## 2026-09-20 标题动效补充

用户指定 https://reactbits.dev/text-animations/shuffle 。首页标题采用官方Shuffle及示例同款Press Start 2P像素字体，保留大小写、浅绿到蓝渐变与Logo横排居中。首次进入与鼠标移入播放一次，不循环；像素字体只作用标题，其他界面保留Maple。尊重减少动态效果，字体本地随构建产物加载。
