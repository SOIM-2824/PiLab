#!/bin/bash
# 睡眠レコーダー権限設定スクリプト
# 使用方法: sudo bash fix_permissions.sh

echo "=== 睡眠レコーダー権限設定 ==="

# sleepディレクトリの権限設定
echo "[1/7] sleepディレクトリの権限設定..."
chown admin:www-data /home/admin/Desktop/pi/sleep
chmod 775 /home/admin/Desktop/pi/sleep

# ファイルの権限設定
echo "[2/7] ファイルの権限設定..."
chown admin:www-data /home/admin/Desktop/pi/sleep/* 2>/dev/null

# 必要なファイルを事前作成
echo "[3/7] 必要なファイルを作成..."
touch /home/admin/Desktop/pi/sleep/error.log
touch /home/admin/Desktop/pi/sleep/sleep_recorder.pid
touch /home/admin/Desktop/pi/sleep/sleep_status.json
chown www-data:www-data /home/admin/Desktop/pi/sleep/error.log
chown www-data:www-data /home/admin/Desktop/pi/sleep/sleep_recorder.pid
chown www-data:www-data /home/admin/Desktop/pi/sleep/sleep_status.json
chmod 664 /home/admin/Desktop/pi/sleep/error.log
chmod 664 /home/admin/Desktop/pi/sleep/sleep_recorder.pid
chmod 664 /home/admin/Desktop/pi/sleep/sleep_status.json

# dataディレクトリの権限設定
echo "[4/7] /var/www/html/data/の権限設定..."
if [ -d "/var/www/html/data" ]; then
    chown -R www-data:www-data /var/www/html/data/
    chmod -R 775 /var/www/html/data/
fi

# www-dataをvideoグループに追加（カメラ用）
echo "[5/7] www-dataをvideoグループに追加..."
usermod -aG video www-data

# www-dataをaudioグループに追加（マイク用）
echo "[6/7] www-dataをaudioグループに追加..."
usermod -aG audio www-data

# pulseaudioディレクトリ作成
echo "[7/7] pulseaudio設定ディレクトリ作成..."
mkdir -p /var/www/.config/pulse
chown www-data:www-data /var/www/.config/pulse

# Apache再起動
echo "Apacheを再起動中..."
systemctl restart apache2

echo ""
echo "=== 完了！==="
echo ""
echo "確認:"
ls -la /home/admin/Desktop/pi/sleep/
echo ""
echo "グループ確認:"
groups www-data
echo ""
echo "ブラウザで「記録開始」をクリックしてください！"
