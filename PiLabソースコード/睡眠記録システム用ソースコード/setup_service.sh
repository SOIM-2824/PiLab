#!/bin/bash
# 睡眠レコーダー systemdサービス セットアップスクリプト
# 使用方法: sudo bash setup_service.sh

echo "=== 睡眠レコーダー サービス セットアップ ==="

# サービスファイルをコピー
echo "[1/5] サービスファイルをインストール..."
cp /home/admin/Desktop/pi/sleep/sleep_recorder.service /etc/systemd/system/
chmod 644 /etc/systemd/system/sleep_recorder.service

# systemdをリロード
echo "[2/5] systemdをリロード..."
systemctl daemon-reload

# sudoers設定（www-dataがパスワードなしでサービス制御可能に）
echo "[3/5] sudoers設定..."
SUDOERS_FILE="/etc/sudoers.d/sleep_recorder"
echo "# Sleep Recorder service control for www-data" > $SUDOERS_FILE
echo "www-data ALL=(ALL) NOPASSWD: /bin/systemctl start sleep_recorder" >> $SUDOERS_FILE
echo "www-data ALL=(ALL) NOPASSWD: /bin/systemctl stop sleep_recorder" >> $SUDOERS_FILE
echo "www-data ALL=(ALL) NOPASSWD: /bin/systemctl is-active sleep_recorder" >> $SUDOERS_FILE
chmod 440 $SUDOERS_FILE

# ディレクトリ・ファイル権限設定（adminユーザー用）
echo "[4/5] ディレクトリ・ファイル権限設定..."
chown admin:admin /home/admin/Desktop/pi/sleep
chmod 755 /home/admin/Desktop/pi/sleep

# ログファイルとステータスファイルを作成（adminユーザー所有）
touch /home/admin/Desktop/pi/sleep/output.log
touch /home/admin/Desktop/pi/sleep/error.log
touch /home/admin/Desktop/pi/sleep/sleep_status.json
touch /home/admin/Desktop/pi/sleep/sleep_recorder.pid
chown admin:admin /home/admin/Desktop/pi/sleep/output.log
chown admin:admin /home/admin/Desktop/pi/sleep/error.log
chown admin:admin /home/admin/Desktop/pi/sleep/sleep_status.json
chown admin:admin /home/admin/Desktop/pi/sleep/sleep_recorder.pid
chmod 644 /home/admin/Desktop/pi/sleep/*.log
chmod 644 /home/admin/Desktop/pi/sleep/sleep_status.json
chmod 644 /home/admin/Desktop/pi/sleep/sleep_recorder.pid

# CSVファイルを作成（存在しない場合）
echo "[5/7] CSVファイルの準備..."
CSV_FILE="/home/admin/Desktop/pi/sleep/sleep_records.csv"
if [ ! -f "$CSV_FILE" ]; then
    echo "date,sleep_start,sleep_end,duration_hours,duration_minutes,snore_detected" > "$CSV_FILE"
    chown admin:admin "$CSV_FILE"
fi
chmod 644 "$CSV_FILE"

# Webからアクセスできるようにシンボリックリンクを作成
echo "[6/7] CSVシンボリックリンク作成..."
mkdir -p /var/www/html/data
ln -sf /home/admin/Desktop/pi/sleep/sleep_records.csv /var/www/html/data/sleep_records.csv
chown -h www-data:www-data /var/www/html/data/sleep_records.csv

# Apache再起動
echo "[7/7] Apache再起動..."
systemctl restart apache2

echo ""
echo "=== セットアップ完了！ ==="
echo ""
echo "サービスを手動でテスト："
echo "  sudo systemctl start sleep_recorder"
echo "  sudo systemctl status sleep_recorder"
echo "  sudo systemctl stop sleep_recorder"
echo ""
echo "ブラウザで「記録開始」をクリックしてテストしてください！"
