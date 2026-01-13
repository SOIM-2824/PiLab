"""
睡眠記録システム - 赤外線カメラ対応版
カメラとマイクを使用して睡眠を検知・記録するプログラム
キャリブレーション機能付き
Raspberry Pi (libcamera) / PC (OpenCV) 両対応
Web制御対応（ヘッドレスモード）
"""

import cv2
import numpy as np
import pyaudio
import threading
import time
import csv
import os
import platform
import signal
import sys
import json
import argparse
import subprocess
from datetime import datetime
from collections import deque

# Raspberry Pi判定
IS_RASPBERRY_PI = platform.machine().startswith('arm') or platform.machine().startswith('aarch')
if IS_RASPBERRY_PI:
    print("Raspberry Pi検出: libcameraを使用します")

# ========== 設定 ==========
SLEEP_THRESHOLD_SECONDS = 300  # 睡眠判定に必要な継続時間（5分）
WAKE_GRACE_PERIOD = 30  # 起床判定の猶予時間（30秒）
SNORE_WINDOW_SECONDS = 60  # いびき判定のウィンドウ（60秒以内に）
SNORE_COUNT_THRESHOLD = 3  # この回数いびきが検出されたら睡眠判定
ROLLOVER_GRACE_PERIOD = 5  # 寝返り判定の猶予時間（5秒以内の動きは無視）
CALIBRATION_TIME = 10  # キャリブレーション時間（秒）

# CSVファイルのパス（スクリプトと同じディレクトリに保存）
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(SCRIPT_DIR, "sleep_records.csv")

# PIDファイルとステータスファイル（Web制御用）
PID_FILE = os.path.join(SCRIPT_DIR, "sleep_recorder.pid")
STATUS_FILE = os.path.join(SCRIPT_DIR, "sleep_recorder_status.json")

# いびき検出設定
SNORE_FREQ_LOW = 100
SNORE_FREQ_HIGH = 500

# 呼吸パターン検出設定
BREATHING_FREQ_LOW = 10  # 呼吸周波数下限(Hz)
BREATHING_FREQ_HIGH = 50  # 呼吸周波数上限(Hz)

# 履歴サイズ（安定化用）
MOTION_HISTORY_SIZE = 60  # 2秒分（30fps想定）
AUDIO_HISTORY_SIZE = 60


