import csv
import time
from datetime import datetime

print("checker.py 起動中...（Ctrl+Cで停止）")

# CSVヘッダを作成（初回のみ）
with open("result.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["timestamp", "audio_snore", "camera_sleep", "final_sleep"])

try:
    while True:
        try:
            with open("audio_flag.txt", "r") as f:
                audio_flag = f.read().strip()
        except:
            audio_flag = "0"

        try:
            with open("camera_flag.txt", "r") as f:
                camera_flag = f.read().strip()
        except:
            camera_flag = "0"

        final_sleep = "Sleeping" if audio_flag == "1" and camera_flag == "1" else "Not Sleeping"

        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        with open("result.csv", "a", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([ts, audio_flag, camera_flag, final_sleep])

        print(f"[{ts}] audio: {audio_flag}, camera: {camera_flag} => {final_sleep}")

        time.sleep(1)

except KeyboardInterrupt:
    print("checker.py 終了")
