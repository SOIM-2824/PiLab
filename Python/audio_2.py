import pyaudio
import numpy as np
import time

cnt_1 = 0
cnt_2 = 0
CHUNK = 16000
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000

def is_snore(audio_data, rms_threshold=1000, ratio_threshold=0.01):
    try:
        rms = np.sqrt(np.mean(audio_data**2))
        fft = np.fft.fft(audio_data)
        freqs = np.fft.fftfreq(len(audio_data), 1/RATE)
        fft_magnitude = np.abs(fft)
        low_freq_power = np.sum(fft_magnitude[(freqs > 100) & (freqs < 300)])
        ratio = low_freq_power / np.sum(fft_magnitude)
        print(f"RMS: {rms:.1f}, low_freq_ratio: {ratio:.2f}")
        return rms > rms_threshold and ratio > ratio_threshold
    except Exception as e:
        print(f"例外発生: {e}")
        return False

p = pyaudio.PyAudio()
stream = p.open(format=FORMAT, channels=CHANNELS, rate=RATE, input=True, frames_per_buffer=CHUNK, input_device_index=2)

print("リアルタイムいびき検出スタート（Ctrl+Cで終了）")

try:
    while True:
        data = stream.read(CHUNK, exception_on_overflow=False)
        audio_data = np.frombuffer(data, dtype=np.int16).astype(np.float32)

        if is_snore(audio_data):
            print("いびき検出！")
            cnt_1 += 1
        else:
            print("いびきなし")
            cnt_2 += 1

except KeyboardInterrupt:
    print("終了します")
finally:
    stream.stop_stream()
    stream.close()
    p.terminate()
