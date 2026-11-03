import os
from PIL import Image, ImageDraw, ImageFont
import matplotlib.pyplot as plt
import math

def lowercase_names(directory: str) -> None:
    for root, dirs, files in os.walk(directory, topdown=False):
        # Đổi tên file
        for filename in files:
            old_path = os.path.join(root, filename)
            new_path = os.path.join(root, filename.lower())

            if old_path != new_path:
                os.rename(old_path, new_path)

        # Đổi tên folder con
        for dirname in dirs:
            old_path = os.path.join(root, dirname)
            new_path = os.path.join(root, dirname.lower())

            if old_path != new_path:
                os.rename(old_path, new_path)

def show_numbered_grid(
    image_path: str,
    cell_width: int,
    cell_height: int
) -> None:
    if cell_width <= 0 or cell_height <= 0:
        raise ValueError("Kích thước ô phải lớn hơn 0")

    # Mở ảnh, không sửa file gốc
    with Image.open(image_path) as source:
        image = source.convert("RGB")

    width, height = image.size

    # Số cột và số hàng
    cols = math.ceil(width / cell_width)
    rows = math.ceil(height / cell_height)

    # Vẽ trên bản sao của ảnh
    draw = ImageDraw.Draw(image)

    # Kích thước chữ tự động theo kích thước ô
    font_size = max(12, min(cell_width, cell_height) // 4)

    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except OSError:
        font = ImageFont.load_default()

    for row in range(rows):
        for col in range(cols):
            # Tọa độ góc trên bên trái của ô
            x = col * cell_width
            y = row * cell_height

            # Đánh số từ 0, trái sang phải, trên xuống dưới
            index = row * cols + col

            # Vẽ đường lưới
            draw.rectangle(
                [
                    x,
                    y,
                    min(x + cell_width - 1, width - 1),
                    min(y + cell_height - 1, height - 1)
                ],
                outline="red",
                width=1
            )

            # Vẽ số tại góc trên bên trái của ô
            draw.text(
                (x + 3, y + 3),
                str(index),
                fill="yellow",
                font=font,
                stroke_width=1,
                stroke_fill="black"
            )

    # Hiển thị ảnh, không lưu ra file
    plt.figure(figsize=(12, 8))
    plt.imshow(image)
    plt.axis("off")
    plt.tight_layout()
    plt.show()

# show_numbered_grid(
#     "./public/assets/terrain/tileset/water_foam.png",
#     64, 64
# )

lowercase_names("./public/assets")