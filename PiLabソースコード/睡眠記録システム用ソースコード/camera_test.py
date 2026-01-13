#!/usr/bin/env python3
"""
カメラテストスクリプト
libcamera-jpegを直接呼び出してキャプチャ
"""

import os
import subprocess
import time

# 保存先ディレクトリ
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

print("カメラテストスクリプト - libcamera-jpeg直接使用")
print("=" * 50)

output_path = os.path.join(SCRIPT_DIR, "test_libcamera_direct.jpg")

# libcamera-jpegで直接キャプチャ
cmd = [
    "libcamera-jpeg",
    "-o", output_path,
    "--width", "640",
    "--height", "480",
    "-t", "1000",  # 1秒後にキャプチャ
    "-n"  # プレビューなし
]

print(f"実行: {' '.join(cmd)}")
result = subprocess.run(cmd, capture_output=True, text=True)

if result.returncode == 0:
    print(f"成功! 保存先: {output_path}")
    print(f"ファイルサイズ: {os.path.getsize(output_path)} bytes")
else:
    print(f"エラー: {result.stderr}")

print("\n" + "=" * 50)
print("test_libcamera_direct.jpg とlibcamera_capture.jpg を比較してください")
