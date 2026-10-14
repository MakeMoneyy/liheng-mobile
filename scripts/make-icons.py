"""生成练衡的图标与启动图（icon / adaptive-icon / splash-icon / favicon）。

用品牌色板和 App 自带的 Noto Serif SC 字体画「衡」字标记，保证图标与
界面里的字体一致。之所以要这个脚本：`expo-splash-screen` 插件只写了
`backgroundColor` 而没给 `image` 时，prebuild 生成的 Android
`styles.xml` 仍然引用 `@drawable/splashscreen_logo`，但那个 drawable
不会被生成，于是 `:app:processReleaseResources` 链接失败、release APK
打不出来。补上真实的启动图既修了这个构建错误，也让 App 有了应用图标。

用法（在 outputs/liheng-mobile 下）：
    python scripts/make-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

INK = (0x0F, 0x12, 0x0D, 255)
INK_SOLID = (0x0F, 0x12, 0x0D, 255)
PAPER = (0xF4, 0xEF, 0xE3, 255)
GOLD = (0xD8, 0xB2, 0x5C, 150)
ACCENT = (0xD9, 0x54, 0x1F, 255)

ROOT = Path(__file__).resolve().parent.parent
FONT_PATH = ROOT / "node_modules/@expo-google-fonts/noto-serif-sc/700Bold/NotoSerifSC_700Bold.ttf"
ASSETS = ROOT / "assets"
SS = 4  # 先用 4 倍画再缩回来，得到干净的边缘


def render_mark(size: int, background, scale: float, *, glyph_ratio: float, ring_ratio: float) -> Image.Image:
    """画一个「衡」字标记：金色底环 + 朱砂进度弧 + 米黄字。"""
    canvas = size * SS
    image = Image.new("RGBA", (canvas, canvas), background or (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    center = canvas / 2
    radius = ring_ratio * canvas * scale
    width = max(2, round(0.024 * canvas * scale))
    box = [center - radius, center - radius, center + radius, center + radius]

    draw.ellipse(box, outline=GOLD, width=width)
    # 右下那一段朱砂弧，呼应界面里的「净摄入环」。
    draw.arc(box, start=-54, end=40, fill=ACCENT, width=width)

    font = ImageFont.truetype(str(FONT_PATH), round(glyph_ratio * canvas * scale))
    left, top, right, bottom = draw.textbbox((0, 0), "衡", font=font)
    draw.text(
        (center - (right + left) / 2, center - (bottom + top) / 2),
        "衡",
        font=font,
        fill=PAPER,
    )

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    if not FONT_PATH.exists():
        raise SystemExit(f"找不到字体：{FONT_PATH}（先跑 npm ci）")
    ASSETS.mkdir(exist_ok=True)

    outputs = {
        # 应用图标：满幅深墨绿底，内容占满。
        "icon.png": render_mark(1024, INK, 1.0, glyph_ratio=0.42, ring_ratio=0.34),
        # Android 自适应图标前景：透明底，内容缩到 62% 以内躲开圆形遮罩。
        "adaptive-icon.png": render_mark(1024, None, 0.62, glyph_ratio=0.42, ring_ratio=0.34),
        # 启动图：背景由 app.json 的 backgroundColor 提供，这里只留标记本身。
        "splash-icon.png": render_mark(1024, None, 1.15, glyph_ratio=0.40, ring_ratio=0.34),
        # 网页版小图标。
        "favicon.png": render_mark(64, INK_SOLID, 1.0, glyph_ratio=0.5, ring_ratio=0.36),
    }

    for name, image in outputs.items():
        path = ASSETS / name
        image.save(path, "PNG", optimize=True)
        print(f"{path.relative_to(ROOT)}  {image.size[0]}x{image.size[1]}  {path.stat().st_size} B")


if __name__ == "__main__":
    main()
