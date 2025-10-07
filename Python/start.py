import subprocess

# 並列に実行したい2つのファイル
p1 = subprocess.Popen(["python", "test.py"])
p2 = subprocess.Popen(["python", "audio_2.py"])

# 両方の処理が終わるのを待つ
p1.wait()
p2.wait()

print("両方のスクリプトが終了しました。")
