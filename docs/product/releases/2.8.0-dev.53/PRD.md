# 首页电脑品牌图

2026-09-26。用户提供复古紫色电脑与黑色OpenSparX标志，要求透明抠图、屏幕居中白色Logo、替换首页标题旁黑色X，适配窗口。只改首页品牌图，保持标题字体/渐变/动画与其他入口图标。

使用内置imagegen编辑，保留透明alpha，首稿屏幕图形修正后采用第二稿。最终素材 studio/public/opensparx-retro-computer.png。生成提示：保留复古紫色电脑、键盘、鼠标和颗粒纹理，去除背景为透明；屏幕中央使用原Logo的白色版本，匹配屏幕透视，无额外文字；第二稿只修正Logo内部镂空。提供的新Logo与项目logo.png SHA1相同。

用户指出生成Logo不一致后修正：imagegen仅清空电脑屏幕；网页直接叠加用户原文件 opensparx-screen-mark.png，通过CSS brightness(0) invert(1)显示白色，按屏幕坐标居中并做透视方向倾斜。Logo像素源完全保留，不使用生成标志。

同轮补充：用户要求左上角项目菜单Logo也使用电脑图。提取共享RetroComputerLogo，导航40px、首页自适应宽度，原项目菜单交互不变。