class CameraMonitor:
    """赤外線カメラ対応の動き検知と顔検出（PC/Raspberry Pi両対応）"""
    
    def __init__(self):
        self.prev_frame = None
        self.motion_detected = False
        self.motion_level = 0
        self.motion_threshold = 50000  # キャリブレーションで調整
        
        # カメラの初期化（プラットフォーム別）
        self.use_libcamera = False
        self.libcamera_process = None
        self.cap = None
        self.frame_width = 640
        self.frame_height = 480
        
        if IS_RASPBERRY_PI:
            try:
                import tempfile
                
                # 一時ディレクトリ
                self.temp_dir = tempfile.mkdtemp()
                self.temp_jpeg = os.path.join(self.temp_dir, "frame.jpg")
                
                # libcamera-vidをMJPEGモードでバックグラウンド起動
                self.libcamera_process = subprocess.Popen(
                    [
                        "libcamera-vid",
                        "-t", "0",  # 無限に実行
                        "--width", str(self.frame_width),
                        "--height", str(self.frame_height),
                        "--codec", "mjpeg",
                        "--framerate", "15",
                        "-n",  # プレビューなし
                        "-o", "-"  # stdout出力
                    ],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    bufsize=10**6
                )
                self.use_libcamera = True
                self.latest_frame = None
                self.frame_lock = threading.Lock()
                self.reader_running = True
                
                # 別スレッドでフレームを読み取り
                self.reader_thread = threading.Thread(target=self._read_frames)
                self.reader_thread.daemon = True
                self.reader_thread.start()
                
                # カメラが安定するまで待機
                print("カメラ起動中... ", end="", flush=True)
                time.sleep(1)
                print("OK")
                print("libcamera-vidでカメラを起動しました（フルFOVモード）")
            except Exception as e:
                print(f"libcameraの起動に失敗: {e}")
                self.use_libcamera = False
        
        if not self.use_libcamera:
            self.cap = cv2.VideoCapture(0)
            if not self.cap.isOpened():
                print("警告: カメラが開けませんでした")
        
        # 動きの履歴（安定した判定のため）- 拡大
        self.motion_history = deque(maxlen=MOTION_HISTORY_SIZE)
        
        # 寝返り検出用
        self.rollover_start = None
        self.is_rollover = False
        
        # グレースケール表示用
        self.gray_frame = None
        self.diff_frame = None
        
        # Haar Cascadeの読み込み（顔・目検出用）
        # cv2.data がない環境（apt版OpenCV等）への対応
        try:
            cascade_path = cv2.data.haarcascades
        except AttributeError:
            # ラズパイ等のシステムパス
            cascade_path = '/usr/share/opencv4/haarcascades/'
            if not os.path.exists(cascade_path):
                cascade_path = '/usr/share/opencv/haarcascades/'
        
        self.face_cascade = cv2.CascadeClassifier(
            cascade_path + 'haarcascade_frontalface_default.xml'
        )
        self.eye_cascade = cv2.CascadeClassifier(
            cascade_path + 'haarcascade_eye.xml'
        )
        
        # 検出位置を保存
        self.faces = []
        self.eyes = []
    
    def _read_frames(self):
        """別スレッドでlibcameraからフレームを読み取り"""
        jpeg_buffer = b""
        while self.reader_running:
            try:
                chunk = self.libcamera_process.stdout.read(32768)
                if not chunk:
                    continue
                
                jpeg_buffer += chunk
                
                # JPEGの終端マーカーを探す
                while b'\xff\xd9' in jpeg_buffer:
                    end_idx = jpeg_buffer.find(b'\xff\xd9') + 2
                    start_idx = jpeg_buffer.rfind(b'\xff\xd8', 0, end_idx)
                    
                    if start_idx >= 0:
                        jpeg_data = jpeg_buffer[start_idx:end_idx]
                        jpeg_buffer = jpeg_buffer[end_idx:]
                        
                        # JPEGをデコード
                        nparr = np.frombuffer(jpeg_data, np.uint8)
                        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                        if frame is not None:
                            with self.frame_lock:
                                self.latest_frame = frame
                    else:
                        break
            except Exception as e:
                if self.reader_running:
                    print(f"フレーム読み取りエラー: {e}")
                break
    
    def _capture_frame(self):
        """プラットフォームに応じてフレームを取得"""
        if self.use_libcamera:
            with self.frame_lock:
                if self.latest_frame is not None:
                    return True, self.latest_frame.copy()
            return False, None
        elif self.cap:
            return self.cap.read()
        return False, None
    
    def update(self):
        """フレームを取得して動きを更新"""
        ret, frame = self._capture_frame()
        if not ret or frame is None:
            return None
        
        # デバッグ: フレームサイズを最初の1回だけ表示
        if not hasattr(self, '_frame_size_printed'):
            print(f"取得フレームサイズ: {frame.shape[1]}x{frame.shape[0]}")
            self._frame_size_printed = True
        
        # グレースケール変換（赤外線カメラ用）
        self.gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # ノイズ除去
        blurred = cv2.GaussianBlur(self.gray_frame, (21, 21), 0)
        
        # 動き検知
        self.motion_level = 0
        self.diff_frame = None
        
        if self.prev_frame is not None:
            self.diff_frame = cv2.absdiff(self.prev_frame, blurred)
            _, thresh = cv2.threshold(self.diff_frame, 25, 255, cv2.THRESH_BINARY)
            self.motion_level = np.sum(thresh) / 255  # ピクセル数として計算
            
            # 履歴に追加
            self.motion_history.append(self.motion_level)
            
            # 過去のフレームの平均で判定（安定化）
            avg_motion = np.mean(self.motion_history) if self.motion_history else 0
            raw_motion = avg_motion > self.motion_threshold
            
            # 寝返り判定（5秒以内の動きは寝返りとして無視）
            current_time = time.time()
            if raw_motion:
                if self.rollover_start is None:
                    self.rollover_start = current_time
                
                rollover_duration = current_time - self.rollover_start
                if rollover_duration < ROLLOVER_GRACE_PERIOD:
                    # 寝返り中（動きを無視）
                    self.is_rollover = True
                    self.motion_detected = False
                else:
                    # 寝返りではない本当の動き
                    self.is_rollover = False
                    self.motion_detected = True
            else:
                self.rollover_start = None
                self.is_rollover = False
                self.motion_detected = False
        
        self.prev_frame = blurred.copy()
        
        # 顔と目の検出
        self.faces = self.face_cascade.detectMultiScale(
            self.gray_frame, scaleFactor=1.3, minNeighbors=5, minSize=(30, 30)
        )
        self.eyes = []
        
        # グレースケール画像を3チャンネルに変換して返す
        display_frame = cv2.cvtColor(self.gray_frame, cv2.COLOR_GRAY2BGR)
        
        # 顔と目の枠を描画
        for (x, y, w, h) in self.faces:
            cv2.rectangle(display_frame, (x, y), (x+w, y+h), (0, 255, 0), 2)
            cv2.putText(display_frame, "Face", (x, y-10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            
            # 顔の領域内で目を検出
            roi_gray = self.gray_frame[y:y+h, x:x+w]
            detected_eyes = self.eye_cascade.detectMultiScale(roi_gray, 1.1, 3)
            
            for (ex, ey, ew, eh) in detected_eyes:
                # 絶対座標に変換
                abs_ex, abs_ey = x + ex, y + ey
                self.eyes.append((abs_ex, abs_ey, ew, eh))
                cv2.rectangle(display_frame, (abs_ex, abs_ey), (abs_ex+ew, abs_ey+eh), (255, 0, 255), 2)
                cv2.putText(display_frame, "Eye", (abs_ex, abs_ey-5), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 0, 255), 1)
        
        return display_frame
    
    def calibrate(self, duration=10):
        """キャリブレーション - 静止状態のノイズレベルを測定"""
        print(f"\n動かないでください... ({duration}秒間キャリブレーション)")
        
        motion_samples = []
        start_time = time.time()
        
        while time.time() - start_time < duration:
            ret, frame = self._capture_frame()
            if not ret or frame is None:
                continue
            
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            blurred = cv2.GaussianBlur(gray, (21, 21), 0)
            
            if self.prev_frame is not None:
                diff = cv2.absdiff(self.prev_frame, blurred)
                _, thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
                motion = np.sum(thresh) / 255
                motion_samples.append(motion)
            
            self.prev_frame = blurred.copy()
            
            remaining = int(duration - (time.time() - start_time))
            print(f"\rキャリブレーション中... 残り{remaining}秒  ", end="", flush=True)
            time.sleep(0.1)
        
        if motion_samples:
            avg_motion = np.mean(motion_samples)
            std_motion = np.std(motion_samples)
            # 平均 + 3標準偏差を閾値に設定
            self.motion_threshold = avg_motion + std_motion * 3
            print(f"\n動き検知閾値を設定: {self.motion_threshold:.0f}")
        
        return self.motion_threshold
    
    def get_status(self):
        """現在の状態を取得"""
        eyes_open = len(self.eyes) > 0  # 目が検出されたらOpen
        return {
            'motion': self.motion_detected,
            'motion_level': self.motion_level,
            'threshold': self.motion_threshold,
            'face_detected': len(self.faces) > 0,
            'face_count': len(self.faces),
            'eyes_open': eyes_open,
            'eye_count': len(self.eyes)
        }
    
    def release(self):
        """リソースを解放"""
        if self.use_libcamera:
            # 読み取りスレッドを停止
            self.reader_running = False
            if hasattr(self, 'reader_thread'):
                self.reader_thread.join(timeout=1)
            
            if self.libcamera_process:
                try:
                    self.libcamera_process.terminate()
                    self.libcamera_process.wait(timeout=2)
                except:
                    try:
                        self.libcamera_process.kill()
                    except:
                        pass
            
            # 一時ディレクトリのクリーンアップ
            if hasattr(self, 'temp_dir'):
                import shutil
                try:
                    shutil.rmtree(self.temp_dir)
                except:
                    pass
        if self.cap:
            self.cap.release()


class AudioMonitor:
    """マイクによる音量検知といびき・呼吸パターン検出"""
    
    def __init__(self):
        self.audio = None
        self.audio_available = False
        self.stream = None
        self.is_silent = True
        self.snore_detected = False
        self.breathing_detected = False  # 呼吸パターン検出
        self.running = False
        self.thread = None
        
        # オーディオ設定
        self.rate = 44100
        self.chunk = 4096
        
        # 波形データを保存
        self.waveform = np.zeros(self.chunk)
        self.volume = 0
        self.silence_threshold = 300  # キャリブレーションで調整
        self.snore_threshold = 5000
        self.breathing_threshold = 1000  # 呼吸パターン閾値
        
        # 音量の履歴 - 拡大
        self.volume_history = deque(maxlen=AUDIO_HISTORY_SIZE)
        
        # 呼吸パターン履歴
        self.breathing_history = deque(maxlen=30)
        
        # PyAudioの初期化（音声デバイスがない場合でも動作）
        try:
            self.audio = pyaudio.PyAudio()
            # 入力デバイスがあるか確認
            device_count = self.audio.get_device_count()
            for i in range(device_count):
                info = self.audio.get_device_info_by_index(i)
                if info.get('maxInputChannels', 0) > 0:
                    self.audio_available = True
                    break
            if self.audio_available:
                print("オーディオデバイスを検出しました")
            else:
                print("警告: 入力オーディオデバイスが見つかりません（音声機能無効）")
        except Exception as e:
            print(f"警告: オーディオ初期化に失敗しました: {e}（音声機能無効）")
    
    def start(self):
        """音声モニタリングを開始"""
        if not self.audio_available or not self.audio:
            print("音声モニタリングをスキップ（デバイスなし）")
            return
        
        try:
            self.stream = self.audio.open(
                format=pyaudio.paInt16,
                channels=1,
                rate=self.rate,
                input=True,
                frames_per_buffer=self.chunk
            )
            self.running = True
            self.thread = threading.Thread(target=self._monitor_loop)
            self.thread.daemon = True
            self.thread.start()
        except Exception as e:
            print(f"警告: オーディオストリーム開始に失敗: {e}")
    
    def _monitor_loop(self):
        """音声モニタリングのメインループ"""
        while self.running:
            try:
                data = self.stream.read(self.chunk, exception_on_overflow=False)
                audio_data = np.frombuffer(data, dtype=np.int16)
                
                # 音量レベルの計算
                self.volume = np.abs(audio_data).mean()
                self.volume_history.append(self.volume)
                
                # 過去の平均で判定（安定化）
                avg_volume = np.mean(self.volume_history) if self.volume_history else 0
                self.is_silent = avg_volume < self.silence_threshold
                
                # 波形データを保存
                self.waveform = audio_data.copy()
                
                # いびき・呼吸パターン検出（FFT分析）
                self._detect_snore_and_breathing(audio_data)
                
            except Exception as e:
                print(f"Audio error: {e}")
                time.sleep(0.1)
    
    def _detect_snore_and_breathing(self, audio_data):
        """FFTを使用していびきと呼吸パターンを検出"""
        fft_data = np.abs(np.fft.fft(audio_data))
        freqs = np.fft.fftfreq(len(audio_data), 1/self.rate)
        
        # いびき検出 (100-500Hz)
        snore_mask = (freqs >= SNORE_FREQ_LOW) & (freqs <= SNORE_FREQ_HIGH)
        snore_power = np.sum(fft_data[snore_mask])
        self.snore_detected = snore_power > self.snore_threshold
        
        # 呼吸パターン検出 (10-50Hz の低周波)
        breathing_mask = (freqs >= BREATHING_FREQ_LOW) & (freqs <= BREATHING_FREQ_HIGH)
        breathing_power = np.sum(fft_data[breathing_mask])
        
        # 呼吸の規則性を履歴で判定
        self.breathing_history.append(breathing_power)
        
        if len(self.breathing_history) >= 10:
            # 規則的なパターンがあれば呼吸と判定
            std_breathing = np.std(self.breathing_history)
            mean_breathing = np.mean(self.breathing_history)
            
            # 変動係数が一定範囲内なら規則的な呼吸
            if mean_breathing > 0:
                cv = std_breathing / mean_breathing
                self.breathing_detected = 0.1 < cv < 0.8 and mean_breathing > self.breathing_threshold
            else:
                self.breathing_detected = False
        else:
            self.breathing_detected = False
    
    def calibrate(self, duration=10):
        """キャリブレーション - 静寂時のノイズレベルを測定"""
        if not self.audio_available or not self.audio:
            print("音声キャリブレーションをスキップ（デバイスなし）")
            return self.silence_threshold, self.snore_threshold
        
        print(f"\n静かにしてください... ({duration}秒間キャリブレーション)")
        
        # 一時的にストリームを開く
        try:
            stream = self.audio.open(
                format=pyaudio.paInt16,
                channels=1,
                rate=self.rate,
                input=True,
                frames_per_buffer=self.chunk
            )
        except Exception as e:
            print(f"警告: オーディオストリームを開けません: {e}")
            return self.silence_threshold, self.snore_threshold
        
        volume_samples = []
        snore_samples = []
        start_time = time.time()
        
        while time.time() - start_time < duration:
            try:
                data = stream.read(self.chunk, exception_on_overflow=False)
                audio_data = np.frombuffer(data, dtype=np.int16)
                
                volume = np.abs(audio_data).mean()
                volume_samples.append(volume)
                
                # いびき帯域のパワー
                fft_data = np.abs(np.fft.fft(audio_data))
                freqs = np.fft.fftfreq(len(audio_data), 1/self.rate)
                mask = (freqs >= SNORE_FREQ_LOW) & (freqs <= SNORE_FREQ_HIGH)
                snore_power = np.sum(fft_data[mask])
                snore_samples.append(snore_power)
                
            except:
                pass
            
            remaining = int(duration - (time.time() - start_time))
            print(f"\rキャリブレーション中... 残り{remaining}秒  ", end="", flush=True)
            time.sleep(0.1)
        
        stream.stop_stream()
        stream.close()
        
        if volume_samples:
            avg_volume = np.mean(volume_samples)
            std_volume = np.std(volume_samples)
            self.silence_threshold = avg_volume + std_volume * 2
            print(f"\n静寂閾値を設定: {self.silence_threshold:.0f}")
        
        if snore_samples:
            avg_snore = np.mean(snore_samples)
            std_snore = np.std(snore_samples)
            self.snore_threshold = avg_snore + std_snore * 5
            print(f"いびき閾値を設定: {self.snore_threshold:.0f}")
        
        return self.silence_threshold, self.snore_threshold
    
    def get_status(self):
        """現在の状態を取得"""
        return {
            'silent': self.is_silent,
            'snore': self.snore_detected,
            'breathing': self.breathing_detected,
            'waveform': self.waveform.copy(),
            'volume': self.volume,
            'threshold': self.silence_threshold
        }
    
    def stop(self):
        """モニタリングを停止"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=1)
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
        self.audio.terminate()


class SleepRecorder:
    """睡眠の判定と記録"""
    
    def __init__(self, headless=False):
        self.headless = headless  # ヘッドレスモード（GUI表示なし）
        self.shutdown_requested = False  # シャットダウンフラグ
        self.start_time = None  # 記録開始時刻
        
        # シグナルハンドラー設定
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)
        
        self.camera = CameraMonitor()
        self.audio = AudioMonitor()
        
        self.is_sleeping = False
        self.sleep_start = None
        self.sleep_candidate_start = None
        self.wake_candidate_start = None  # 起床判定の猶予用
        self.snore_events = []  # いびき検出イベントのタイムスタンプ履歴
        self.last_snore_state = False  # 前回のいびき状態
        self.snore_detected_during_sleep = False
        self.total_sleep_seconds = 0  # 合計睡眠時間
        
        # CSVファイルの初期化
        if not os.path.exists(CSV_FILE):
            with open(CSV_FILE, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow([
                    'date', 'sleep_start', 'sleep_end',
                    'duration_hours', 'duration_minutes', 'snore_detected'
                ])
    
    def _signal_handler(self, signum, frame):
        """シグナルハンドラー（SIGTERM/SIGINT）"""
        print(f"\nシグナル {signum} を受信しました。終了処理を開始...")
        self.shutdown_requested = True
    
    def _write_pid_file(self):
        """PIDファイルを作成"""
        with open(PID_FILE, 'w') as f:
            f.write(str(os.getpid()))
        print(f"PIDファイル作成: {PID_FILE}")
    
    def _remove_pid_file(self):
        """PIDファイルを削除"""
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)
            print("PIDファイル削除")
    
    def _update_status_file(self):
        """ステータスファイルを更新"""
        status = {
            'running': True,
            'headless': self.headless,
            'start_time': self.start_time.strftime('%Y-%m-%d %H:%M:%S') if self.start_time else None,
            'is_sleeping': self.is_sleeping,
            'total_sleep_seconds': self.total_sleep_seconds,
            'last_update': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        with open(STATUS_FILE, 'w', encoding='utf-8') as f:
            json.dump(status, f, ensure_ascii=False, indent=2)
    
    def _clear_status_file(self):
        """ステータスファイルを停止状態に更新"""
        status = {
            'running': False,
            'headless': self.headless,
            'start_time': None,
            'is_sleeping': False,
            'total_sleep_seconds': self.total_sleep_seconds,
            'last_update': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        with open(STATUS_FILE, 'w', encoding='utf-8') as f:
            json.dump(status, f, ensure_ascii=False, indent=2)
    
    def calibrate(self):
        """カメラとマイクのキャリブレーション"""
        print("\n" + "=" * 50)
        print("キャリブレーションを開始します")
        print("=" * 50)
        
        # カメラのキャリブレーション
        self.camera.calibrate(CALIBRATION_TIME)
        
        # マイクのキャリブレーション
        self.audio.calibrate(CALIBRATION_TIME)
        
        print("\n" + "=" * 50)
        print("キャリブレーション完了！")
        print("=" * 50 + "\n")
    
    def _check_sleep_condition(self, camera_status, audio_status):
        """
        睡眠条件をチェック
        睡眠中 = 顔検出あり AND ((動きなし AND 静寂) OR いびき OR 規則的な呼吸パターン)
        顔が検出されていない場合は睡眠判定しない（カメラに映っていない＝寝ていない）
        """
        # 顔が検出されていない場合は睡眠判定しない
        if not camera_status['face_detected']:
            return False
        
        # いびきまたは規則的な呼吸パターンが検出されたら睡眠判定
        if audio_status['snore'] or audio_status.get('breathing', False):
            return True
        
        # 顔が検出されている AND 動きなし AND 静寂 → 睡眠の可能性
        no_motion = not camera_status['motion']
        is_silent = audio_status['silent']
        eyes_closed = not camera_status['eyes_open']  # 目が閉じている
        
        return no_motion and is_silent and eyes_closed
    
    def _check_immediate_sleep(self, audio_status):
        """いびき検出時は即座に睡眠判定"""
        return audio_status['snore']
    
    def _start_sleep(self):
        """睡眠開始を記録"""
        self.is_sleeping = True
        self.sleep_start = datetime.now()
        self.snore_detected_during_sleep = False
        print(f"\n=== 睡眠開始: {self.sleep_start.strftime('%H:%M:%S')} ===")
    
    def _end_sleep(self):
        """睡眠終了を記録してCSVに保存"""
        if not self.is_sleeping or not self.sleep_start:
            return
        
        sleep_end = datetime.now()
        duration = sleep_end - self.sleep_start
        duration_hours = int(duration.total_seconds() // 3600)
        duration_minutes = int((duration.total_seconds() % 3600) // 60)
        
        print(f"\n=== 睡眠終了: {sleep_end.strftime('%H:%M:%S')} ===")
        print(f"睡眠時間: {duration_hours}時間{duration_minutes}分")
        print(f"いびき検出: {'あり' if self.snore_detected_during_sleep else 'なし'}")
        
        # CSVに保存
        with open(CSV_FILE, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                self.sleep_start.strftime('%Y-%m-%d'),
                self.sleep_start.strftime('%H:%M:%S'),
                sleep_end.strftime('%H:%M:%S'),
                duration_hours,
                duration_minutes,
                self.snore_detected_during_sleep
            ])
        
        # 合計睡眠時間に加算
        self.total_sleep_seconds += duration.total_seconds()
        
        self.is_sleeping = False
        self.sleep_start = None
        self.wake_candidate_start = None
    
    def run(self):
        """メインループ"""
        print("睡眠記録システム（赤外線カメラ対応版）")
        if self.headless:
            print("【ヘッドレスモード】GUI表示なし")
        print("-" * 40)
        
        # PIDファイル作成
        self._write_pid_file()
        self.start_time = datetime.now()
        
        # キャリブレーション実行
        self.calibrate()
        
        print("モニタリングを開始します...")
        if not self.headless:
            print("終了するには 'q' キーを押してください")
        else:
            print("終了するにはSIGTERMシグナルを送信してください")
        print("-" * 40)
        
        # GUIモードの場合、リサイズ可能なウィンドウを作成
        if not self.headless:
            cv2.namedWindow('Sleep Recorder (IR)', cv2.WINDOW_NORMAL)
            cv2.resizeWindow('Sleep Recorder (IR)', 800, 600)
        
        self.audio.start()
        
        # ステータス更新カウンター
        status_update_counter = 0
        
        try:
            while not self.shutdown_requested:
                # カメラフレームを取得
                frame = self.camera.update()
                if frame is None:
                    time.sleep(0.033)  # 約30fps
                    continue
                
                # 状態を取得
                camera_status = self.camera.get_status()
                audio_status = self.audio.get_status()
                
                # 睡眠条件をチェック
                sleep_condition = self._check_sleep_condition(
                    camera_status, audio_status
                )
                
                current_time = time.time()
                
                if sleep_condition:
                    # いびきパターン検出（60秒以内に3回でいびきと判定）
                    if audio_status['snore'] and not self.last_snore_state:
                        # いびきの立ち上がりを検出（新しいいびきイベント）
                        self.snore_events.append(current_time)
                    self.last_snore_state = audio_status['snore']
                    
                    # 古いイベントを削除
                    self.snore_events = [t for t in self.snore_events 
                                         if current_time - t < SNORE_WINDOW_SECONDS]
                    
                    # いびきパターンが確認されたら睡眠判定
                    snore_pattern = len(self.snore_events) >= SNORE_COUNT_THRESHOLD
                    if snore_pattern and not self.is_sleeping:
                        self._start_sleep()
                        self.snore_detected_during_sleep = True
                    
                    # 通常の睡眠判定（5分静止）
                    if self.sleep_candidate_start is None:
                        self.sleep_candidate_start = current_time
                    
                    elapsed = current_time - (self.sleep_candidate_start or current_time)
                    
                    if not self.is_sleeping and elapsed >= SLEEP_THRESHOLD_SECONDS:
                        self._start_sleep()
                    
                    if self.is_sleeping and audio_status['snore']:
                        self.snore_detected_during_sleep = True
                    
                    # 睡眠条件を満たしている間は起床カウンターをリセット
                    self.wake_candidate_start = None
                else:
                    # 睡眠条件を満たしていない
                    self.sleep_candidate_start = None
                    
                    if self.is_sleeping:
                        # 起床判定の猶予時間を設ける
                        if self.wake_candidate_start is None:
                            self.wake_candidate_start = current_time
                        
                        wake_elapsed = current_time - self.wake_candidate_start
                        
                        # 猶予時間を超えたら起床と判定
                        if wake_elapsed >= WAKE_GRACE_PERIOD:
                            self._end_sleep()
                
                # ステータスファイル更新（10回に1回）
                status_update_counter += 1
                if status_update_counter >= 30:  # 約1秒ごと
                    self._update_status_file()
                    status_update_counter = 0
                
                # GUI表示（ヘッドレスモードでない場合のみ）
                if not self.headless:
                    # 画面に情報を表示
                    self._draw_status(frame, camera_status, audio_status)
                    cv2.imshow('Sleep Recorder (IR)', frame)
                    
                    # 'q'キーで終了
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        break
                else:
                    # ヘッドレスモードでは少し待機
                    time.sleep(0.033)
        
        finally:
            if self.is_sleeping:
                self._end_sleep()
            
            self.camera.release()
            self.audio.stop()
            
            if not self.headless:
                cv2.destroyAllWindows()
            
            # PIDファイル削除、ステータスをクリア
            self._remove_pid_file()
            self._clear_status_file()
            
            self._print_csv_log()
    
    def _print_csv_log(self):
        """CSVファイルの内容をログに出力"""
        print("\n" + "=" * 50)
        print("睡眠記録 - CSV内容")
        print("=" * 50)
        
        if os.path.exists(CSV_FILE):
            with open(CSV_FILE, 'r', encoding='utf-8') as f:
                reader = csv.reader(f)
                rows = list(reader)
                
                if len(rows) > 0:
                    print(f"\n{'日付':<12} {'開始':<10} {'終了':<10} {'時間':>8} {'いびき':<6}")
                    print("-" * 50)
                    
                    for row in rows[1:]:
                        if len(row) >= 6:
                            date = row[0]
                            start = row[1]
                            end = row[2]
                            hours = row[3]
                            mins = row[4]
                            snore = "あり" if row[5] == "True" else "なし"
                            duration = f"{hours}h {mins}m"
                            print(f"{date:<12} {start:<10} {end:<10} {duration:>8} {snore:<6}")
                    
                    print("-" * 50)
                    print(f"合計記録数: {len(rows) - 1}件")
                else:
                    print("記録がありません")
        else:
            print("CSVファイルがまだ存在しません")
        
        # 今回のセッションの合計睡眠時間を表示
        total_hours = int(self.total_sleep_seconds // 3600)
        total_mins = int((self.total_sleep_seconds % 3600) // 60)
        total_secs = int(self.total_sleep_seconds % 60)
        
        print("\n" + "=" * 50)
        print(f"【今回のセッション合計睡眠時間】")
        print(f"  {total_hours}時間 {total_mins}分 {total_secs}秒")
        print("=" * 50 + "\n")
    
    def _draw_status(self, frame, camera_status, audio_status):
        """画面にステータスを描画"""
        h, w = frame.shape[:2]
        
        # ========== 動き検知の枠 ==========
        if camera_status['motion']:
            cv2.rectangle(frame, (5, 5), (w-5, h-5), (0, 0, 255), 4)
            cv2.putText(frame, "MOTION!", (w//2 - 50, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        else:
            cv2.rectangle(frame, (5, 5), (w-5, h-5), (0, 255, 0), 2)
        
        # ========== ステータスパネル ==========
        cv2.rectangle(frame, (10, 50), (280, 200), (0, 0, 0), -1)
        cv2.rectangle(frame, (10, 50), (280, 200), (255, 255, 255), 1)
        
        # 動きレベル
        motion_pct = min(100, camera_status['motion_level'] / max(camera_status['threshold'], 1) * 100)
        motion_color = (0, 0, 255) if camera_status['motion'] else (0, 255, 0)
        cv2.putText(frame, f"Motion: {motion_pct:.0f}%", (20, 75),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, motion_color, 1)
        
        # 動きバー
        bar_width = int(motion_pct * 1.5)
        cv2.rectangle(frame, (20, 80), (20 + bar_width, 90), motion_color, -1)
        cv2.rectangle(frame, (20, 80), (170, 90), (100, 100, 100), 1)
        
        # 音量レベル
        vol = int(audio_status.get('volume', 0))
        vol_pct = min(100, vol / max(audio_status['threshold'], 1) * 100)
        silent_color = (0, 255, 0) if audio_status['silent'] else (0, 0, 255)
        cv2.putText(frame, f"Volume: {vol_pct:.0f}%", (20, 115),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, silent_color, 1)
        
        # 音量バー
        vol_bar_width = int(vol_pct * 1.5)
        cv2.rectangle(frame, (20, 120), (20 + vol_bar_width, 130), silent_color, -1)
        cv2.rectangle(frame, (20, 120), (170, 130), (100, 100, 100), 1)
        
        # 目の状態（Open/Close）
        eyes_open = camera_status.get('eyes_open', False)
        eye_count = camera_status.get('eye_count', 0)
        if eyes_open:
            eyes_text = f"Eyes: OPEN ({eye_count})"
            eyes_color = (0, 255, 255)  # シアン
        else:
            eyes_text = "Eyes: CLOSED"
            eyes_color = (255, 100, 100)  # 青
        cv2.putText(frame, eyes_text, (180, 75),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, eyes_color, 1)
        
        # いびき検出
        snore_text = "Snore: YES" if audio_status['snore'] else "Snore: No"
        snore_color = (0, 165, 255) if audio_status['snore'] else (128, 128, 128)
        cv2.putText(frame, snore_text, (20, 155),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, snore_color, 1)
        
        # 呼吸パターン検出
        breathing = audio_status.get('breathing', False)
        breath_text = "Breath: YES" if breathing else "Breath: No"
        breath_color = (0, 200, 100) if breathing else (128, 128, 128)
        cv2.putText(frame, breath_text, (180, 115),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, breath_color, 1)
        
        # いびきパターンカウンター
        snore_count = len(self.snore_events)
        if snore_count > 0 and not self.is_sleeping:
            cv2.putText(frame, f"({snore_count}/{SNORE_COUNT_THRESHOLD})", (130, 155),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 165, 255), 1)
        
        # 顔検出状態
        face_detected = camera_status['face_detected']
        face_count = camera_status.get('face_count', 0)
        if face_detected:
            face_text = f"Face: Detected ({face_count})"
            face_color = (0, 255, 0)  # 緑
        else:
            face_text = "Face: Not Found"
            face_color = (100, 100, 100)  # グレー
        cv2.putText(frame, face_text, (180, 155),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, face_color, 1)
        
        # 睡眠状態
        if self.is_sleeping:
            sleep_text = "SLEEPING"
            sleep_color = (0, 255, 0)
        elif not face_detected:
            sleep_text = "No Detection"
            sleep_color = (100, 100, 100)  # グレー
        elif self.sleep_candidate_start:
            remaining = SLEEP_THRESHOLD_SECONDS - (time.time() - self.sleep_candidate_start)
            sleep_text = f"Waiting... {int(remaining)}s"
            sleep_color = (0, 255, 255)
        else:
            sleep_text = "Awake"
            sleep_color = (255, 255, 255)
        
        cv2.putText(frame, sleep_text, (20, 185),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, sleep_color, 2)
        
        # ========== 音声波形の描画 ==========
        waveform = audio_status.get('waveform', np.zeros(100))
        self._draw_waveform(frame, waveform, w, h)
    
    def _draw_waveform(self, frame, waveform, w, h):
        """音声波形を描画"""
        wave_height = 80
        wave_y = h - wave_height - 10
        wave_width = w - 20
        
        cv2.rectangle(frame, (10, wave_y), (10 + wave_width, wave_y + wave_height), 
                      (30, 30, 30), -1)
        cv2.rectangle(frame, (10, wave_y), (10 + wave_width, wave_y + wave_height), 
                      (100, 100, 100), 1)
        
        cv2.putText(frame, "Audio Waveform", (15, wave_y + 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)
        
        num_points = min(wave_width - 20, len(waveform))
        if num_points > 0 and len(waveform) > 0:
            step = len(waveform) // num_points
            if step > 0:
                sampled = waveform[::step][:num_points]
            else:
                sampled = waveform[:num_points]
            
            max_val = max(np.abs(sampled).max(), 1)
            normalized = sampled / max_val
            
            center_y = wave_y + wave_height // 2 + 5
            cv2.line(frame, (15, center_y), (10 + wave_width - 5, center_y), 
                     (80, 80, 80), 1)
            
            points = []
            for i, val in enumerate(normalized):
                x = 15 + i
                y = int(center_y - val * (wave_height // 2 - 10))
                points.append((x, y))
            
            for i in range(1, len(points)):
                color = (0, 255, 255)
                cv2.line(frame, points[i-1], points[i], color, 1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='睡眠記録システム')
    parser.add_argument('--headless', action='store_true', 
                        help='ヘッドレスモード（GUI表示なし）')
    args = parser.parse_args()
    
    recorder = SleepRecorder(headless=args.headless)
    recorder.run()
